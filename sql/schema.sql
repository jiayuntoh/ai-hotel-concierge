create extension if not exists pgcrypto;

create sequence if not exists request_display_seq start 1043;
create or replace function next_request_display_id()
returns text language sql as $$
  select 'REQ-' || nextval('request_display_seq')::text;
$$;

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text not null check (department in ('housekeeping','engineering','front_desk')),
  role text,
  zone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists service_requests (
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
  assignee_id uuid references staff(id),
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

create table if not exists request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references service_requests(id) on delete cascade,
  event_type text not null,
  actor_type text not null,
  actor_id text,
  from_status text,
  to_status text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table staff enable row level security;
alter table service_requests enable row level security;
alter table request_events enable row level security;

-- DEMO ONLY: public read access so the portfolio board can display live request state.
-- Replace this with authenticated property/role-based policies before any real deployment.
create policy "demo read service requests" on service_requests for select to anon using (true);
create policy "demo read request events" on request_events for select to anon using (true);
create policy "demo read staff" on staff for select to anon using (true);

alter publication supabase_realtime add table service_requests;
alter publication supabase_realtime add table request_events;

insert into staff (name,department,role,zone) values
('Maria Santos','housekeeping','runner','floor_5'),
('Ana Kim','housekeeping','room_attendant','floor_4'),
('Carlos Vega','engineering','technician','all'),
('Lucía Romero','front_desk','guest_services','lobby')
on conflict do nothing;
