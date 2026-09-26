create extension if not exists pgcrypto;

create sequence if not exists request_display_seq start 1043;
create or replace function public.next_request_display_id()
returns text
language sql
set search_path = public
as $$
  select 'REQ-' || nextval('public.request_display_seq')::text;
$$;

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null check (department in ('housekeeping','engineering','front_desk')),
  role text,
  zone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_staff_name_department
  on public.staff(name, department);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  room_number text not null,
  guest_name text,
  request_type text not null,
  details text not null,
  quantity integer,
  department text not null check (department in ('housekeeping','engineering','front_desk')),
  priority text not null check (priority in ('normal','high','urgent')) default 'normal',
  status text not null check (status in ('NEW','ASSIGNED','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')) default 'NEW',
  assignee_id uuid references public.staff(id),
  source text not null default 'Manual',
  source_call_id text,
  idempotency_key text unique,
  blocked_reason text,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  blocked_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  sla_target_at timestamptz not null
);

create table if not exists public.request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_requests_assignee_id
  on public.service_requests(assignee_id);
create index if not exists idx_request_events_request_id
  on public.request_events(request_id);

alter table public.staff enable row level security;
alter table public.service_requests enable row level security;
alter table public.request_events enable row level security;

-- The public website reads through /api/operations-feed, not directly from Supabase.
-- With no anon policies, accidental browser access to the raw tables is denied.
drop policy if exists "demo read service requests" on public.service_requests;
drop policy if exists "demo read request events" on public.request_events;
drop policy if exists "demo read staff" on public.staff;
revoke all on table public.staff from anon;
revoke all on table public.service_requests from anon;
revoke all on table public.request_events from anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'service_requests'
  ) then
    alter publication supabase_realtime add table public.service_requests;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'request_events'
  ) then
    alter publication supabase_realtime add table public.request_events;
  end if;
end $$;

insert into public.staff (name,department,role,zone) values
('Maria Santos','housekeeping','runner','floor_5'),
('Ana Kim','housekeeping','room_attendant','floor_4'),
('Carlos Vega','engineering','technician','all'),
('Lucía Romero','front_desk','guest_services','lobby')
on conflict (name,department) do update
set role = excluded.role, zone = excluded.zone, active = true;
