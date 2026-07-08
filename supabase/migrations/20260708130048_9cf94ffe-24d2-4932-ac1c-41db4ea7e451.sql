
-- Enums
create type public.app_role as enum ('admin', 'user');
create type public.org_kind as enum ('holding', 'operating', 'sole_prop', 'other');
create type public.member_role as enum ('owner', 'member');
create type public.assessment_status as enum ('satisfied', 'partially_satisfied', 'missing', 'needs_review', 'unknown');
create type public.task_status as enum ('open', 'done', 'dismissed');

-- update_updated_at helper
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Auto-create profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- user_roles (platform-level)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "users read own roles" on public.user_roles for select using (auth.uid() = user_id);

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- Organizations
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_number text,
  kind org_kind not null default 'operating',
  created_by uuid not null references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.organizations to authenticated;
grant all on public.organizations to service_role;
alter table public.organizations enable row level security;
create trigger orgs_updated before update on public.organizations for each row execute function public.set_updated_at();

-- Memberships
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
grant select, insert, update, delete on public.memberships to authenticated;
grant all on public.memberships to service_role;
alter table public.memberships enable row level security;
create index on public.memberships (user_id);
create index on public.memberships (org_id);

-- Helper: is member of org
create or replace function public.is_member(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = _org and user_id = _user)
$$;

create or replace function public.is_org_owner(_org uuid, _user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = _org and user_id = _user and role = 'owner')
$$;

-- Org policies
create policy "members read orgs" on public.organizations for select
  using (public.is_member(id, auth.uid()));
create policy "authed create orgs" on public.organizations for insert
  with check (auth.uid() = created_by);
create policy "owners update orgs" on public.organizations for update
  using (public.is_org_owner(id, auth.uid()));
create policy "owners delete orgs" on public.organizations for delete
  using (public.is_org_owner(id, auth.uid()));

-- Membership policies
create policy "members read memberships" on public.memberships for select
  using (public.is_member(org_id, auth.uid()));
create policy "owner or self insert membership" on public.memberships for insert
  with check (auth.uid() = user_id or public.is_org_owner(org_id, auth.uid()));
create policy "owners update memberships" on public.memberships for update
  using (public.is_org_owner(org_id, auth.uid()));
create policy "owners delete memberships" on public.memberships for delete
  using (public.is_org_owner(org_id, auth.uid()));

-- Frameworks
create table public.frameworks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.frameworks to authenticated;
grant all on public.frameworks to service_role;
alter table public.frameworks enable row level security;
create index on public.frameworks (org_id);
create policy "org members frameworks" on public.frameworks for all
  using (public.is_member(org_id, auth.uid()))
  with check (public.is_member(org_id, auth.uid()));

-- Sources
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  framework_id uuid references public.frameworks on delete set null,
  authority text not null,
  reference text,
  effective_date date,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.sources to authenticated;
grant all on public.sources to service_role;
alter table public.sources enable row level security;
create index on public.sources (org_id);
create policy "org members sources" on public.sources for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Playbooks
create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  slug text not null,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  unique (org_id, slug)
);
grant select, insert, update, delete on public.playbooks to authenticated;
grant all on public.playbooks to service_role;
alter table public.playbooks enable row level security;
create index on public.playbooks (org_id);
create policy "org members playbooks" on public.playbooks for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Playbook steps
create table public.playbook_steps (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.playbooks on delete cascade,
  org_id uuid not null references public.organizations on delete cascade,
  order_index int not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.playbook_steps to authenticated;
grant all on public.playbook_steps to service_role;
alter table public.playbook_steps enable row level security;
create index on public.playbook_steps (playbook_id);
create policy "org members steps" on public.playbook_steps for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Obligations
create table public.obligations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  framework_id uuid references public.frameworks on delete set null,
  source_id uuid references public.sources on delete set null,
  playbook_step_id uuid references public.playbook_steps on delete set null,
  title text not null,
  why text,
  responsible text,
  due_at date,
  evidence_requirements text[] default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.obligations to authenticated;
grant all on public.obligations to service_role;
alter table public.obligations enable row level security;
create index on public.obligations (org_id);
create index on public.obligations (playbook_step_id);
create trigger obligations_updated before update on public.obligations for each row execute function public.set_updated_at();
create policy "org members obligations" on public.obligations for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Evidence
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  uploaded_by uuid not null references auth.users on delete set null,
  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  ai_summary text,
  ai_confidence numeric,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.evidence to authenticated;
grant all on public.evidence to service_role;
alter table public.evidence enable row level security;
create index on public.evidence (org_id);
create policy "org members evidence" on public.evidence for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Evidence links (many-to-many)
create table public.evidence_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  evidence_id uuid not null references public.evidence on delete cascade,
  obligation_id uuid not null references public.obligations on delete cascade,
  relevance numeric,
  ai_reasoning text,
  created_at timestamptz not null default now(),
  unique (evidence_id, obligation_id)
);
grant select, insert, update, delete on public.evidence_links to authenticated;
grant all on public.evidence_links to service_role;
alter table public.evidence_links enable row level security;
create index on public.evidence_links (org_id);
create index on public.evidence_links (obligation_id);
create policy "org members ev links" on public.evidence_links for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Assessments
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  obligation_id uuid not null references public.obligations on delete cascade,
  status assessment_status not null,
  confidence numeric,
  reasoning text,
  missing_evidence text[] default '{}',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assessments to authenticated;
grant all on public.assessments to service_role;
alter table public.assessments enable row level security;
create index on public.assessments (obligation_id, created_at desc);
create policy "org members assessments" on public.assessments for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations on delete cascade,
  obligation_id uuid references public.obligations on delete cascade,
  title text not null,
  description text,
  status task_status not null default 'open',
  due_at date,
  generated_by text not null default 'ai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create index on public.tasks (org_id);
create trigger tasks_updated before update on public.tasks for each row execute function public.set_updated_at();
create policy "org members tasks" on public.tasks for all
  using (public.is_member(org_id, auth.uid())) with check (public.is_member(org_id, auth.uid()));

-- Storage RLS: evidence bucket paths are `<org_id>/<uuid>-<file>`
create policy "org members read evidence storage" on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and public.is_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "org members insert evidence storage" on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and public.is_member((split_part(name, '/', 1))::uuid, auth.uid()));
create policy "org members delete evidence storage" on storage.objects for delete to authenticated
  using (bucket_id = 'evidence' and public.is_member((split_part(name, '/', 1))::uuid, auth.uid()));

-- Seed function: incorporate playbook
create or replace function public.seed_incorporate_playbook(_org uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  fw_corp uuid; fw_acct uuid; fw_gov uuid;
  src_asa uuid; src_reg uuid; src_book uuid;
  pb uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid; s5 uuid;
begin
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Corporate Law', 'Formation, shares, governance under the Companies Act (Aksjeloven).') returning id into fw_corp;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Accounting', 'Bookkeeping and reporting under the Accounting Act.') returning id into fw_acct;
  insert into public.frameworks(org_id, name, description) values
    (_org, 'Governance', 'Board composition, resolutions, and internal controls.') returning id into fw_gov;

  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_corp, 'Companies Act (Aksjeloven)', 'LOV-1997-06-13-44') returning id into src_asa;
  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_corp, 'Brønnøysund Register Centre', 'Company registration') returning id into src_reg;
  insert into public.sources(org_id, framework_id, authority, reference) values
    (_org, fw_acct, 'Accounting Act (Regnskapsloven)', 'LOV-1998-07-17-56') returning id into src_book;

  insert into public.playbooks(org_id, slug, name) values
    (_org, 'incorporate_company', 'Incorporate a Company') returning id into pb;

  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 1, 'Register the Company', 'File incorporation documents and register in Brønnøysund.') returning id into s1;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 2, 'Establish Company Structure', 'Bank account, accounting, and shareholder register in place.') returning id into s2;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 3, 'First Board Resolution', 'Document early decisions such as equipment purchases and authority delegation.') returning id into s3;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 4, 'Operational Readiness', 'Insurance, tax registrations, and core policies active.') returning id into s4;
  insert into public.playbook_steps(playbook_id, org_id, order_index, title, description) values
    (pb, _org, 5, 'Ongoing Governance', 'Board minutes, annual meeting, and shareholder register kept current.') returning id into s5;

  -- Step 1 obligations
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements) values
    (_org, fw_corp, src_asa, s1, 'Articles of Association (Vedtekter)',
      'Required by the Companies Act §2-2. Defines the company name, purpose, share capital, and board structure.',
      'Founders', array['Signed Articles of Association PDF']),
    (_org, fw_corp, src_asa, s1, 'Incorporation Certificate (Stiftelsesdokument)',
      'Required by the Companies Act §2-1. Records that the company was formally founded, by whom, and on what date.',
      'Founders', array['Signed founding document']),
    (_org, fw_corp, src_asa, s1, 'Share Capital Confirmation',
      'The Companies Act §2-8 requires paid-in share capital of at least NOK 30 000 to be confirmed by a bank or auditor.',
      'Founders', array['Bank confirmation of paid-in capital']),
    (_org, fw_corp, src_reg, s1, 'Brønnøysund Registration (Foretaksregisteret)',
      'The company must be registered in Foretaksregisteret within three months of incorporation.',
      'Managing Director', array['Registration certificate (firmaattest)']),
    (_org, fw_gov, src_asa, s1, 'Managing Director & Board Appointment',
      'The Companies Act requires a duly appointed board and managing director for a limited company.',
      'Founders', array['Board resolution appointing MD', 'List of board members']);

  -- Step 2
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements) values
    (_org, fw_acct, src_book, s2, 'Business Bank Account',
      'A separate business bank account is required to keep company funds separate from private funds and to satisfy the Accounting Act.',
      'Managing Director', array['Bank account confirmation']),
    (_org, fw_acct, src_book, s2, 'Accounting System Active',
      'The Accounting Act requires a bookkeeping system from day one — transactions must be recorded chronologically.',
      'Accountant', array['Accounting system agreement or invoice']),
    (_org, fw_corp, src_asa, s2, 'Shareholder Register (Aksjeeierbok)',
      'The Companies Act §4-5 requires the company to maintain a register of shareholders.',
      'Managing Director', array['Shareholder register document']);

  -- Step 3
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements) values
    (_org, fw_gov, src_asa, s3, 'First Board Minutes',
      'Board decisions must be recorded in minutes signed by attending members.',
      'Board', array['Signed board minutes PDF']),
    (_org, fw_gov, src_asa, s3, 'Equipment Purchase Resolution',
      'When founders sell privately owned equipment to the company, a documented board resolution and receipts protect against disputes and tax risk.',
      'Board', array['Board resolution', 'Original receipts or valuation']);

  -- Step 4
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements) values
    (_org, fw_gov, null, s4, 'Business Insurance',
      'Most operating companies need liability and content insurance from day one.',
      'Managing Director', array['Active insurance policy']),
    (_org, fw_acct, src_book, s4, 'Tax Registrations (MVA if applicable)',
      'VAT registration is required once taxable turnover reaches NOK 50 000 in a 12-month period.',
      'Accountant', array['Registration confirmation']),
    (_org, fw_gov, null, s4, 'HSE Policy (Internkontroll)',
      'Companies with employees must have a written internal control system for health, safety and environment.',
      'Managing Director', array['Written HSE policy']);

  -- Step 5
  insert into public.obligations (org_id, framework_id, source_id, playbook_step_id, title, why, responsible, evidence_requirements) values
    (_org, fw_gov, src_asa, s5, 'Annual General Meeting Minutes',
      'The Companies Act requires an ordinary general meeting within six months of the financial year end.',
      'Board', array['Signed AGM minutes']),
    (_org, fw_acct, src_book, s5, 'Annual Accounts Submitted',
      'Annual accounts must be adopted and submitted to Regnskapsregisteret each year.',
      'Accountant', array['Filed annual accounts']);
end $$;

grant execute on function public.seed_incorporate_playbook(uuid) to authenticated;
