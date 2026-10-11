create table if not exists public.categories (
  category_id text primary key,
  label text not null
);

create table if not exists public.contractors (
  contractor_id text primary key,
  name text not null default '',
  firm_name text not null default '',
  category_id text not null default '',
  category text not null default '',
  zone_id text not null default '',
  zone_name text not null default '',
  service_areas text not null default '',
  phone text not null default '',
  phone_normalized text not null unique,
  email text not null default '',
  address text not null default '',
  pincode text not null default '',
  experience_years numeric,
  rating numeric,
  active boolean not null default true
);

create table if not exists public.admins (
  officer_id text primary key,
  email text not null default '',
  email_normalized text not null unique,
  name text not null default '',
  category_id text not null default '',
  category text not null default '',
  username text not null default '',
  phone text not null default '',
  phone_normalized text not null default ''
);

create table if not exists public.complaints (
  tracking_id text primary key,
  title varchar(160) not null,
  category_id text not null default '',
  category text not null default '',
  details text not null default '',
  location text not null default '',
  area text not null default '',
  zone_id text not null default '',
  zone_name text not null default '',
  city text not null default '',
  pincode text not null default '',
  latitude double precision,
  longitude double precision,
  citizen_name text not null default '',
  citizen_mobile text not null,
  status text not null check (status in ('Submitted', 'Assigned', 'In progress', 'Work completed', 'Rework required', 'Closed')),
  source_status text not null default '',
  contractor_id text not null default '',
  contractor_name text not null default '',
  report_photos jsonb not null default '[]'::jsonb,
  completion_photos jsonb not null default '[]'::jsonb,
  completion_description text not null default '',
  review_reason text not null default '',
  imported_from text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.complaints
  add column if not exists category_id text not null default '',
  add column if not exists location text not null default '',
  add column if not exists area text not null default '',
  add column if not exists zone_id text not null default '',
  add column if not exists zone_name text not null default '',
  add column if not exists city text not null default '',
  add column if not exists pincode text not null default '',
  add column if not exists citizen_name text not null default '',
  add column if not exists citizen_mobile text not null default '',
  add column if not exists source_status text not null default '',
  add column if not exists contractor_id text not null default '',
  add column if not exists contractor_name text not null default '',
  add column if not exists report_photos jsonb not null default '[]'::jsonb,
  add column if not exists completion_photos jsonb not null default '[]'::jsonb,
  add column if not exists completion_description text not null default '',
  add column if not exists review_reason text not null default '',
  add column if not exists imported_from text not null default '',
  add column if not exists updated_at timestamptz;

update public.complaints set updated_at = created_at where updated_at is null;
alter table public.complaints alter column updated_at set default now();
alter table public.complaints alter column updated_at set not null;
alter table public.complaints alter column latitude drop not null;
alter table public.complaints alter column longitude drop not null;

create index if not exists complaints_citizen_mobile_idx on public.complaints (citizen_mobile, created_at desc);
create index if not exists complaints_contractor_id_idx on public.complaints (contractor_id, created_at desc);
create index if not exists complaints_updated_at_idx on public.complaints (updated_at desc);

create table if not exists public.complaint_updates (
  id bigint generated always as identity primary key,
  tracking_id text not null references public.complaints (tracking_id) on delete cascade,
  type text not null,
  message text not null,
  actor_role text not null,
  actor_name text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists complaint_updates_history_idx on public.complaint_updates (tracking_id, created_at);

create table if not exists public.dataset_imports (
  import_id text primary key,
  imported_at timestamptz not null default now(),
  complaint_count integer not null default 0,
  new_complaint_count integer not null default 0,
  contractor_count integer not null default 0,
  admin_count integer not null default 0,
  category_count integer not null default 0
);

alter table public.categories enable row level security;
alter table public.contractors enable row level security;
alter table public.admins enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;
alter table public.dataset_imports enable row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('categories', 'contractors', 'admins', 'complaints', 'complaint_updates', 'dataset_imports')
  loop
    execute format('drop policy %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end;
$$;

revoke all on public.categories, public.contractors, public.admins, public.complaints,
  public.complaint_updates, public.dataset_imports from anon, authenticated;
grant all on public.categories, public.contractors, public.admins, public.complaints,
  public.complaint_updates, public.dataset_imports to service_role;
grant usage, select on sequence public.complaint_updates_id_seq to service_role;

drop policy if exists "Allow public complaint image uploads" on storage.objects;

create or replace function public.create_complaint_with_update(p_complaint jsonb, p_actor_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tracking_id text := p_complaint ->> 'tracking_id';
begin
  insert into public.complaints (
    tracking_id, title, category_id, category, details, location, area, zone_id, zone_name,
    city, pincode, latitude, longitude, citizen_name, citizen_mobile, status,
    source_status, contractor_id, contractor_name, report_photos, completion_photos,
    completion_description, review_reason, imported_from
  ) values (
    v_tracking_id, p_complaint ->> 'title', coalesce(p_complaint ->> 'category_id', ''),
    coalesce(p_complaint ->> 'category', ''), coalesce(p_complaint ->> 'details', ''),
    coalesce(p_complaint ->> 'location', ''), coalesce(p_complaint ->> 'area', ''),
    coalesce(p_complaint ->> 'zone_id', ''), coalesce(p_complaint ->> 'zone_name', ''),
    coalesce(p_complaint ->> 'city', ''), coalesce(p_complaint ->> 'pincode', ''),
    nullif(p_complaint ->> 'latitude', '')::double precision,
    nullif(p_complaint ->> 'longitude', '')::double precision,
    coalesce(p_complaint ->> 'citizen_name', ''), p_complaint ->> 'citizen_mobile',
    coalesce(p_complaint ->> 'status', 'Submitted'), coalesce(p_complaint ->> 'source_status', ''),
    coalesce(p_complaint ->> 'contractor_id', ''), coalesce(p_complaint ->> 'contractor_name', ''),
    coalesce(p_complaint -> 'report_photos', '[]'::jsonb),
    coalesce(p_complaint -> 'completion_photos', '[]'::jsonb),
    coalesce(p_complaint ->> 'completion_description', ''), coalesce(p_complaint ->> 'review_reason', ''),
    coalesce(p_complaint ->> 'imported_from', '')
  );
  insert into public.complaint_updates (tracking_id, type, message, actor_role, actor_name)
  values (v_tracking_id, 'submitted', 'Complaint submitted by the citizen.', 'citizen', p_actor_name);
end;
$$;

create or replace function public.transition_complaint(
  p_tracking_id text,
  p_expected_statuses text[],
  p_new_status text,
  p_patch jsonb,
  p_event_type text,
  p_message text,
  p_actor_role text,
  p_actor_name text,
  p_required_contractor_id text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_complaint public.complaints%rowtype;
begin
  select * into v_complaint from public.complaints
  where tracking_id = p_tracking_id for update;
  if not found then
    raise exception using message = 'Complaint not found.', errcode = 'P0002';
  end if;
  if not (v_complaint.status = any(p_expected_statuses)) then
    raise exception using message = 'Complaint status changed; refresh and try again.', errcode = '40001';
  end if;
  if p_required_contractor_id is not null and v_complaint.contractor_id <> p_required_contractor_id then
    raise exception using message = 'This complaint is not assigned to you.', errcode = '42501';
  end if;

  update public.complaints set
    status = p_new_status,
    contractor_id = coalesce(p_patch ->> 'contractor_id', contractor_id),
    contractor_name = coalesce(p_patch ->> 'contractor_name', contractor_name),
    completion_photos = coalesce(p_patch -> 'completion_photos', completion_photos),
    completion_description = coalesce(p_patch ->> 'completion_description', completion_description),
    review_reason = coalesce(p_patch ->> 'review_reason', review_reason),
    updated_at = now()
  where tracking_id = p_tracking_id;

  insert into public.complaint_updates (tracking_id, type, message, actor_role, actor_name)
  values (p_tracking_id, p_event_type, p_message, p_actor_role, p_actor_name);
  return p_new_status;
end;
$$;

revoke all on function public.create_complaint_with_update(jsonb, text) from public, anon, authenticated;
revoke all on function public.transition_complaint(text, text[], text, jsonb, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_complaint_with_update(jsonb, text) to service_role;
grant execute on function public.transition_complaint(text, text[], text, jsonb, text, text, text, text, text) to service_role;
