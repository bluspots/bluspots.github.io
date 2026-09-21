-- Scope:
-- 1) Extend job_status enum with 'materials_declined'
-- 2) Add convenience_fee_cents to jobs
-- (RLS policies and grants moved to later migrations; see 0005 and 0006)
--
-- Notes:
-- - Additive/idempotent where possible.
-- - Do NOT weaken the one_active_job_per_pro unique index; terminals are not active.
-- - Prototype RLS policies are defined separately and are intentionally narrow/temporary.

-- 1) Add enum value to job_status: 'materials_declined'
do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'job_status'
      and e.enumlabel = 'materials_declined'
  ) then
    -- Place after 'materials_approved' for readability; position is informational.
    alter type job_status add value 'materials_declined' after 'materials_approved';
  end if;
end$$;

-- 2) Add convenience_fee_cents to jobs (non-negative, default 0)
alter table public.jobs
  add column if not exists convenience_fee_cents int not null default 0 check (convenience_fee_cents >= 0);

