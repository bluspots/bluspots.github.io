-- Haven shared backend — assigned Pro display name for the job's customer
-- Number: 0022.
-- 0021 is the Pro profile source-of-truth migration
-- (haven-pro docs/0021_pro_profile_source_of_truth.sql). This file does not
-- depend on it. It only reads profiles.display_name from 0016.
--
-- Paste this whole file in the Supabase SQL editor as the database owner,
-- after 0020. Do not apply it from the app. Safe to re-run.
--
-- Does not alter public.jobs, does not update any job row, and does not
-- grant customers a profile directory. The caller must own the job
-- (customer_id = auth.uid()). Demo pro 22222222-2222-4222-8222-222222222222
-- is never returned. Anonymous execute is not granted.

create or replace function public.job_assigned_pro_labels(p_job_ids uuid[])
returns table (job_id uuid, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, nullif(btrim(p.display_name), '')
  from public.jobs j
  left join public.profiles p on p.id = j.pro_id
  where j.id = any(p_job_ids)
    and j.customer_id = auth.uid()
    and j.pro_id is not null
    and j.pro_id <> '22222222-2222-4222-8222-222222222222'::uuid;
$$;

revoke all on function public.job_assigned_pro_labels(uuid[]) from public;
revoke all on function public.job_assigned_pro_labels(uuid[]) from anon;
grant execute on function public.job_assigned_pro_labels(uuid[]) to authenticated;
