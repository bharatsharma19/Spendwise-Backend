-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";
create extension if not exists moddatetime schema extensions;

-- 2. CREATE TABLES

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

-- GROUP MEMBERS
create table public.group_members (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) not null,
  user_id uuid references public.profiles(id) not null,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(group_id, user_id)
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
  splits jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- GROUP SETTLEMENTS
create table public.group_settlements (
  id uuid default uuid_generate_v4() primary key,
  group_id uuid references public.groups(id) not null,
  from_user uuid references public.profiles(id) not null,
  to_user uuid references public.profiles(id) not null,
  amount numeric not null,
  status text default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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

-- FRIENDS
create table public.friends (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  friend_id uuid references public.profiles(id) not null,
  status text default 'pending',
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

-- EXPENSES (Personal)
create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) not null,
  amount numeric not null,
  category text,
  description text,
  date timestamptz default now(),
  currency text default 'INR',
  is_recurring boolean default false,
  recurring_frequency text,
  next_due_date timestamptz,
  is_split boolean default false,
  split_details jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. ENABLE RLS
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_expenses enable row level security;
alter table public.group_settlements enable row level security;
alter table public.notifications enable row level security;
alter table public.friends enable row level security;
alter table public.expenses enable row level security;

-- 4. CREATE POLICIES

-- Profiles
create policy "Public profiles are viewable by everyone." on profiles for select using ( true );
create policy "Users can insert their own profile." on profiles for insert with check ( auth.uid() = id );
create policy "Users can update own profile." on profiles for update using ( auth.uid() = id );

-- Groups
create policy "Groups are viewable by members." on groups for select using (
  auth.uid() in ( select user_id from public.group_members where group_id = id )
);
create policy "Users can create groups." on groups for insert with check ( auth.uid() = created_by );
create policy "Admins can update groups." on groups for update using (
  auth.uid() in ( select user_id from public.group_members where group_id = id and role = 'admin' )
);

-- Group Members
create policy "Members are viewable by group members." on group_members for select using (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() )
);
create policy "Admins can add members." on group_members for insert with check (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() and role = 'admin' )
  or
  ( group_id in (select id from public.groups where created_by = auth.uid()) )
);

-- Group Expenses
create policy "Expenses are viewable by group members." on group_expenses for select using (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() )
);
create policy "Members can add expenses." on group_expenses for insert with check (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() )
);
create policy "Members can update expenses." on group_expenses for update using (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() )
);

-- Group Settlements
create policy "Settlements are viewable by group members." on group_settlements for select using (
  group_id in ( select group_id from public.group_members where user_id = auth.uid() )
);

-- Notifications
create policy "Users can view their own notifications." on notifications for select using ( auth.uid() = user_id );
create policy "System can insert notifications." on notifications for insert with check ( true );
create policy "Users can update their own notifications." on notifications for update using ( auth.uid() = user_id );
create policy "Users can delete their own notifications." on notifications for delete using ( auth.uid() = user_id );

-- Friends
create policy "Users can view their own friends." on friends for select using ( auth.uid() = user_id or auth.uid() = friend_id );
create policy "Users can insert friend requests." on friends for insert with check ( auth.uid() = user_id );
create policy "Users can update their own friend requests." on friends for update using ( auth.uid() = user_id or auth.uid() = friend_id );

-- Expenses (Personal)
create policy "Users can view their own expenses." on expenses for select using ( auth.uid() = user_id );
create policy "Users can insert their own expenses." on expenses for insert with check ( auth.uid() = user_id );
create policy "Users can update their own expenses." on expenses for update using ( auth.uid() = user_id );
create policy "Users can delete their own expenses." on expenses for delete using ( auth.uid() = user_id );

-- 5. FUNCTIONS & TRIGGERS

-- Updated At Trigger
create trigger handle_updated_at before update on public.profiles for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.groups for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.group_expenses for each row execute procedure moddatetime (updated_at);
create trigger handle_updated_at before update on public.expenses for each row execute procedure moddatetime (updated_at);

-- Settlement RPC
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
  create temp table temp_balances as
  select user_id, sum(amount) as balance
  from (
    select paid_by as user_id, amount from group_expenses where group_id = group_id_param
    union all
    select (split->>'user_id')::uuid as user_id, -((split->>'amount')::numeric) as amount
    from group_expenses, jsonb_array_elements(splits) as split
    where group_id = group_id_param
  ) as transactions
  group by user_id;

  loop
    select * into debtor from temp_balances where balance < -0.01 order by balance asc limit 1;
    select * into creditor from temp_balances where balance > 0.01 order by balance desc limit 1;
    exit when debtor is null or creditor is null;

    settlement_amount := least(abs(debtor.balance), creditor.balance);

    insert into group_settlements (group_id, from_user, to_user, amount, status)
    values (group_id_param, debtor.user_id, creditor.user_id, settlement_amount, 'pending');

    update temp_balances set balance = balance + settlement_amount where user_id = debtor.user_id;
    update temp_balances set balance = balance - settlement_amount where user_id = creditor.user_id;
  end loop;

  drop table temp_balances;

  select json_agg(t) into settlements_created from (
    select * from group_settlements where group_id = group_id_param and created_at >= now() - interval '1 minute'
  ) t;

  return settlements_created;
end;
$$;
