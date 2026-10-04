-- Haven shared backend — marketplace radius
-- Number: 0023 (next after 0022_assigned_pro_label.sql).
-- Pro has no migrations folder. This is the one paste for both apps.
--
-- Paste this whole file in the Supabase SQL editor as the database owner,
-- after 0021 and 0022. Do not apply it from the app, from CI, or from an agent.
-- Safe to re-run.
--
-- Does not change pricing, the job status ladder, customer ownership of
-- existing rows, or auth. Does not insert or update any job or profile row.
-- Does not grant anon SELECT on public.jobs and does not create a public view.
--
-- Mapbox is not called from the database. The apps geocode only when a
-- customer service address or a Pro operating location is saved, then store
-- coordinates here. home_city stays a display label.
--
-- Marketplace read and claim both use stored coordinates and the Pro's
-- existing pro_workspace.travelRadius (5, 10, 15, 25, or 50). Missing
-- coordinates or a missing/unknown radius fail closed.

alter table public.profiles
  add column if not exists operating_lat numeric(9,6),
  add column if not exists operating_lng numeric(9,6);

comment on column public.profiles.operating_lat is
  'Pro operating latitude. Authority for marketplace radius. home_city is only a label.';
comment on column public.profiles.operating_lng is
  'Pro operating longitude. Authority for marketplace radius. home_city is only a label.';

grant update (operating_lat, operating_lng) on table public.profiles to authenticated;

-- Miles between two WGS84 points. Null if any coordinate is missing.
create or replace function public.haven_distance_miles(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
returns numeric
language sql
immutable
set search_path = public
as $$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null::numeric
    else (
      3958.8 * 2 * asin(
        least(
          1::double precision,
          sqrt(
            power(sin(radians((lat2 - lat1)::double precision) / 2), 2)
            + cos(radians(lat1::double precision))
              * cos(radians(lat2::double precision))
              * power(sin(radians((lng2 - lng1)::double precision) / 2), 2)
          )
        )
      )
    )::numeric
  end;
$$;

revoke all on function public.haven_distance_miles(numeric, numeric, numeric, numeric) from public;
revoke all on function public.haven_distance_miles(numeric, numeric, numeric, numeric) from anon;

-- Existing choices only. Anything else, including a missing value, is null.
create or replace function public.haven_profile_radius_miles(ws jsonb)
returns numeric
language plpgsql
immutable
set search_path = public
as $$
declare
  raw text;
  n numeric;
begin
  if ws is null or jsonb_typeof(ws) <> 'object' then
    return null;
  end if;
  raw := ws->>'travelRadius';
  if raw is null or btrim(raw) = '' then
    return null;
  end if;
  begin
    n := btrim(raw)::numeric;
  exception when others then
    return null;
  end;
  if n in (5, 10, 15, 25, 50) then
    return n;
  end if;
  return null;
end;
$$;

revoke all on function public.haven_profile_radius_miles(jsonb) from public;
revoke all on function public.haven_profile_radius_miles(jsonb) from anon;

-- True only when the signed-in Pro has operating coordinates, a known radius,
-- and the job point is inside that radius. Missing data returns false.
create or replace function public.haven_caller_within_radius(p_lat numeric, p_lng numeric)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_olat numeric;
  v_olng numeric;
  v_radius numeric;
  v_miles numeric;
begin
  if auth.uid() is null or p_lat is null or p_lng is null then
    return false;
  end if;
  select operating_lat, operating_lng, public.haven_profile_radius_miles(pro_workspace)
    into v_olat, v_olng, v_radius
  from public.profiles
  where id = auth.uid();
  if v_olat is null or v_olng is null or v_radius is null then
    return false;
  end if;
  v_miles := public.haven_distance_miles(v_olat, v_olng, p_lat, p_lng);
  if v_miles is null then
    return false;
  end if;
  return v_miles <= v_radius;
end;
$$;

revoke all on function public.haven_caller_within_radius(numeric, numeric) from public;
revoke all on function public.haven_caller_within_radius(numeric, numeric) from anon;

-- Posted jobs the signed-in Pro may see. Not a table scan the client filters.
-- Empty when the caller has no operating coordinates or no known radius.
-- Does not return address, payment, or customer id.
create or replace function public.jobs_posted_within_radius()
returns table (
  id uuid,
  category text,
  title text,
  fixed_pro_labor_payout_cents integer,
  requires_diagnosis boolean,
  city_label text,
  lat numeric,
  lng numeric,
  emergency boolean,
  posted_at timestamptz,
  status text,
  pro_id uuid,
  inspection_fee_cents integer,
  distance_mi numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    j.id,
    j.category,
    j.title,
    j.fixed_pro_labor_payout_cents,
    j.requires_diagnosis,
    j.city_label,
    j.lat,
    j.lng,
    j.emergency,
    j.posted_at,
    j.status::text,
    j.pro_id,
    j.inspection_fee_cents,
    public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
  from public.jobs j
  join public.profiles p on p.id = auth.uid()
  where auth.uid() is not null
    and j.status = 'posted'
    and j.pro_id is null
    and j.lat is not null
    and j.lng is not null
    and p.operating_lat is not null
    and p.operating_lng is not null
    and public.haven_profile_radius_miles(p.pro_workspace) is not null
    and public.haven_distance_miles(p.operating_lat, p.operating_lng, j.lat, j.lng)
        <= public.haven_profile_radius_miles(p.pro_workspace)
  order by j.posted_at desc;
$$;

revoke all on function public.jobs_posted_within_radius() from public;
revoke all on function public.jobs_posted_within_radius() from anon;
grant execute on function public.jobs_posted_within_radius() to authenticated;

-- Claim stays posted + unassigned to en_route with pro_id = auth.uid().
-- Out of radius, or missing coordinates, raises and does not assign.
create or replace function public.pro_claim_job(job_id uuid)
returns setof public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pro uuid := auth.uid();
  v_lat numeric;
  v_lng numeric;
  claimed public.jobs;
begin
  if v_pro is null then
    raise exception 'claim requires auth.uid()'
      using errcode = '28000';
  end if;

  select j.lat, j.lng
    into v_lat, v_lng
  from public.jobs j
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null;

  if not found then
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  if not public.haven_caller_within_radius(v_lat, v_lng) then
    raise exception 'job outside operating radius'
      using errcode = 'P0001';
  end if;

  update public.jobs j
  set
    status = 'en_route',
    pro_id = v_pro,
    accepted_at = timezone('utc', now())
  where j.id = job_id
    and j.status = 'posted'
    and j.pro_id is null
  returning j.* into claimed;

  if claimed.id is null then
    raise exception 'job not claimable'
      using errcode = 'P0002';
  end if;

  return next claimed;
end;
$$;

revoke all on function public.pro_claim_job(uuid) from public;
revoke all on function public.pro_claim_job(uuid) from anon;
grant execute on function public.pro_claim_job(uuid) to authenticated;

-- Direct PATCH of posted to en_route cannot skip the radius check.
create or replace function public.jobs_enforce_claim_radius()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'claim requires auth.uid()'
      using errcode = '28000';
  end if;
  if new.pro_id is distinct from auth.uid() then
    raise exception 'claim pro mismatch'
      using errcode = '42501';
  end if;
  if not public.haven_caller_within_radius(new.lat, new.lng) then
    raise exception 'job outside operating radius'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.jobs_enforce_claim_radius() from public;
revoke all on function public.jobs_enforce_claim_radius() from anon;

drop trigger if exists jobs_enforce_claim_radius on public.jobs;
create trigger jobs_enforce_claim_radius
  before update on public.jobs
  for each row
  when (
    old.status = 'posted'
    and old.pro_id is null
    and new.status = 'en_route'
    and new.pro_id is not null
  )
  execute procedure public.jobs_enforce_claim_radius();

-- Signed-in Pros no longer SELECT every posted job. The owning customer
-- still sees their own posted row. Everyone else uses jobs_posted_within_radius.
drop policy if exists jobs_select_posted on public.jobs;
drop policy if exists jobs_select_own_posted on public.jobs;
create policy jobs_select_own_posted
  on public.jobs
  for select
  to authenticated
  using (
    status = 'posted'
    and customer_id = auth.uid()
  );
