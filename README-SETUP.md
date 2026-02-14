# Supabase Auth Setup

## 1. Configure your Supabase credentials

Edit `supabase-config.js` and replace:
- `YOUR_PROJECT_REF` with your Supabase project URL (from Project Settings → API)
- `YOUR_ANON_KEY` with your anon/public key

## 2. Run the SQL setup in Supabase

1. Open your [Supabase Dashboard](https://supabase.com/dashboard)
2. Go to **SQL Editor**
3. Copy the contents of `supabase-setup.sql`
4. Run the script

This creates the `profiles` table and trigger to auto-create profiles on signup.

## 3. Enable Email Auth

1. In Supabase: **Authentication** → **Providers**
2. Ensure **Email** is enabled
3. (Optional) Disable "Confirm email" in **Authentication** → **Providers** → **Email** if you want instant signup without email verification

## 4. Create an admin user

1. Sign up as a normal user through the app
2. In Supabase: **Table Editor** → `profiles`
3. Find your user and change `role` from `user` to `admin`

Or run in SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'your-email@example.com';
```

## 5. Run the app

Use a local server (required for ES modules):
```
npx serve .
```
Or open with Live Server in VS Code.
