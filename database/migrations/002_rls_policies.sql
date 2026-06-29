-- ============================================================
-- CRM Pro - Migration 002: Row Level Security (RLS)
-- ============================================================

-- Habilita RLS em todas as tabelas
alter table public.organizations        enable row level security;
alter table public.profiles             enable row level security;
alter table public.teams                enable row level security;
alter table public.team_members         enable row level security;
alter table public.roles                enable row level security;
alter table public.user_roles           enable row level security;
alter table public.companies            enable row level security;
alter table public.contacts             enable row level security;
alter table public.leads                enable row level security;
alter table public.lead_scores          enable row level security;
alter table public.funnels              enable row level security;
alter table public.pipeline_stages      enable row level security;
alter table public.opportunities        enable row level security;
alter table public.stage_history        enable row level security;
alter table public.activities           enable row level security;
alter table public.tasks                enable row level security;
alter table public.subtasks             enable row level security;
alter table public.checklists           enable row level security;
alter table public.comments             enable row level security;
alter table public.notifications        enable row level security;
alter table public.emails               enable row level security;
alter table public.phone_calls          enable row level security;
alter table public.whatsapp_messages    enable row level security;
alter table public.meetings             enable row level security;
alter table public.products             enable row level security;
alter table public.proposals            enable row level security;
alter table public.contracts            enable row level security;
alter table public.invoices             enable row level security;
alter table public.payments             enable row level security;
alter table public.support_tickets      enable row level security;
alter table public.knowledge_base       enable row level security;
alter table public.custom_fields        enable row level security;
alter table public.tags                 enable row level security;
alter table public.labels               enable row level security;
alter table public.automations          enable row level security;
alter table public.automation_logs      enable row level security;
alter table public.workflows            enable row level security;
alter table public.dashboards           enable row level security;
alter table public.widgets              enable row level security;
alter table public.reports              enable row level security;
alter table public.forms                enable row level security;
alter table public.form_submissions     enable row level security;
alter table public.campaigns            enable row level security;
alter table public.utm_tracking         enable row level security;
alter table public.files                enable row level security;
alter table public.events               enable row level security;
alter table public.reminders            enable row level security;
alter table public.ai_conversations     enable row level security;
alter table public.integrations         enable row level security;
alter table public.webhooks             enable row level security;
alter table public.webhook_logs         enable row level security;
alter table public.api_keys             enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.notes                enable row level security;
alter table public.custom_views         enable row level security;
alter table public.subscriptions        enable row level security;

-- ============================================================
-- Helper Function: retorna organization_id do usuário logado
-- ============================================================
create or replace function public.get_user_org_id()
returns uuid language sql stable security definer as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- ============================================================
-- POLICIES: Organizations
-- ============================================================
create policy "org_select" on public.organizations
  for select using (id = public.get_user_org_id());

create policy "org_update" on public.organizations
  for update using (id = public.get_user_org_id());

-- ============================================================
-- POLICIES: Profiles
-- ============================================================
create policy "profiles_select" on public.profiles
  for select using (organization_id = public.get_user_org_id() or id = auth.uid());

create policy "profiles_insert" on public.profiles
  for insert with check (id = auth.uid());

create policy "profiles_update" on public.profiles
  for update using (id = auth.uid());

-- ============================================================
-- Macro para criar políticas padrão por org
-- ============================================================
-- Para cada tabela com organization_id criamos:
-- SELECT: pertence à mesma org
-- INSERT: pertence à mesma org
-- UPDATE: pertence à mesma org
-- DELETE: pertence à mesma org

-- Companies
create policy "companies_all" on public.companies
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Contacts
create policy "contacts_all" on public.contacts
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Leads
create policy "leads_all" on public.leads
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Lead Scores
create policy "lead_scores_all" on public.lead_scores
  for all using (
    lead_id in (select id from public.leads where organization_id = public.get_user_org_id())
  );

-- Funnels
create policy "funnels_all" on public.funnels
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Pipeline Stages
create policy "stages_all" on public.pipeline_stages
  for all using (
    funnel_id in (select id from public.funnels where organization_id = public.get_user_org_id())
  );

-- Opportunities
create policy "opportunities_all" on public.opportunities
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Stage History
create policy "stage_history_all" on public.stage_history
  for all using (
    opportunity_id in (select id from public.opportunities where organization_id = public.get_user_org_id())
  );

-- Activities
create policy "activities_all" on public.activities
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Tasks
create policy "tasks_all" on public.tasks
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Subtasks
create policy "subtasks_all" on public.subtasks
  for all using (
    task_id in (select id from public.tasks where organization_id = public.get_user_org_id())
  );

-- Checklists
create policy "checklists_all" on public.checklists
  for all using (true); -- scoped via entity_id

-- Comments
create policy "comments_all" on public.comments
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Notifications (só vê as próprias)
create policy "notifications_own" on public.notifications
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Emails
create policy "emails_all" on public.emails
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Phone calls
create policy "calls_all" on public.phone_calls
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- WhatsApp
create policy "whatsapp_all" on public.whatsapp_messages
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Meetings
create policy "meetings_all" on public.meetings
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Products
create policy "products_all" on public.products
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Proposals
create policy "proposals_all" on public.proposals
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Contracts
create policy "contracts_all" on public.contracts
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Invoices
create policy "invoices_all" on public.invoices
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Payments
create policy "payments_all" on public.payments
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Support Tickets
create policy "tickets_all" on public.support_tickets
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Knowledge Base
create policy "kb_all" on public.knowledge_base
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Custom Fields
create policy "custom_fields_all" on public.custom_fields
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Tags
create policy "tags_all" on public.tags
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Labels
create policy "labels_all" on public.labels
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Automations
create policy "automations_all" on public.automations
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Automation Logs
create policy "automation_logs_all" on public.automation_logs
  for all using (
    automation_id in (select id from public.automations where organization_id = public.get_user_org_id())
  );

-- Workflows
create policy "workflows_all" on public.workflows
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Dashboards (próprio ou compartilhado)
create policy "dashboards_all" on public.dashboards
  for all using (
    organization_id = public.get_user_org_id()
    and (user_id = auth.uid() or is_shared = true)
  )
  with check (organization_id = public.get_user_org_id());

-- Widgets
create policy "widgets_all" on public.widgets
  for all using (
    dashboard_id in (select id from public.dashboards where organization_id = public.get_user_org_id())
  );

-- Reports
create policy "reports_all" on public.reports
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Forms
create policy "forms_all" on public.forms
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Form Submissions
create policy "form_submissions_all" on public.form_submissions
  for all using (
    form_id in (select id from public.forms where organization_id = public.get_user_org_id())
  );

-- Campaigns
create policy "campaigns_all" on public.campaigns
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- UTM Tracking
create policy "utm_all" on public.utm_tracking
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Files
create policy "files_all" on public.files
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Events
create policy "events_all" on public.events
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Reminders (próprios)
create policy "reminders_own" on public.reminders
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- AI Conversations (próprias)
create policy "ai_own" on public.ai_conversations
  for all using (user_id = auth.uid() and organization_id = public.get_user_org_id())
  with check (user_id = auth.uid() and organization_id = public.get_user_org_id());

-- Integrations
create policy "integrations_all" on public.integrations
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Webhooks
create policy "webhooks_all" on public.webhooks
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Webhook Logs
create policy "webhook_logs_all" on public.webhook_logs
  for all using (
    webhook_id in (select id from public.webhooks where organization_id = public.get_user_org_id())
  );

-- API Keys
create policy "api_keys_all" on public.api_keys
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Audit Logs (somente leitura)
create policy "audit_select" on public.audit_logs
  for select using (organization_id = public.get_user_org_id());

-- Notes
create policy "notes_all" on public.notes
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Custom Views
create policy "views_all" on public.custom_views
  for all using (
    organization_id = public.get_user_org_id()
    and (user_id = auth.uid() or is_shared = true)
  )
  with check (organization_id = public.get_user_org_id());

-- Subscriptions
create policy "subscriptions_all" on public.subscriptions
  for all using (organization_id = public.get_user_org_id());

-- Teams
create policy "teams_all" on public.teams
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- Team Members
create policy "team_members_all" on public.team_members
  for all using (
    team_id in (select id from public.teams where organization_id = public.get_user_org_id())
  );

-- Roles
create policy "roles_all" on public.roles
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- User Roles
create policy "user_roles_all" on public.user_roles
  for all using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());
