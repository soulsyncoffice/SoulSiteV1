create table if not exists public.private_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  visibility jsonb not null default '{}'::jsonb,
  overview text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint private_profiles_profile_is_object check (jsonb_typeof(profile) = 'object'),
  constraint private_profiles_visibility_is_object check (jsonb_typeof(visibility) = 'object')
);

alter table public.private_profiles enable row level security;
alter table public.private_profiles force row level security;

revoke all on public.private_profiles from public, anon, authenticated;
grant select, insert, update, delete on public.private_profiles to service_role;

create policy "Users manage only their own private profile"
  on public.private_profiles
  for all
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.set_private_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger private_profiles_updated_at
  before update on public.private_profiles
  for each row execute function public.set_private_profile_updated_at();

create or replace function public.delete_own_auth_user()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  delete from auth.users where id = current_user_id;
end;
$$;

revoke all on function public.delete_own_auth_user() from public, anon;
grant execute on function public.delete_own_auth_user() to authenticated;
