-- Run this SQL in your Supabase SQL Editor to set up the profiles table and auth trigger

-- 1. Create profiles table to store user role (admin/user)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  full_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Enable RLS
alter table public.profiles enable row level security;

-- 3. Users can read their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- 4. Users can update their own profile (for non-role fields)
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 5. Allow insert during signup (via trigger)
create policy "Enable insert for authenticated users"
  on public.profiles for insert
  with check (auth.uid() = id);

-- 6. Function to create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$ language plpgsql security definer;

-- 7. Trigger to auto-create profile when user signs up
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 8. (Optional) Create an admin user manually - after signing up, run:
-- update public.profiles set role = 'admin' where email = 'your-admin@email.com';
