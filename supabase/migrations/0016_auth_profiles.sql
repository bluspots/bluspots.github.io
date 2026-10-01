-- Haven shared backend — Slice 1 auth profiles
-- Purpose: Supabase Auth identity plus a role/profile row per user.
--
-- This migration is additive. It does not alter public.jobs, job status
-- enums, lifecycle policies, economics, or materials behavior from
-- migrations 0001–0015.
--
-- Job ownership is unchanged. Customer and Pro job writes still use the
-- prototype DEMO_* customer id (and the existing status RLS) until a later
-- slice binds rows to auth.uid(). Anon INSERT/UPDATE/SELECT on public.jobs
-- stays open on purpose. Session-bound writes, ownership RLS, DEMO
-- retirement, and anon write lockdown are later slices — not this file.
--
-- Apply in the Supabase SQL editor as the database owner (after 0015).
-- Safe to re-run: policies and triggers are dropped and recreated.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('customer', 'pro')),
  display_name text null,
  email text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Slice 1 identity. Job rows are still DEMO_* / status RLS until a later slice.';

alter table public.profiles enable row level security;

-- Own row only. No INSERT policy: the auth.users trigger creates the row
-- as security definer and bypasses RLS. No DELETE policy.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.profiles_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute procedure public.profiles_set_updated_at();

-- Role source: raw_user_meta_data.role when it is customer or pro.
-- Anything else (missing, blank, unknown) becomes customer.
-- The Customer app sends role=customer at sign-up. A later slice can
-- stop trusting client metadata.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_role text;
  resolved_role text;
  meta_name text;
begin
  meta_role := lower(btrim(coalesce(new.raw_user_meta_data->>'role', '')));
  if meta_role in ('customer', 'pro') then
    resolved_role := meta_role;
  else
    resolved_role := 'customer';
  end if;

  meta_name := nullif(btrim(coalesce(
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'name',
    ''
  )), '');

  insert into public.profiles (id, role, display_name, email)
  values (new.id, resolved_role, meta_name, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_profile();

-- Clients cannot call the trigger function through PostgREST.
revoke all on function public.handle_new_user_profile() from public;
revoke all on function public.handle_new_user_profile() from anon;
revoke all on function public.handle_new_user_profile() from authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user_profile() to supabase_auth_admin;
  end if;
end$$;

revoke all on function public.profiles_set_updated_at() from public;
grant execute on function public.profiles_set_updated_at() to authenticated;

-- authenticated can read the whole own row (RLS) and update display fields.
-- role is not update-granted, so a signed-in user cannot flip customer/pro.
revoke all on table public.profiles from public;
revoke all on table public.profiles from anon;
grant select on table public.profiles to authenticated;
grant update (display_name, email) on table public.profiles to authenticated;
