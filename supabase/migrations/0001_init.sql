-- Haven shared backend — initial schema (Supabase/Postgres)
-- Safe groundwork: apply to a new database; clients are not wired in this PR.

-- Extensions
create extension if not exists pgcrypto;

-- Enums
do $$
begin
  if not exists (select 1 from pg_type where typname = 'job_status') then
    create type job_status as enum (
      'posted',
      'en_route',
      'arrived',
      'diagnosing',
      'materials_requested',
      'materials_approved',
      'in_progress',
      'inspection_completed',
      'complete',
      'cancelled'
    );
  end if;
end$$;

-- Core: jobs
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  schema_version int not null default 1,

  -- parties
  customer_id uuid not null,
  pro_id uuid null,
  accepted_at timestamptz null,

  -- service
  category text not null,
  title text not null,
  requires_diagnosis boolean not null default false,

  -- location
  city_label text not null,
  address_snapshot text null,     -- populated/visible post-accept
  lat numeric(9,6) null,
  lng numeric(9,6) null,

  -- pricing (labor snapshot)
  fixed_customer_labor_price_cents int not null check (fixed_customer_labor_price_cents >= 0),
  fixed_pro_labor_payout_cents int not null check (fixed_pro_labor_payout_cents >= 0),
  margin_rate_bps int not null default 2000 check (margin_rate_bps >= 0),

  -- additive fees
  emergency boolean not null default false,
  emergency_fee_cents int not null default 0 check (emergency_fee_cents >= 0),
  inspection_fee_cents int not null default 0 check (inspection_fee_cents >= 0),

  -- lifecycle
  status job_status not null default 'posted',
  posted_at timestamptz not null default now(),
  completed_at timestamptz null,
  cancelled_at timestamptz null,

  -- customer-side snapshots
  customer_preferences_snapshot jsonb not null default '[]'::jsonb,
  payment_snapshot jsonb null, -- {brand,last4}

  -- quick rollups for reads (computed in app/queries)
  materials_reimbursed_cents int not null default 0 check (materials_reimbursed_cents >= 0),
  tip_amount_cents int not null default 0 check (tip_amount_cents >= 0)
);

-- Enforce: address_snapshot only after accept (soft rule, can be enforced at app layer)
-- Optionally add a check constraint if desired later, e.g., address_snapshot is null when pro_id is null.

-- Status events (timeline)
create table if not exists public.job_status_events (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_status job_status null,
  to_status job_status not null,
  actor_role text not null check (actor_role in ('customer','pro','system')),
  actor_id uuid null,
  at timestamptz not null default now()
);
create index if not exists job_status_events_job_idx on public.job_status_events(job_id, at);

-- Materials
create table if not exists public.materials_requests (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  requested_at timestamptz not null default now(),
  items jsonb not null default '[]'::jsonb, -- [{description,qty,amount_cents}]
  estimated_total_cents int not null check (estimated_total_cents >= 0),
  status text not null check (status in ('pending','approved','declined')),
  responded_at timestamptz null,
  responded_by uuid null
);
create index if not exists materials_requests_job_idx on public.materials_requests(job_id);

create table if not exists public.materials_receipts (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  actual_total_cents int not null check (actual_total_cents >= 0),
  receipt_photo_url text not null,
  submitted_by uuid not null
);
create index if not exists materials_receipts_job_idx on public.materials_receipts(job_id);

-- Tips
create table if not exists public.tips (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  amount_cents int not null check (amount_cents >= 0),
  status text not null check (status in ('not_added','processing','paid','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tips_job_idx on public.tips(job_id);

-- Messaging
create table if not exists public.job_messages (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','pro','support')),
  sender_id uuid null,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists job_messages_job_idx on public.job_messages(job_id, created_at);

-- Media & notes
create table if not exists public.job_media (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  kind text not null check (kind in ('customer_booking','pro_before','pro_after','materials_receipt')),
  url text not null,
  created_at timestamptz not null default now(),
  created_by uuid null
);
create index if not exists job_media_job_idx on public.job_media(job_id);

create table if not exists public.job_notes (
  id bigserial primary key,
  job_id uuid not null references public.jobs(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index if not exists job_notes_job_idx on public.job_notes(job_id, created_at);

-- Earnings Statements (immutable)
create table if not exists public.earnings_statements (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  pro_id uuid not null,
  created_at timestamptz not null default now(),
  financial_snapshot jsonb not null, -- {gross_cents, materials_cents, tip_cents, net_cents, status}
  pdf_url text null,
  email_status text not null default 'pending' check (email_status in ('pending','sent','failed')),
  emailed_at timestamptz null
);
create unique index if not exists earnings_statements_job_unique on public.earnings_statements(job_id);

-- Constraint: one active job per pro
create unique index if not exists one_active_job_per_pro
  on public.jobs(pro_id)
  where pro_id is not null
    and status in ('en_route','arrived','diagnosing','materials_requested','materials_approved','in_progress');

