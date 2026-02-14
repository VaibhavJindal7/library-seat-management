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

-- ========== SEATS TABLE (for admin seat management) ==========

-- 9. Create seats table
create table if not exists public.seats (
  id text primary key,
  floor integer not null,
  occupied boolean not null default false
);

-- 10. Enable RLS on seats
alter table public.seats enable row level security;

-- 11. Authenticated users can read seats
create policy "Authenticated users can view seats"
  on public.seats for select
  to authenticated
  using (true);

-- 12. Only admins can update seats
create policy "Admins can update seats"
  on public.seats for update
  to authenticated
  using (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- 13. Only admins can insert seats (for seeding)
create policy "Admins can insert seats"
  on public.seats for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- 14. Seed default seats (50 per floor, 3 floors)
insert into public.seats (id, floor, occupied)
select 'F' || f || '-S' || lpad(s::text, 2, '0'), f, (random() > 0.5)
from generate_series(0, 2) f, generate_series(1, 50) s
on conflict (id) do nothing;

-- ========== LIBRARY_SEATS TABLE (admin panel with realtime) ==========

-- 15. Create library_seats table (id, floor_no, seat_no, occupied)
create table if not exists public.library_seats (
  id bigserial primary key,
  floor_no integer not null,
  seat_no integer not null,
  occupied boolean not null default false,
  unique(floor_no, seat_no)
);

-- 16. Enable RLS
alter table public.library_seats enable row level security;

-- 16b. Helper to check admin (bypasses RLS for the check)
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 17. Anyone can read (for public display)
create policy "Anyone can view library_seats"
  on public.library_seats for select
  using (true);

-- 18. Only admins can update (uses is_admin() for reliable check)
drop policy if exists "Admins can update library_seats" on public.library_seats;
create policy "Admins can update library_seats"
  on public.library_seats for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 19. Only admins can insert
create policy "Admins can insert library_seats"
  on public.library_seats for insert
  to authenticated
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'admin'));

-- 20. Enable Realtime for library_seats
-- Run in Supabase SQL Editor, or enable in Dashboard → Database → Replication
alter publication supabase_realtime add table public.library_seats;

-- 20b. Ensure Realtime sends full row data on UPDATE (required for postgres_changes)
alter table public.library_seats replica identity full;

-- 21. Seed library_seats (50 per floor, 3 floors)
insert into public.library_seats (floor_no, seat_no, occupied)
select f, s, (random() > 0.5)
from generate_series(0, 2) f, generate_series(1, 50) s
on conflict (floor_no, seat_no) do nothing;
