-- ============================================================
-- CRM Pro - Migration 001: Schema Completo
-- Execute no SQL Editor do Supabase
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";


-- ============================================================
-- ORGANIZATIONS (multi-tenant)
-- ============================================================
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        varchar(255) not null,
  slug        varchar(100) unique not null,
  plan        varchar(50)  default 'starter',
  logo_url    text,
  website     text,
  phone       varchar(50),
  email       varchar(255),
  address     jsonb        default '{}',
  settings    jsonb        default '{}',
  theme       jsonb        default '{"primaryColor":"#6366f1","mode":"dark"}',
  features    jsonb        default '{"ai":true,"automations":true,"reports":true}',
  limits      jsonb        default '{"users":10,"leads":5000,"storage_gb":10}',
  is_active   boolean      default true,
  trial_ends_at timestamptz,
  created_at  timestamptz  default now(),
  updated_at  timestamptz  default now()
);

-- ============================================================
-- PROFILES (estende auth.users)
-- ============================================================
create table if not exists public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  organization_id uuid references public.organizations on delete cascade,
  first_name      varchar(100),
  last_name       varchar(100),
  email           varchar(255) unique not null,
  phone           varchar(50),
  avatar_url      text,
  title           varchar(100),
  department      varchar(100),
  bio             text,
  timezone        varchar(100) default 'America/Sao_Paulo',
  locale          varchar(10)  default 'pt-BR',
  preferences     jsonb        default '{"sidebarCollapsed":false,"theme":"dark","notifications":true}',
  notification_settings jsonb  default '{"email":true,"push":true,"sound":true,"digest":"daily"}',
  is_active       boolean      default true,
  last_seen_at    timestamptz,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- TEAMS
-- ============================================================
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  color           varchar(7)   default '#6366f1',
  icon            varchar(50)  default 'users',
  is_active       boolean      default true,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams not null,
  user_id    uuid references public.profiles not null,
  role       varchar(50) default 'member',
  joined_at  timestamptz default now(),
  unique(team_id, user_id)
);

-- ============================================================
-- RBAC: ROLES & PERMISSIONS
-- ============================================================
create table if not exists public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(100) not null,
  description     text,
  is_system       boolean default false,
  level           integer default 0,
  permissions     jsonb   default '{}',
  created_at      timestamptz default now()
);

create table if not exists public.user_roles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.profiles not null,
  role_id         uuid references public.roles not null,
  organization_id uuid references public.organizations not null,
  granted_by      uuid references public.profiles,
  granted_at      timestamptz default now(),
  unique(user_id, role_id)
);

-- ============================================================
-- COMPANIES
-- ============================================================
create table if not exists public.companies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  document        varchar(50),
  document_type   varchar(20)  default 'cnpj',
  website         text,
  industry        varchar(100),
  company_size    varchar(50),
  annual_revenue  numeric(15,2),
  phone           varchar(50),
  email           varchar(255),
  address         jsonb        default '{}',
  social_media    jsonb        default '{}',
  logo_url        text,
  status          varchar(50)  default 'active',
  owner_id        uuid references public.profiles,
  team_id         uuid references public.teams,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  score           integer      default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  deleted_at      timestamptz
);

-- ============================================================
-- CONTACTS
-- ============================================================
create table if not exists public.contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  company_id      uuid references public.companies,
  first_name      varchar(100) not null,
  last_name       varchar(100),
  email           varchar(255),
  phone           varchar(50),
  mobile          varchar(50),
  job_title       varchar(100),
  department      varchar(100),
  avatar_url      text,
  document        varchar(50),
  birthdate       date,
  linkedin_url    text,
  instagram_url   text,
  address         jsonb        default '{}',
  status          varchar(50)  default 'active',
  owner_id        uuid references public.profiles,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  score           integer      default 0,
  source          varchar(100),
  is_primary      boolean      default false,
  opt_in_email    boolean      default true,
  opt_in_whatsapp boolean      default true,
  opt_in_sms      boolean      default false,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  deleted_at      timestamptz
);

-- ============================================================
-- LEADS
-- ============================================================
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  title           varchar(255) not null,
  description     text,
  status          varchar(50)  default 'new',
  source          varchar(100),
  source_detail   jsonb        default '{}',
  utm_source      varchar(100),
  utm_medium      varchar(100),
  utm_campaign    varchar(100),
  utm_term        varchar(100),
  utm_content     varchar(100),
  owner_id        uuid references public.profiles,
  team_id         uuid references public.teams,
  temperature     varchar(20)  default 'warm',
  score           integer      default 0,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  value           numeric(15,2),
  currency        varchar(3)   default 'BRL',
  expected_close_date date,
  lost_reason     varchar(255),
  lost_reason_detail text,
  converted_at    timestamptz,
  converted_to    varchar(50),
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  deleted_at      timestamptz
);

create table if not exists public.lead_scores (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads not null,
  category   varchar(50) not null,
  score      integer not null,
  reason     text,
  created_at timestamptz default now()
);

-- ============================================================
-- FUNNELS & PIPELINE
-- ============================================================
create table if not exists public.funnels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  type            varchar(50)  default 'sales',
  currency        varchar(3)   default 'BRL',
  visibility      varchar(50)  default 'organization',
  settings        jsonb        default '{}',
  is_active       boolean      default true,
  is_default      boolean      default false,
  position        integer      default 0,
  color           varchar(7)   default '#6366f1',
  icon            varchar(50)  default 'git-merge',
  created_by      uuid references public.profiles,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  funnel_id   uuid references public.funnels not null,
  name        varchar(255) not null,
  description text,
  position    integer      not null default 0,
  color       varchar(7)   default '#6366f1',
  icon        varchar(50),
  probability integer      default 0,
  type        varchar(50)  default 'open',
  sla_hours   integer,
  automations jsonb        default '[]',
  required_fields text[]   default '{}',
  checklist_template jsonb default '[]',
  created_at  timestamptz  default now(),
  updated_at  timestamptz  default now()
);

-- ============================================================
-- OPPORTUNITIES
-- ============================================================
create table if not exists public.opportunities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  funnel_id       uuid references public.funnels not null,
  stage_id        uuid references public.pipeline_stages not null,
  lead_id         uuid references public.leads,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  title           varchar(255) not null,
  description     text,
  value           numeric(15,2),
  currency        varchar(3)   default 'BRL',
  probability     integer      default 0,
  expected_close_date date,
  actual_close_date   date,
  status          varchar(50)  default 'open',
  lost_reason     varchar(255),
  lost_reason_detail text,
  owner_id        uuid references public.profiles,
  team_id         uuid references public.teams,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  position        integer      default 0,
  checklist       jsonb        default '[]',
  sla_deadline    timestamptz,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  deleted_at      timestamptz
);

create table if not exists public.stage_history (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid references public.opportunities not null,
  from_stage_id  uuid references public.pipeline_stages,
  to_stage_id    uuid references public.pipeline_stages not null,
  changed_by     uuid references public.profiles not null,
  time_in_stage  interval,
  reason         text,
  created_at     timestamptz default now()
);

-- ============================================================
-- ACTIVITIES & TIMELINE 360°
-- ============================================================
create table if not exists public.activities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  type            varchar(50)  not null,
  subtype         varchar(50),
  title           varchar(255) not null,
  description     text,
  content         jsonb        default '{}',
  status          varchar(50)  default 'completed',
  direction       varchar(20),
  duration_seconds integer,
  lead_id         uuid references public.leads,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  opportunity_id  uuid references public.opportunities,
  performed_by    uuid references public.profiles,
  assigned_to     uuid references public.profiles,
  scheduled_at    timestamptz,
  completed_at    timestamptz,
  external_id     varchar(255),
  external_url    text,
  attachments     jsonb        default '[]',
  metadata        jsonb        default '{}',
  is_pinned       boolean      default false,
  is_private      boolean      default false,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- TASKS
-- ============================================================
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  title           varchar(255) not null,
  description     text,
  content         jsonb        default '{}',
  status          varchar(50)  default 'todo',
  priority        varchar(20)  default 'medium',
  type            varchar(50)  default 'task',
  due_date        timestamptz,
  reminder_at     timestamptz,
  completed_at    timestamptz,
  lead_id         uuid references public.leads,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  opportunity_id  uuid references public.opportunities,
  parent_task_id  uuid references public.tasks,
  owner_id        uuid references public.profiles not null,
  assigned_to     uuid references public.profiles,
  team_id         uuid references public.teams,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  attachments     jsonb        default '[]',
  estimated_hours numeric(5,2),
  actual_hours    numeric(5,2),
  position        integer      default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now(),
  deleted_at      timestamptz
);

create table if not exists public.subtasks (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid references public.tasks not null,
  title        varchar(255) not null,
  is_completed boolean     default false,
  position     integer     default 0,
  assigned_to  uuid references public.profiles,
  due_date     timestamptz,
  completed_at timestamptz,
  created_at   timestamptz default now()
);

create table if not exists public.checklists (
  id          uuid primary key default gen_random_uuid(),
  entity_type varchar(50)  not null,
  entity_id   uuid         not null,
  title       varchar(255) not null,
  items       jsonb        default '[]',
  position    integer      default 0,
  created_at  timestamptz  default now(),
  updated_at  timestamptz  default now()
);

-- ============================================================
-- COMMENTS
-- ============================================================
create table if not exists public.comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  entity_type     varchar(50) not null,
  entity_id       uuid        not null,
  parent_id       uuid references public.comments,
  content         text        not null,
  content_json    jsonb,
  author_id       uuid references public.profiles not null,
  mentions        uuid[]      default '{}',
  reactions       jsonb       default '{}',
  is_edited       boolean     default false,
  edited_at       timestamptz,
  is_internal     boolean     default false,
  attachments     jsonb       default '[]',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  deleted_at      timestamptz
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles not null,
  type            varchar(100) not null,
  title           varchar(255) not null,
  message         text,
  data            jsonb        default '{}',
  action_url      text,
  is_read         boolean      default false,
  read_at         timestamptz,
  created_at      timestamptz  default now()
);

-- ============================================================
-- EMAILS
-- ============================================================
create table if not exists public.emails (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  thread_id       varchar(255),
  message_id      varchar(255) unique,
  in_reply_to     varchar(255),
  from_email      varchar(255) not null,
  from_name       varchar(255),
  to_emails       jsonb        not null,
  cc_emails       jsonb        default '[]',
  bcc_emails      jsonb        default '[]',
  subject         varchar(500),
  body_text       text,
  body_html       text,
  direction       varchar(20)  not null,
  status          varchar(50)  default 'sent',
  contact_id      uuid references public.contacts,
  lead_id         uuid references public.leads,
  company_id      uuid references public.companies,
  opportunity_id  uuid references public.opportunities,
  sent_by         uuid references public.profiles,
  sent_at         timestamptz,
  opened_at       timestamptz,
  open_count      integer      default 0,
  clicked_at      timestamptz,
  click_count     integer      default 0,
  attachments     jsonb        default '[]',
  metadata        jsonb        default '{}',
  created_at      timestamptz  default now()
);

-- ============================================================
-- PHONE CALLS
-- ============================================================
create table if not exists public.phone_calls (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  contact_id      uuid references public.contacts,
  lead_id         uuid references public.leads,
  company_id      uuid references public.companies,
  opportunity_id  uuid references public.opportunities,
  from_number     varchar(50),
  to_number       varchar(50),
  direction       varchar(20)  not null,
  status          varchar(50),
  duration_seconds integer,
  recording_url   text,
  transcription   text,
  performed_by    uuid references public.profiles,
  notes           text,
  outcome         varchar(100),
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz  default now()
);

-- ============================================================
-- WHATSAPP MESSAGES
-- ============================================================
create table if not exists public.whatsapp_messages (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  conversation_id varchar(255),
  message_id      varchar(255) unique,
  from_number     varchar(50)  not null,
  to_number       varchar(50)  not null,
  direction       varchar(20)  not null,
  type            varchar(50)  default 'text',
  content         text,
  media_url       text,
  caption         text,
  status          varchar(50)  default 'sent',
  contact_id      uuid references public.contacts,
  lead_id         uuid references public.leads,
  opportunity_id  uuid references public.opportunities,
  sent_by         uuid references public.profiles,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  metadata        jsonb        default '{}',
  created_at      timestamptz  default now()
);

-- ============================================================
-- MEETINGS
-- ============================================================
create table if not exists public.meetings (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  title           varchar(255) not null,
  description     text,
  type            varchar(50)  default 'meeting',
  start_at        timestamptz  not null,
  end_at          timestamptz  not null,
  timezone        varchar(100) default 'America/Sao_Paulo',
  location        text,
  meeting_url     text,
  status          varchar(50)  default 'scheduled',
  organizer_id    uuid references public.profiles not null,
  attendees       jsonb        default '[]',
  contact_id      uuid references public.contacts,
  lead_id         uuid references public.leads,
  company_id      uuid references public.companies,
  opportunity_id  uuid references public.opportunities,
  notes           text,
  recording_url   text,
  transcription   text,
  summary         text,
  action_items    jsonb        default '[]',
  reminder_minutes integer     default 30,
  is_recurring    boolean      default false,
  recurrence_rule text,
  google_meet_url text,
  zoom_url        text,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- PRODUCTS
-- ============================================================
create table if not exists public.products (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  type            varchar(50)  default 'product',
  sku             varchar(100),
  price           numeric(15,2) not null default 0,
  cost            numeric(15,2),
  currency        varchar(3)   default 'BRL',
  unit            varchar(50)  default 'unit',
  tax_rate        numeric(5,2) default 0,
  is_active       boolean      default true,
  is_recurring    boolean      default false,
  billing_period  varchar(20),
  category        varchar(100),
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  image_url       text,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- PROPOSALS
-- ============================================================
create table if not exists public.proposals (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  opportunity_id  uuid references public.opportunities,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  number          varchar(50),
  title           varchar(255) not null,
  status          varchar(50)  default 'draft',
  items           jsonb        default '[]',
  subtotal        numeric(15,2),
  discount_type   varchar(20),
  discount_value  numeric(15,2) default 0,
  tax_amount      numeric(15,2) default 0,
  total           numeric(15,2),
  currency        varchar(3)   default 'BRL',
  notes           text,
  terms_conditions text,
  valid_until     date,
  sent_at         timestamptz,
  viewed_at       timestamptz,
  accepted_at     timestamptz,
  rejected_at     timestamptz,
  created_by      uuid references public.profiles not null,
  content         jsonb,
  signature_url   text,
  signed_at       timestamptz,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- CONTRACTS
-- ============================================================
create table if not exists public.contracts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  proposal_id     uuid references public.proposals,
  opportunity_id  uuid references public.opportunities,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  number          varchar(50),
  title           varchar(255) not null,
  status          varchar(50)  default 'draft',
  type            varchar(50)  default 'service',
  start_date      date,
  end_date        date,
  auto_renew      boolean      default false,
  renewal_notice_days integer  default 30,
  value           numeric(15,2),
  currency        varchar(3)   default 'BRL',
  content         jsonb,
  file_url        text,
  signed_by_client_at   timestamptz,
  signed_by_company_at  timestamptz,
  created_by      uuid references public.profiles not null,
  tags            text[]       default '{}',
  custom_fields   jsonb        default '{}',
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- INVOICES & PAYMENTS
-- ============================================================
create table if not exists public.invoices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  contract_id     uuid references public.contracts,
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  number          varchar(50),
  status          varchar(50)  default 'draft',
  items           jsonb        default '[]',
  subtotal        numeric(15,2),
  tax_amount      numeric(15,2) default 0,
  discount_amount numeric(15,2) default 0,
  total           numeric(15,2),
  currency        varchar(3)   default 'BRL',
  due_date        date,
  paid_at         timestamptz,
  payment_method  varchar(50),
  payment_link    text,
  notes           text,
  created_by      uuid references public.profiles not null,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.payments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  invoice_id      uuid references public.invoices,
  amount          numeric(15,2) not null,
  currency        varchar(3)   default 'BRL',
  method          varchar(50),
  status          varchar(50)  default 'pending',
  gateway         varchar(50),
  gateway_id      varchar(255),
  gateway_data    jsonb        default '{}',
  paid_at         timestamptz,
  created_at      timestamptz  default now()
);

-- ============================================================
-- SUPPORT TICKETS
-- ============================================================
create table if not exists public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  number          serial,
  title           varchar(255) not null,
  description     text,
  status          varchar(50)  default 'open',
  priority        varchar(20)  default 'medium',
  type            varchar(50)  default 'issue',
  contact_id      uuid references public.contacts,
  company_id      uuid references public.companies,
  assigned_to     uuid references public.profiles,
  team_id         uuid references public.teams,
  first_response_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  sla_breached    boolean      default false,
  satisfaction_score integer,
  tags            text[]       default '{}',
  attachments     jsonb        default '[]',
  custom_fields   jsonb        default '{}',
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- KNOWLEDGE BASE
-- ============================================================
create table if not exists public.knowledge_base (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  title           varchar(255) not null,
  content         text,
  content_json    jsonb,
  category        varchar(100),
  tags            text[]       default '{}',
  status          varchar(50)  default 'draft',
  author_id       uuid references public.profiles not null,
  views           integer      default 0,
  helpful_count   integer      default 0,
  not_helpful_count integer    default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- CUSTOM FIELDS
-- ============================================================
create table if not exists public.custom_fields (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  entity_type     varchar(50)  not null,
  name            varchar(100) not null,
  label           varchar(255) not null,
  type            varchar(50)  not null,
  options         jsonb,
  validation      jsonb,
  is_required     boolean      default false,
  is_unique       boolean      default false,
  is_searchable   boolean      default true,
  default_value   jsonb,
  section         varchar(100),
  position        integer      default 0,
  is_active       boolean      default true,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- TAGS & LABELS
-- ============================================================
create table if not exists public.tags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(100) not null,
  color           varchar(7)   default '#6366f1',
  description     text,
  entity_types    text[]       default '{}',
  created_at      timestamptz  default now()
);

create table if not exists public.labels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(100) not null,
  color           varchar(7)   default '#6366f1',
  icon            varchar(50),
  entity_type     varchar(50),
  created_at      timestamptz  default now()
);

-- ============================================================
-- AUTOMATIONS & WORKFLOWS
-- ============================================================
create table if not exists public.automations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  trigger_type    varchar(100) not null,
  trigger_config  jsonb        default '{}',
  conditions      jsonb        default '[]',
  actions         jsonb        default '[]',
  is_active       boolean      default true,
  run_count       integer      default 0,
  last_run_at     timestamptz,
  last_error      text,
  created_by      uuid references public.profiles not null,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.automation_logs (
  id            uuid primary key default gen_random_uuid(),
  automation_id uuid references public.automations not null,
  trigger_data  jsonb,
  status        varchar(50),
  steps_executed jsonb,
  error         text,
  duration_ms   integer,
  created_at    timestamptz default now()
);

create table if not exists public.workflows (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  nodes           jsonb        default '[]',
  edges           jsonb        default '[]',
  variables       jsonb        default '{}',
  is_active       boolean      default false,
  created_by      uuid references public.profiles,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- DASHBOARDS & WIDGETS
-- ============================================================
create table if not exists public.dashboards (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles,
  name            varchar(255) not null,
  description     text,
  is_default      boolean      default false,
  is_shared       boolean      default false,
  layout          jsonb        default '[]',
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.widgets (
  id           uuid primary key default gen_random_uuid(),
  dashboard_id uuid references public.dashboards not null,
  type         varchar(100) not null,
  title        varchar(255),
  config       jsonb        default '{}',
  data_source  jsonb        default '{}',
  filters      jsonb        default '{}',
  x            integer      default 0,
  y            integer      default 0,
  w            integer      default 4,
  h            integer      default 3,
  created_at   timestamptz  default now(),
  updated_at   timestamptz  default now()
);

-- ============================================================
-- REPORTS
-- ============================================================
create table if not exists public.reports (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  type            varchar(100) not null,
  config          jsonb        default '{}',
  filters         jsonb        default '{}',
  columns         jsonb        default '[]',
  schedule        jsonb,
  last_run_at     timestamptz,
  created_by      uuid references public.profiles not null,
  is_shared       boolean      default false,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- FORMS & LANDING PAGES
-- ============================================================
create table if not exists public.forms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  description     text,
  fields          jsonb        default '[]',
  settings        jsonb        default '{}',
  submit_action   varchar(50)  default 'create_lead',
  submit_config   jsonb        default '{}',
  style           jsonb        default '{}',
  is_active       boolean      default true,
  embed_url       text,
  views           integer      default 0,
  submissions     integer      default 0,
  conversions     integer      default 0,
  created_by      uuid references public.profiles not null,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.form_submissions (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid references public.forms not null,
  data        jsonb        not null,
  ip_address  varchar(50),
  user_agent  text,
  referrer    text,
  utm_data    jsonb        default '{}',
  lead_id     uuid references public.leads,
  contact_id  uuid references public.contacts,
  created_at  timestamptz  default now()
);

-- ============================================================
-- CAMPAIGNS & UTM
-- ============================================================
create table if not exists public.campaigns (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  type            varchar(50),
  status          varchar(50)  default 'draft',
  audience_filters jsonb       default '{}',
  content         jsonb        default '{}',
  schedule        jsonb,
  sent_count      integer      default 0,
  opened_count    integer      default 0,
  clicked_count   integer      default 0,
  converted_count integer      default 0,
  cost            numeric(15,2),
  revenue         numeric(15,2),
  created_by      uuid references public.profiles not null,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.utm_tracking (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  url             text         not null,
  utm_source      varchar(100),
  utm_medium      varchar(100),
  utm_campaign    varchar(100),
  utm_term        varchar(100),
  utm_content     varchar(100),
  clicks          integer      default 0,
  leads           integer      default 0,
  conversions     integer      default 0,
  created_by      uuid references public.profiles,
  created_at      timestamptz  default now()
);

-- ============================================================
-- FILES
-- ============================================================
create table if not exists public.files (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  original_name   varchar(255) not null,
  size            bigint       not null,
  mime_type       varchar(100),
  bucket          varchar(100) not null,
  path            text         not null,
  url             text,
  entity_type     varchar(50),
  entity_id       uuid,
  uploaded_by     uuid references public.profiles not null,
  created_at      timestamptz  default now()
);

-- ============================================================
-- EVENTS & CALENDAR
-- ============================================================
create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  title           varchar(255) not null,
  description     text,
  type            varchar(50)  default 'event',
  start_at        timestamptz  not null,
  end_at          timestamptz  not null,
  all_day         boolean      default false,
  timezone        varchar(100) default 'America/Sao_Paulo',
  color           varchar(7),
  organizer_id    uuid references public.profiles not null,
  attendees       jsonb        default '[]',
  contact_id      uuid references public.contacts,
  lead_id         uuid references public.leads,
  opportunity_id  uuid references public.opportunities,
  meeting_id      uuid references public.meetings,
  is_recurring    boolean      default false,
  recurrence_rule text,
  reminder_minutes integer[]   default '{30}',
  status          varchar(50)  default 'confirmed',
  google_event_id varchar(255),
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.reminders (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles not null,
  title           varchar(255) not null,
  message         text,
  entity_type     varchar(50),
  entity_id       uuid,
  remind_at       timestamptz  not null,
  is_sent         boolean      default false,
  sent_at         timestamptz,
  created_at      timestamptz  default now()
);

-- ============================================================
-- AI CONVERSATIONS
-- ============================================================
create table if not exists public.ai_conversations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles not null,
  title           varchar(255),
  messages        jsonb        default '[]',
  context_type    varchar(50),
  context_id      uuid,
  model           varchar(100) default 'gpt-4o-mini',
  tokens_used     integer      default 0,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- INTEGRATIONS & WEBHOOKS
-- ============================================================
create table if not exists public.integrations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(100) not null,
  type            varchar(100) not null,
  status          varchar(50)  default 'inactive',
  credentials     jsonb,
  settings        jsonb        default '{}',
  last_sync_at    timestamptz,
  error_message   text,
  created_by      uuid references public.profiles,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.webhooks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  url             text         not null,
  events          text[]       default '{}',
  secret          varchar(255),
  headers         jsonb        default '{}',
  is_active       boolean      default true,
  delivery_count  integer      default 0,
  last_delivery_at timestamptz,
  last_error      text,
  created_by      uuid references public.profiles,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

create table if not exists public.webhook_logs (
  id          uuid primary key default gen_random_uuid(),
  webhook_id  uuid references public.webhooks not null,
  event       varchar(100) not null,
  payload     jsonb,
  status_code integer,
  response    text,
  is_success  boolean,
  duration_ms integer,
  created_at  timestamptz default now()
);

-- ============================================================
-- API KEYS
-- ============================================================
create table if not exists public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  name            varchar(255) not null,
  key_hash        varchar(255) not null unique,
  key_prefix      varchar(20)  not null,
  scopes          text[]       default '{}',
  last_used_at    timestamptz,
  expires_at      timestamptz,
  is_active       boolean      default true,
  created_by      uuid references public.profiles not null,
  created_at      timestamptz  default now()
);

-- ============================================================
-- AUDIT & LOGS
-- ============================================================
create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles,
  action          varchar(100) not null,
  entity_type     varchar(100) not null,
  entity_id       uuid,
  old_data        jsonb,
  new_data        jsonb,
  changes         jsonb,
  ip_address      varchar(50),
  user_agent      text,
  created_at      timestamptz  default now()
);

create table if not exists public.logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations,
  level           varchar(20)  not null,
  message         text         not null,
  context         jsonb        default '{}',
  source          varchar(100),
  created_at      timestamptz  default now()
);

-- ============================================================
-- NOTES
-- ============================================================
create table if not exists public.notes (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  title           varchar(255),
  content         text,
  content_json    jsonb,
  entity_type     varchar(50),
  entity_id       uuid,
  is_pinned       boolean      default false,
  is_private      boolean      default false,
  author_id       uuid references public.profiles not null,
  tags            text[]       default '{}',
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- CUSTOM VIEWS
-- ============================================================
create table if not exists public.custom_views (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  user_id         uuid references public.profiles,
  entity_type     varchar(50)  not null,
  name            varchar(255) not null,
  type            varchar(50)  default 'list',
  filters         jsonb        default '[]',
  sort            jsonb        default '[]',
  columns         jsonb        default '[]',
  grouping        jsonb,
  is_default      boolean      default false,
  is_shared       boolean      default false,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations not null,
  plan            varchar(50)  not null,
  status          varchar(50)  default 'active',
  billing_period  varchar(20)  default 'monthly',
  amount          numeric(15,2),
  currency        varchar(3)   default 'BRL',
  current_period_start timestamptz,
  current_period_end   timestamptz,
  gateway         varchar(50),
  gateway_subscription_id varchar(255),
  gateway_data    jsonb        default '{}',
  cancel_at       timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz  default now(),
  updated_at      timestamptz  default now()
);

-- ============================================================
-- INDEXES (Performance)
-- ============================================================
create index if not exists idx_profiles_org on public.profiles(organization_id);
create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_companies_org on public.companies(organization_id);
create index if not exists idx_companies_name on public.companies using gin(name gin_trgm_ops);
create index if not exists idx_contacts_org on public.contacts(organization_id);
create index if not exists idx_contacts_company on public.contacts(company_id);
create index if not exists idx_contacts_email on public.contacts(email);
create index if not exists idx_leads_org on public.leads(organization_id);
create index if not exists idx_leads_owner on public.leads(owner_id);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_created on public.leads(created_at desc);
create index if not exists idx_opportunities_org on public.opportunities(organization_id);
create index if not exists idx_opportunities_funnel on public.opportunities(funnel_id);
create index if not exists idx_opportunities_stage on public.opportunities(stage_id);
create index if not exists idx_opportunities_status on public.opportunities(status);
create index if not exists idx_activities_org on public.activities(organization_id);
create index if not exists idx_activities_lead on public.activities(lead_id);
create index if not exists idx_activities_contact on public.activities(contact_id);
create index if not exists idx_activities_type on public.activities(type);
create index if not exists idx_activities_created on public.activities(created_at desc);
create index if not exists idx_tasks_org on public.tasks(organization_id);
create index if not exists idx_tasks_owner on public.tasks(owner_id);
create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_tasks_due on public.tasks(due_date);
create index if not exists idx_notifications_user on public.notifications(user_id, is_read);
create index if not exists idx_audit_org on public.audit_logs(organization_id, created_at desc);
create index if not exists idx_events_dates on public.events(organization_id, start_at, end_at);
create index if not exists idx_comments_entity on public.comments(entity_type, entity_id);
