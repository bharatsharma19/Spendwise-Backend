-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES
create table public.profiles (
  id uuid references auth.users not null primary key,
  email text,
  phone_number text,
  display_name text,
  photo_url text,
  preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  is_email_verified boolean default false,
  is_phone_verified boolean default false,
  status text default 'active',
  last_login_at timestamptz,
  last_logout_at timestamptz
);

alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- GROUPS
create table public.groups (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  description text,
  created_by uuid references public.profiles(id) not null,
  currency text default 'INR',
  settings jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.groups enable row level security;

create policy "Groups are viewable by members."
  on groups for select
  using (
    auth.uid() in (
      select user_id from public.group_members where group_id = id
    )
  );

create policy "Users can create groups."
  on groups for insert
  with check ( auth.uid() = created_by );

create policy "Admins can update groups."
  on groups for update
  using (
    auth.uid() in (
      select user_id from public.group_members where group_id = id and role = 'admin'
    )
  );

-- GROUP MEMBERS
create table public.group_members (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) not null,
  user_id uuid references public.profiles(id) not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(group_id, user_id)
);

alter table public.group_members enable row level security;

create policy "Members are viewable by group members."
  on group_members for select
  using (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );

create policy "Admins can add members."
  on group_members for insert
  with check (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid() and role = 'admin'
    )
    or
    -- Allow self-insert if invited (logic handled in app, but for simplicity allow creator to add initial member)
    (
      group_id in (select id from public.groups where created_by = auth.uid())
    )
  );

-- GROUP EXPENSES
create table public.group_expenses (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) not null,
  paid_by uuid references public.profiles(id) not null,
  amount numeric not null,
  currency text default 'INR',
  category text,
  description text,
  date timestamptz default now(),
  location jsonb,
  tags text[],
  receipt_url text,
  splits jsonb not null, -- Stores array of {user_id, amount, status, paid_at}
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.group_expenses enable row level security;

create policy "Expenses are viewable by group members."
  on group_expenses for select
  using (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );

create policy "Members can add expenses."
  on group_expenses for insert
  with check (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );

create policy "Members can update expenses."
  on group_expenses for update
  using (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );

-- GROUP SETTLEMENTS
create table public.group_settlements (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) not null,
  from_user uuid references public.profiles(id) not null,
  to_user uuid references public.profiles(id) not null,
  amount numeric not null,
  status text default 'pending', -- pending, completed, cancelled
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.group_settlements enable row level security;

create policy "Settlements are viewable by group members."
  on group_settlements for select
  using (
    group_id in (
      select group_id from public.group_members where user_id = auth.uid()
    )
  );

-- NOTIFICATIONS
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  type text not null,
  title text not null,
  message text not null,
  data jsonb,
  read boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications."
  on notifications for select
  using ( auth.uid() = user_id );

create policy "System can insert notifications."
  on notifications for insert
  with check ( true ); -- Ideally restricted to service role, but for now allow insert if logic requires it (e.g. user triggering notification for another)

create policy "Users can update their own notifications."
  on notifications for update
  using ( auth.uid() = user_id );

create policy "Users can delete their own notifications."
  on notifications for delete
  using ( auth.uid() = user_id );


-- RPC: Settle Group Expenses
-- This function calculates the net balances and creates settlement transactions
create or replace function settle_group_expenses(group_id_param uuid)
returns json
language plpgsql
as $$
declare
  member_balances record;
  debtor record;
  creditor record;
  settlement_amount numeric;
  settlements_created json := '[]'::json;
begin
  -- 1. Calculate net balances for each member
  create temp table temp_balances as
  select user_id, sum(amount) as balance
  from (
    -- Amount paid by user (positive)
    select paid_by as user_id, amount
    from group_expenses
    where group_id = group_id_param
    union all
    -- Amount owed by user (negative)
    select (split->>'user_id')::uuid as user_id, -((split->>'amount')::numeric) as amount
    from group_expenses, jsonb_array_elements(splits) as split
    where group_id = group_id_param
  ) as transactions
  group by user_id;

  -- 2. Match debtors and creditors
  -- Simple algorithm: match largest debtor with largest creditor
  loop
    select * into debtor from temp_balances where balance < -0.01 order by balance asc limit 1;
    select * into creditor from temp_balances where balance > 0.01 order by balance desc limit 1;

    exit when debtor is null or creditor is null;

    -- Calculate settlement amount
    settlement_amount := least(abs(debtor.balance), creditor.balance);

    -- Create settlement record
    insert into group_settlements (group_id, from_user, to_user, amount, status)
    values (group_id_param, debtor.user_id, creditor.user_id, settlement_amount, 'pending');

    -- Update balances
    update temp_balances set balance = balance + settlement_amount where user_id = debtor.user_id;
    update temp_balances set balance = balance - settlement_amount where user_id = creditor.user_id;
  end loop;

  drop table temp_balances;

  -- Return created settlements
  select json_agg(t) into settlements_created from (
    select * from group_settlements where group_id = group_id_param and created_at >= now() - interval '1 minute'
  ) t;

  return settlements_created;
end;
$$;
