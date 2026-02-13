-- Create table for storing Expo push tokens
create table public.user_push_tokens (
  user_id uuid references auth.users not null,
  token text not null,
  device_type text, -- 'android', 'ios', 'web'
  last_used_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  primary key (user_id, token)
);

-- RLS Policies
alter table public.user_push_tokens enable row level security;

create policy "Users can view their own tokens"
  on public.user_push_tokens for select
  using (auth.uid() = user_id);

create policy "Users can insert their own tokens"
  on public.user_push_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own tokens"
  on public.user_push_tokens for delete
  using (auth.uid() = user_id);
