-- ============================================================
-- CRM Pro - Migration 006: Hardening de Segurança (RLS / RBAC)
-- Execute no SQL Editor do Supabase APÓS as migrations 001-005.
--
-- Corrige falhas CRÍTICAS de isolamento entre tenants e de
-- escalonamento de privilégio identificadas em auditoria:
--   C1  profiles_update sem WITH CHECK -> usuário migrava de org
--   C2  qualquer membro virava admin (roles/user_roles abertos)
--   C3  checklists com RLS using(true) -> vazamento cross-tenant
--   C5  policies de tabelas-filho sem WITH CHECK -> INSERT cross-tenant
--   C6  RPCs SECURITY DEFINER aceitavam org_id arbitrário -> vazamento
--   A1  funções SECURITY DEFINER sem search_path fixo
--   A2  segredos (api_keys/webhooks/integrations) legíveis por qualquer membro
--   A3  org/subscriptions alteráveis por não-admin (fraude de cota/billing)
-- + índices em organization_id e endurecimento de triggers.
--
-- Idempotente: pode ser reexecutada.
-- ============================================================

-- ============================================================
-- 0. Helpers de segurança (search_path fixo)
-- ============================================================

-- Org do usuário logado (base de TODAS as policies)
create or replace function public.get_user_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select organization_id from public.profiles where id = auth.uid();
$$;

-- É admin da própria org? (level >= 100). SECURITY DEFINER evita recursão de RLS.
create or replace function public.is_org_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.organization_id = public.get_user_org_id()
      and r.level >= 100
  );
$$;

-- ============================================================
-- C1. profiles: impedir migração de org / edição de linha alheia
-- ============================================================
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid() and organization_id = public.get_user_org_id());

-- Defesa em profundidade: organization_id imutável após criação
create or replace function public.guard_profile_org()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'organization_id é imutável';
  end if;
  return new;
end;
$$;
drop trigger if exists tr_profiles_guard_org on public.profiles;
create trigger tr_profiles_guard_org
  before update on public.profiles
  for each row execute function public.guard_profile_org();

-- ============================================================
-- C2. RBAC real: somente admin altera roles e user_roles
-- ============================================================
drop policy if exists "roles_all" on public.roles;
create policy "roles_select" on public.roles
  for select using (organization_id = public.get_user_org_id());
create policy "roles_write" on public.roles
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

drop policy if exists "user_roles_all" on public.user_roles;
create policy "user_roles_select" on public.user_roles
  for select using (organization_id = public.get_user_org_id());
create policy "user_roles_write" on public.user_roles
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

-- ============================================================
-- C3. checklists: adicionar organization_id e escopar por tenant
-- ============================================================
alter table public.checklists
  add column if not exists organization_id uuid references public.organizations;

drop policy if exists "checklists_all" on public.checklists;
create policy "checklists_all" on public.checklists
  for all
  using (organization_id = public.get_user_org_id())
  with check (organization_id = public.get_user_org_id());

-- ============================================================
-- C5. Tabelas-filho: espelhar o predicado em WITH CHECK
--     (sem WITH CHECK, INSERT/UPDATE cross-tenant passavam)
-- ============================================================
drop policy if exists "lead_scores_all" on public.lead_scores;
create policy "lead_scores_all" on public.lead_scores
  for all
  using (lead_id in (select id from public.leads where organization_id = public.get_user_org_id()))
  with check (lead_id in (select id from public.leads where organization_id = public.get_user_org_id()));

drop policy if exists "stages_all" on public.pipeline_stages;
create policy "stages_all" on public.pipeline_stages
  for all
  using (funnel_id in (select id from public.funnels where organization_id = public.get_user_org_id()))
  with check (funnel_id in (select id from public.funnels where organization_id = public.get_user_org_id()));

drop policy if exists "stage_history_all" on public.stage_history;
create policy "stage_history_all" on public.stage_history
  for all
  using (opportunity_id in (select id from public.opportunities where organization_id = public.get_user_org_id()))
  with check (opportunity_id in (select id from public.opportunities where organization_id = public.get_user_org_id()));

drop policy if exists "subtasks_all" on public.subtasks;
create policy "subtasks_all" on public.subtasks
  for all
  using (task_id in (select id from public.tasks where organization_id = public.get_user_org_id()))
  with check (task_id in (select id from public.tasks where organization_id = public.get_user_org_id()));

drop policy if exists "automation_logs_all" on public.automation_logs;
create policy "automation_logs_all" on public.automation_logs
  for all
  using (automation_id in (select id from public.automations where organization_id = public.get_user_org_id()))
  with check (automation_id in (select id from public.automations where organization_id = public.get_user_org_id()));

drop policy if exists "widgets_all" on public.widgets;
create policy "widgets_all" on public.widgets
  for all
  using (dashboard_id in (select id from public.dashboards where organization_id = public.get_user_org_id()))
  with check (dashboard_id in (select id from public.dashboards where organization_id = public.get_user_org_id()));

drop policy if exists "form_submissions_all" on public.form_submissions;
create policy "form_submissions_all" on public.form_submissions
  for all
  using (form_id in (select id from public.forms where organization_id = public.get_user_org_id()))
  with check (form_id in (select id from public.forms where organization_id = public.get_user_org_id()));

drop policy if exists "webhook_logs_all" on public.webhook_logs;
create policy "webhook_logs_all" on public.webhook_logs
  for all
  using (webhook_id in (select id from public.webhooks where organization_id = public.get_user_org_id()))
  with check (webhook_id in (select id from public.webhooks where organization_id = public.get_user_org_id()));

drop policy if exists "team_members_all" on public.team_members;
create policy "team_members_all" on public.team_members
  for all
  using (team_id in (select id from public.teams where organization_id = public.get_user_org_id()))
  with check (team_id in (select id from public.teams where organization_id = public.get_user_org_id()));

-- ============================================================
-- A2. Segredos: somente admin lê/escreve
-- ============================================================
drop policy if exists "api_keys_all" on public.api_keys;
create policy "api_keys_admin" on public.api_keys
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

drop policy if exists "webhooks_all" on public.webhooks;
create policy "webhooks_admin" on public.webhooks
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

drop policy if exists "integrations_all" on public.integrations;
create policy "integrations_admin" on public.integrations
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

-- ============================================================
-- A3. Billing: leitura para a org, escrita só admin (anti-fraude)
-- ============================================================
drop policy if exists "payments_all" on public.payments;
create policy "payments_select" on public.payments
  for select using (organization_id = public.get_user_org_id());
create policy "payments_admin" on public.payments
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

drop policy if exists "invoices_all" on public.invoices;
create policy "invoices_select" on public.invoices
  for select using (organization_id = public.get_user_org_id());
create policy "invoices_admin" on public.invoices
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

drop policy if exists "subscriptions_all" on public.subscriptions;
create policy "subscriptions_select" on public.subscriptions
  for select using (organization_id = public.get_user_org_id());
create policy "subscriptions_admin" on public.subscriptions
  for all
  using (organization_id = public.get_user_org_id() and public.is_org_admin())
  with check (organization_id = public.get_user_org_id() and public.is_org_admin());

-- organizations: só admin altera
drop policy if exists "org_update" on public.organizations;
create policy "org_update" on public.organizations
  for update
  using (id = public.get_user_org_id() and public.is_org_admin())
  with check (id = public.get_user_org_id());

-- ============================================================
-- C6 + A1. RPCs: forçar a org do chamador / validar ownership
--          + search_path fixo em todas as SECURITY DEFINER
-- ============================================================

-- global_search: ignora p_org_id, sempre usa a org do chamador
create or replace function public.global_search(
  p_query  text,
  p_org_id uuid default null,
  p_limit  integer default 20
)
returns table (
  id uuid, entity_type text, title text, subtitle text, url text, created_at timestamptz
)
language sql security definer stable
set search_path = public
as $$
  select id, 'lead'::text, title, status, '/leads/' || id, created_at
  from public.leads
  where organization_id = public.get_user_org_id() and deleted_at is null
    and (title ilike '%' || p_query || '%' or description ilike '%' || p_query || '%')
  union all
  select id, 'contact', first_name || ' ' || coalesce(last_name, ''), email, '/contacts/' || id, created_at
  from public.contacts
  where organization_id = public.get_user_org_id() and deleted_at is null
    and (first_name ilike '%' || p_query || '%' or last_name ilike '%' || p_query || '%' or email ilike '%' || p_query || '%')
  union all
  select id, 'company', name, industry, '/companies/' || id, created_at
  from public.companies
  where organization_id = public.get_user_org_id() and deleted_at is null
    and name ilike '%' || p_query || '%'
  union all
  select id, 'opportunity', title, status, '/pipeline/' || id, created_at
  from public.opportunities
  where organization_id = public.get_user_org_id() and deleted_at is null
    and title ilike '%' || p_query || '%'
  order by created_at desc
  limit p_limit;
$$;

-- get_dashboard_kpis: ignora p_org_id
create or replace function public.get_dashboard_kpis(p_org_id uuid default null)
returns jsonb language plpgsql security definer stable
set search_path = public
as $$
declare
  v_org_id uuid := public.get_user_org_id();
  result   jsonb;
begin
  select jsonb_build_object(
    'leads_total',        (select count(*) from public.leads where organization_id = v_org_id and deleted_at is null),
    'leads_new',          (select count(*) from public.leads where organization_id = v_org_id and created_at >= now() - interval '30 days' and deleted_at is null),
    'leads_hot',          (select count(*) from public.leads where organization_id = v_org_id and temperature = 'hot' and deleted_at is null),
    'opportunities_open', (select count(*) from public.opportunities where organization_id = v_org_id and status = 'open' and deleted_at is null),
    'revenue_open',       (select coalesce(sum(value), 0) from public.opportunities where organization_id = v_org_id and status = 'open' and deleted_at is null),
    'revenue_won',        (select coalesce(sum(value), 0) from public.opportunities where organization_id = v_org_id and status = 'won' and actual_close_date >= date_trunc('month', now())),
    'tasks_overdue',      (select count(*) from public.tasks where organization_id = v_org_id and status != 'done' and due_date < now() and deleted_at is null),
    'tasks_today',        (select count(*) from public.tasks where organization_id = v_org_id and status != 'done' and due_date::date = current_date and deleted_at is null),
    'contacts_total',     (select count(*) from public.contacts where organization_id = v_org_id and deleted_at is null),
    'companies_total',    (select count(*) from public.companies where organization_id = v_org_id and deleted_at is null),
    'conversion_rate',    (select case when count(*) = 0 then 0 else round(count(*) filter (where status = 'won') * 100.0 / count(*), 1) end
                           from public.opportunities where organization_id = v_org_id)
  ) into result;
  return result;
end;
$$;

-- get_monthly_revenue: ignora p_org_id
create or replace function public.get_monthly_revenue(p_org_id uuid default null, p_months integer default 12)
returns table(month text, revenue numeric, won_count bigint)
language sql security definer stable
set search_path = public
as $$
  select to_char(date_trunc('month', actual_close_date), 'YYYY-MM') as month,
         sum(value) as revenue, count(*) as won_count
  from public.opportunities
  where organization_id = public.get_user_org_id()
    and status = 'won'
    and actual_close_date >= now() - (p_months || ' months')::interval
  group by date_trunc('month', actual_close_date)
  order by 1;
$$;

-- get_pipeline_data: valida que o funil pertence à org do chamador
create or replace function public.get_pipeline_data(p_funnel_id uuid)
returns jsonb language plpgsql security definer stable
set search_path = public
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.funnels where id = p_funnel_id and organization_id = public.get_user_org_id()) then
    raise exception 'not authorized';
  end if;
  select jsonb_agg(
    jsonb_build_object(
      'stage', row_to_json(s),
      'opportunities', (select jsonb_agg(row_to_json(o) order by o.position) from public.opportunities o
                        where o.stage_id = s.id and o.status = 'open' and o.deleted_at is null),
      'total_value', (select coalesce(sum(value), 0) from public.opportunities where stage_id = s.id and status = 'open' and deleted_at is null),
      'count', (select count(*) from public.opportunities where stage_id = s.id and status = 'open' and deleted_at is null)
    ) order by s.position
  ) into result
  from public.pipeline_stages s
  where s.funnel_id = p_funnel_id;
  return result;
end;
$$;

-- get_funnel_stats: valida ownership do funil
create or replace function public.get_funnel_stats(p_funnel_id uuid)
returns jsonb language plpgsql security definer stable
set search_path = public
as $$
declare result jsonb;
begin
  if not exists (select 1 from public.funnels where id = p_funnel_id and organization_id = public.get_user_org_id()) then
    raise exception 'not authorized';
  end if;
  select jsonb_build_object(
    'total', count(*),
    'won',   count(*) filter (where status = 'won'),
    'lost',  count(*) filter (where status = 'lost'),
    'open',  count(*) filter (where status = 'open'),
    'total_value', coalesce(sum(value) filter (where status = 'open'), 0),
    'won_value',   coalesce(sum(value) filter (where status = 'won'), 0),
    'conversion',  case when count(*) = 0 then 0 else round(count(*) filter (where status = 'won') * 100.0 / count(*), 1) end,
    'avg_cycle_days', round(avg(case when status = 'won' and actual_close_date is not null
        then extract(epoch from (actual_close_date::timestamptz - created_at)) / 86400 end))
  )
  into result
  from public.opportunities
  where funnel_id = p_funnel_id and deleted_at is null;
  return result;
end;
$$;

-- get_timeline: convertida para SECURITY INVOKER -> RLS escopa por tenant
create or replace function public.get_timeline(
  p_entity_type text, p_entity_id uuid, p_limit integer default 50, p_offset integer default 0
)
returns jsonb language plpgsql security invoker stable
set search_path = public
as $$
declare result jsonb;
begin
  select jsonb_agg(t order by t.created_at desc)
  into result
  from (
    select 'activity' as timeline_type, id, type as subtype, title, description,
           performed_by as user_id, created_at, is_pinned, metadata
    from public.activities
    where ((p_entity_type = 'lead' and lead_id = p_entity_id) or
           (p_entity_type = 'contact' and contact_id = p_entity_id) or
           (p_entity_type = 'company' and company_id = p_entity_id) or
           (p_entity_type = 'opportunity' and opportunity_id = p_entity_id))
    union all
    select 'comment', id, 'comment', title, content, author_id, created_at, false, metadata
    from public.comments
    where entity_type = p_entity_type and entity_id = p_entity_id and deleted_at is null
    union all
    select 'task', id, priority, title, description, owner_id, created_at, false, '{}'::jsonb
    from public.tasks
    where ((p_entity_type = 'lead' and lead_id = p_entity_id) or
           (p_entity_type = 'contact' and contact_id = p_entity_id) or
           (p_entity_type = 'company' and company_id = p_entity_id) or
           (p_entity_type = 'opportunity' and opportunity_id = p_entity_id)) and deleted_at is null
    union all
    select 'email', id, direction, subject, body_text, sent_by, coalesce(sent_at, created_at), false, metadata
    from public.emails
    where ((p_entity_type = 'lead' and lead_id = p_entity_id) or
           (p_entity_type = 'contact' and contact_id = p_entity_id))
    union all
    select 'meeting', id, type, title, description, organizer_id, created_at, false, '{}'::jsonb
    from public.meetings
    where ((p_entity_type = 'lead' and lead_id = p_entity_id) or
           (p_entity_type = 'contact' and contact_id = p_entity_id) or
           (p_entity_type = 'opportunity' and opportunity_id = p_entity_id))
  ) t
  limit p_limit offset p_offset;
  return coalesce(result, '[]'::jsonb);
end;
$$;

-- calculate_lead_score: search_path fixo
create or replace function public.calculate_lead_score(p_lead_id uuid)
returns integer language plpgsql security definer
set search_path = public
as $$
declare
  total_score integer := 0;
  lead_rec    record;
begin
  select * into lead_rec from public.leads where id = p_lead_id;
  if not found then return 0; end if;
  case lead_rec.temperature
    when 'hot'  then total_score := total_score + 30;
    when 'warm' then total_score := total_score + 15;
    when 'cold' then total_score := total_score + 5;
    else null;
  end case;
  if exists (select 1 from public.contacts where id = lead_rec.contact_id and email is not null) then total_score := total_score + 10; end if;
  if exists (select 1 from public.contacts where id = lead_rec.contact_id and phone is not null) then total_score := total_score + 5;  end if;
  if lead_rec.company_id is not null then total_score := total_score + 10; end if;
  total_score := total_score + least(25, (select count(*) * 5 from public.activities where lead_id = p_lead_id and created_at >= now() - interval '7 days'));
  if lead_rec.value is not null and lead_rec.value > 0 then total_score := total_score + 10; end if;
  update public.leads set score = total_score where id = p_lead_id;
  return total_score;
end;
$$;

-- handle_audit_log: search_path + defensivo (não derruba a operação)
create or replace function public.handle_audit_log()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  org_id  uuid;
  changes jsonb := '{}';
  col     text;
begin
  begin
    if TG_OP = 'DELETE' then org_id := old.organization_id; else org_id := new.organization_id; end if;
  exception when others then org_id := null;
  end;

  if TG_OP = 'UPDATE' then
    for col in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(old)->col is distinct from to_jsonb(new)->col then
        changes := changes || jsonb_build_object(col, jsonb_build_object('from', to_jsonb(old)->col, 'to', to_jsonb(new)->col));
      end if;
    end loop;
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_data, new_data, changes)
  values (
    org_id, auth.uid(), lower(TG_OP), TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    case when TG_OP = 'UPDATE' then changes else null end
  );
  return coalesce(new, old);
exception when others then
  -- auditoria nunca deve bloquear a operação de negócio
  raise warning '[handle_audit_log] %: %', TG_TABLE_NAME, sqlerrm;
  return coalesce(new, old);
end;
$$;

-- handle_task_assignment: search_path fixo
create or replace function public.handle_task_assignment()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if new.assigned_to is not null and (old is null or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (organization_id, user_id, type, title, message, data, action_url)
    values (new.organization_id, new.assigned_to, 'task_assigned', 'Nova tarefa atribuída',
            'Você recebeu a tarefa: ' || new.title,
            jsonb_build_object('task_id', new.id, 'priority', new.priority), '/tasks/' || new.id);
  end if;
  return new;
end;
$$;

-- handle_stage_change: search_path + changed_by tolerante a auth.uid() nulo
create or replace function public.handle_stage_change()
returns trigger language plpgsql
set search_path = public
as $$
declare
  from_stage_name text;
  to_stage_name   text;
  time_in_stage   interval;
  v_actor         uuid := coalesce(auth.uid(), new.owner_id);
begin
  if old.stage_id = new.stage_id then return new; end if;
  select name into from_stage_name from public.pipeline_stages where id = old.stage_id;
  select name into to_stage_name   from public.pipeline_stages where id = new.stage_id;
  select now() - max(created_at) into time_in_stage
  from public.stage_history where opportunity_id = new.id and to_stage_id = old.stage_id;

  insert into public.stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by, time_in_stage)
  values (new.id, old.stage_id, new.stage_id, v_actor, coalesce(time_in_stage, interval '0'));

  insert into public.activities (organization_id, type, title, description, opportunity_id, contact_id, company_id, lead_id, performed_by, status)
  values (new.organization_id, 'stage_change',
          'Etapa alterada: ' || from_stage_name || ' → ' || to_stage_name,
          'Oportunidade movida de "' || from_stage_name || '" para "' || to_stage_name || '"',
          new.id, new.contact_id, new.company_id, new.lead_id, v_actor, 'completed');
  return new;
end;
$$;

-- ============================================================
-- M2. Índices em organization_id (RLS filtra por ele em toda query)
-- ============================================================
create index if not exists idx_teams_org           on public.teams(organization_id);
create index if not exists idx_roles_org            on public.roles(organization_id);
create index if not exists idx_user_roles_org       on public.user_roles(organization_id);
create index if not exists idx_funnels_org          on public.funnels(organization_id);
create index if not exists idx_comments_org         on public.comments(organization_id);
create index if not exists idx_notifications_org    on public.notifications(organization_id);
create index if not exists idx_notifications_user   on public.notifications(user_id);
create index if not exists idx_emails_org           on public.emails(organization_id);
create index if not exists idx_meetings_org         on public.meetings(organization_id);
create index if not exists idx_products_org         on public.products(organization_id);
create index if not exists idx_proposals_org        on public.proposals(organization_id);
create index if not exists idx_contracts_org        on public.contracts(organization_id);
create index if not exists idx_invoices_org         on public.invoices(organization_id);
create index if not exists idx_payments_org         on public.payments(organization_id);
create index if not exists idx_notes_org            on public.notes(organization_id);
create index if not exists idx_automations_org      on public.automations(organization_id);
create index if not exists idx_webhooks_org         on public.webhooks(organization_id);
create index if not exists idx_api_keys_org         on public.api_keys(organization_id);
create index if not exists idx_subscriptions_org    on public.subscriptions(organization_id);
create index if not exists idx_activities_org       on public.activities(organization_id);
create index if not exists idx_tasks_org            on public.tasks(organization_id);
create index if not exists idx_opportunities_org    on public.opportunities(organization_id);
create index if not exists idx_leads_org            on public.leads(organization_id);
create index if not exists idx_contacts_org         on public.contacts(organization_id);
create index if not exists idx_companies_org        on public.companies(organization_id);
