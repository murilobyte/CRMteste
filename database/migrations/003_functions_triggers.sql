-- ============================================================
-- CRM Pro - Migration 003: Functions, Triggers & RPCs
-- ============================================================

-- ============================================================
-- TRIGGER: updated_at automático
-- ============================================================
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Aplica o trigger em todas as tabelas com updated_at
do $$
declare
  t text;
  tables text[] := array[
    'organizations','profiles','teams','companies','contacts','leads',
    'funnels','pipeline_stages','opportunities','activities','tasks',
    'checklists','comments','meetings','products','proposals','contracts',
    'invoices','automations','workflows','dashboards','widgets','reports',
    'forms','campaigns','events','integrations','webhooks','notes',
    'custom_views','subscriptions','support_tickets','knowledge_base',
    'custom_fields','ai_conversations'
  ];
begin
  foreach t in array tables loop
    execute format('
      drop trigger if exists tr_%s_updated_at on public.%s;
      create trigger tr_%s_updated_at
        before update on public.%s
        for each row execute function public.handle_updated_at();
    ', t, t, t, t);
  end loop;
end;
$$;

-- ============================================================
-- TRIGGER: Auto-criar Profile após signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  org_id uuid;
  org_name text;
begin
  -- Tenta pegar o nome da empresa dos metadados
  org_name := coalesce(
    new.raw_user_meta_data->>'organization_name',
    split_part(new.email, '@', 2)
  );

  -- Cria uma organização padrão se não tiver
  if new.raw_user_meta_data->>'organization_id' is null then
    insert into public.organizations (name, slug, plan)
    values (
      org_name,
      lower(regexp_replace(org_name, '[^a-z0-9]', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8),
      'starter'
    )
    returning id into org_id;
  else
    org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
  end if;

  -- Cria o perfil
  insert into public.profiles (id, organization_id, email, first_name, last_name)
  values (
    new.id,
    org_id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'last_name'
  );

  -- Cria role de admin para o primeiro usuário da org
  insert into public.user_roles (user_id, role_id, organization_id, granted_by)
  select new.id, r.id, org_id, new.id
  from public.roles r
  where r.organization_id = org_id and r.name = 'admin'
  limit 1;

  return new;
end;
$$;

drop trigger if exists tr_new_user on auth.users;
create trigger tr_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- TRIGGER: Seed inicial de roles, funnel e dashboard por org
-- ============================================================
create or replace function public.handle_new_organization()
returns trigger language plpgsql security definer as $$
declare
  admin_role_id uuid;
  member_role_id uuid;
  viewer_role_id uuid;
  funnel_id uuid;
  stage1_id uuid;
  stage2_id uuid;
  stage3_id uuid;
  stage4_id uuid;
  stage5_id uuid;
begin
  -- Cria roles padrão
  insert into public.roles (organization_id, name, description, is_system, level, permissions)
  values
    (new.id, 'admin', 'Acesso total ao sistema', true, 100,
      '{"*":"*"}'),
    (new.id, 'manager', 'Gerencia equipes e visualiza relatórios', true, 50,
      '{"leads":"*","contacts":"*","opportunities":"*","reports":"read","users":"read"}'),
    (new.id, 'member', 'Acesso padrão de vendedor', true, 10,
      '{"leads":"*","contacts":"*","opportunities":"*","tasks":"*"}'),
    (new.id, 'viewer', 'Somente leitura', true, 1,
      '{"leads":"read","contacts":"read","opportunities":"read"}')
  returning id into admin_role_id;

  -- Busca o id do role admin
  select id into admin_role_id from public.roles
  where organization_id = new.id and name = 'admin';

  -- Cria funil de vendas padrão
  insert into public.funnels (organization_id, name, description, is_default, color, icon, created_by)
  values (new.id, 'Pipeline de Vendas', 'Funil principal de vendas', true, '#6366f1', 'git-merge', null)
  returning id into funnel_id;

  -- Cria etapas padrão
  insert into public.pipeline_stages (funnel_id, name, position, color, probability, type)
  values
    (funnel_id, 'Prospecção',      0, '#94a3b8', 10,  'open'),
    (funnel_id, 'Qualificação',    1, '#3b82f6', 25,  'open'),
    (funnel_id, 'Proposta',        2, '#f59e0b', 50,  'open'),
    (funnel_id, 'Negociação',      3, '#8b5cf6', 75,  'open'),
    (funnel_id, 'Fechado - Ganho', 4, '#10b981', 100, 'won'),
    (funnel_id, 'Fechado - Perdido',5,'#ef4444', 0,  'lost');

  -- Cria tags padrão
  insert into public.tags (organization_id, name, color, entity_types)
  values
    (new.id, 'VIP',        '#f59e0b', '{lead,contact,company}'),
    (new.id, 'Urgente',    '#ef4444', '{lead,task,opportunity}'),
    (new.id, 'Follow-up',  '#3b82f6', '{lead,contact}'),
    (new.id, 'Parceiro',   '#10b981', '{company,contact}'),
    (new.id, 'Inativo',    '#94a3b8', '{contact,company}');

  return new;
end;
$$;

drop trigger if exists tr_new_organization on public.organizations;
create trigger tr_new_organization
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- ============================================================
-- TRIGGER: Audit log automático
-- ============================================================
create or replace function public.handle_audit_log()
returns trigger language plpgsql security definer as $$
declare
  org_id uuid;
  changes jsonb := '{}';
  col text;
begin
  -- Tenta pegar org_id
  if TG_OP = 'DELETE' then
    org_id := old.organization_id;
  else
    org_id := new.organization_id;
  end if;

  if TG_OP = 'UPDATE' then
    -- Calcula apenas as colunas que mudaram
    for col in select jsonb_object_keys(to_jsonb(new)) loop
      if to_jsonb(old)->col is distinct from to_jsonb(new)->col then
        changes := changes || jsonb_build_object(col, jsonb_build_object(
          'from', to_jsonb(old)->col,
          'to', to_jsonb(new)->col
        ));
      end if;
    end loop;
  end if;

  insert into public.audit_logs (organization_id, user_id, action, entity_type, entity_id, old_data, new_data, changes)
  values (
    org_id,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    case when TG_OP = 'DELETE' then old.id else new.id end,
    case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    case when TG_OP = 'UPDATE' then changes else null end
  );

  return coalesce(new, old);
end;
$$;

-- Aplica auditoria nas tabelas críticas
create trigger tr_leads_audit after insert or update or delete on public.leads
  for each row execute function public.handle_audit_log();
create trigger tr_opportunities_audit after insert or update or delete on public.opportunities
  for each row execute function public.handle_audit_log();
create trigger tr_contacts_audit after insert or update or delete on public.contacts
  for each row execute function public.handle_audit_log();
create trigger tr_companies_audit after insert or update or delete on public.companies
  for each row execute function public.handle_audit_log();

-- ============================================================
-- TRIGGER: Activity automática ao mover oportunidade de etapa
-- ============================================================
create or replace function public.handle_stage_change()
returns trigger language plpgsql as $$
declare
  from_stage_name text;
  to_stage_name   text;
  time_in_stage   interval;
begin
  if old.stage_id = new.stage_id then
    return new;
  end if;

  select name into from_stage_name from public.pipeline_stages where id = old.stage_id;
  select name into to_stage_name   from public.pipeline_stages where id = new.stage_id;

  -- Calcula tempo na etapa anterior
  select now() - max(created_at) into time_in_stage
  from public.stage_history
  where opportunity_id = new.id and to_stage_id = old.stage_id;

  -- Registra no histórico
  insert into public.stage_history (opportunity_id, from_stage_id, to_stage_id, changed_by, time_in_stage)
  values (new.id, old.stage_id, new.stage_id, auth.uid(), coalesce(time_in_stage, interval '0'));

  -- Registra activity na timeline
  insert into public.activities (
    organization_id, type, title, description,
    opportunity_id, contact_id, company_id, lead_id,
    performed_by, status
  ) values (
    new.organization_id,
    'stage_change',
    'Etapa alterada: ' || from_stage_name || ' → ' || to_stage_name,
    'Oportunidade movida de "' || from_stage_name || '" para "' || to_stage_name || '"',
    new.id, new.contact_id, new.company_id, new.lead_id,
    auth.uid(), 'completed'
  );

  return new;
end;
$$;

create trigger tr_opportunity_stage_change
  after update of stage_id on public.opportunities
  for each row execute function public.handle_stage_change();

-- ============================================================
-- TRIGGER: Notificação ao atribuir tarefa
-- ============================================================
create or replace function public.handle_task_assignment()
returns trigger language plpgsql security definer as $$
begin
  -- Notifica quando tarefa é atribuída a alguém
  if new.assigned_to is not null and (old is null or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (organization_id, user_id, type, title, message, data, action_url)
    values (
      new.organization_id,
      new.assigned_to,
      'task_assigned',
      'Nova tarefa atribuída',
      'Você recebeu a tarefa: ' || new.title,
      jsonb_build_object('task_id', new.id, 'priority', new.priority),
      '/tasks/' || new.id
    );
  end if;

  -- Notifica quando tarefa está próxima do vencimento (handled by cron/edge function)
  return new;
end;
$$;

create trigger tr_task_assignment
  after insert or update of assigned_to on public.tasks
  for each row execute function public.handle_task_assignment();

-- ============================================================
-- RPC: Busca global (search)
-- ============================================================
create or replace function public.global_search(
  search_term text,
  org_id      uuid default null,
  limit_count integer default 20
)
returns table (
  id         uuid,
  type       text,
  title      text,
  subtitle   text,
  url        text,
  created_at timestamptz
) language sql security definer stable as $$
  select id, 'lead' as type, title, status, '/leads/' || id, created_at
  from public.leads
  where organization_id = coalesce(org_id, public.get_user_org_id())
    and deleted_at is null
    and (title ilike '%' || search_term || '%' or description ilike '%' || search_term || '%')
  union all
  select id, 'contact', first_name || ' ' || coalesce(last_name,''), email, '/contacts/' || id, created_at
  from public.contacts
  where organization_id = coalesce(org_id, public.get_user_org_id())
    and deleted_at is null
    and (first_name ilike '%' || search_term || '%'
      or last_name  ilike '%' || search_term || '%'
      or email      ilike '%' || search_term || '%')
  union all
  select id, 'company', name, industry, '/companies/' || id, created_at
  from public.companies
  where organization_id = coalesce(org_id, public.get_user_org_id())
    and deleted_at is null
    and name ilike '%' || search_term || '%'
  union all
  select id, 'opportunity', title, status, '/pipeline/' || id, created_at
  from public.opportunities
  where organization_id = coalesce(org_id, public.get_user_org_id())
    and deleted_at is null
    and title ilike '%' || search_term || '%'
  order by created_at desc
  limit limit_count;
$$;

-- ============================================================
-- RPC: Dashboard KPIs
-- ============================================================
create or replace function public.get_dashboard_kpis(p_org_id uuid default null)
returns jsonb language plpgsql security definer stable as $$
declare
  v_org_id uuid := coalesce(p_org_id, public.get_user_org_id());
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
    'conversion_rate',    (
      select case when count(*) = 0 then 0
        else round(count(*) filter (where status = 'won') * 100.0 / count(*), 1)
      end
      from public.opportunities where organization_id = v_org_id
    )
  ) into result;

  return result;
end;
$$;

-- ============================================================
-- RPC: Pipeline por funil
-- ============================================================
create or replace function public.get_pipeline_data(p_funnel_id uuid)
returns jsonb language plpgsql security definer stable as $$
declare
  result jsonb;
begin
  select jsonb_agg(
    jsonb_build_object(
      'stage', row_to_json(s),
      'opportunities', (
        select jsonb_agg(row_to_json(o) order by o.position)
        from public.opportunities o
        where o.stage_id = s.id
          and o.status = 'open'
          and o.deleted_at is null
      ),
      'total_value', (
        select coalesce(sum(value), 0) from public.opportunities
        where stage_id = s.id and status = 'open' and deleted_at is null
      ),
      'count', (
        select count(*) from public.opportunities
        where stage_id = s.id and status = 'open' and deleted_at is null
      )
    )
    order by s.position
  )
  into result
  from public.pipeline_stages s
  where s.funnel_id = p_funnel_id;

  return result;
end;
$$;

-- ============================================================
-- RPC: Timeline 360° de um lead/contato/empresa
-- ============================================================
create or replace function public.get_timeline(
  p_entity_type text,
  p_entity_id   uuid,
  p_limit       integer default 50,
  p_offset      integer default 0
)
returns jsonb language plpgsql security definer stable as $$
declare
  result jsonb;
begin
  select jsonb_agg(t order by t.created_at desc)
  into result
  from (
    -- Activities
    select 'activity' as timeline_type, id, type as subtype, title, description,
           performed_by as user_id, created_at, is_pinned, metadata
    from public.activities
    where (
      (p_entity_type = 'lead'        and lead_id = p_entity_id) or
      (p_entity_type = 'contact'     and contact_id = p_entity_id) or
      (p_entity_type = 'company'     and company_id = p_entity_id) or
      (p_entity_type = 'opportunity' and opportunity_id = p_entity_id)
    )
    union all
    -- Comments
    select 'comment', id, 'comment', title, content,
           author_id, created_at, false, metadata
    from public.comments
    where entity_type = p_entity_type and entity_id = p_entity_id
      and deleted_at is null
    union all
    -- Tasks
    select 'task', id, priority, title, description,
           owner_id, created_at, false, '{}'::jsonb
    from public.tasks
    where (
      (p_entity_type = 'lead'        and lead_id = p_entity_id) or
      (p_entity_type = 'contact'     and contact_id = p_entity_id) or
      (p_entity_type = 'company'     and company_id = p_entity_id) or
      (p_entity_type = 'opportunity' and opportunity_id = p_entity_id)
    ) and deleted_at is null
    union all
    -- Emails
    select 'email', id, direction, subject, body_text,
           sent_by, coalesce(sent_at, created_at), false, metadata
    from public.emails
    where (
      (p_entity_type = 'lead'    and lead_id = p_entity_id) or
      (p_entity_type = 'contact' and contact_id = p_entity_id)
    )
    union all
    -- Meetings
    select 'meeting', id, type, title, description,
           organizer_id, created_at, false, '{}'::jsonb
    from public.meetings
    where (
      (p_entity_type = 'lead'        and lead_id = p_entity_id) or
      (p_entity_type = 'contact'     and contact_id = p_entity_id) or
      (p_entity_type = 'opportunity' and opportunity_id = p_entity_id)
    )
  ) t
  limit p_limit offset p_offset;

  return coalesce(result, '[]'::jsonb);
end;
$$;

-- ============================================================
-- RPC: Lead score automático
-- ============================================================
create or replace function public.calculate_lead_score(p_lead_id uuid)
returns integer language plpgsql security definer as $$
declare
  total_score integer := 0;
  lead_rec    record;
begin
  select * into lead_rec from public.leads where id = p_lead_id;
  if not found then return 0; end if;

  -- Base: temperatura
  case lead_rec.temperature
    when 'hot'  then total_score := total_score + 30;
    when 'warm' then total_score := total_score + 15;
    when 'cold' then total_score := total_score + 5;
    else null;
  end case;

  -- Tem email? +10
  if exists (select 1 from public.contacts where id = lead_rec.contact_id and email is not null) then
    total_score := total_score + 10;
  end if;

  -- Tem telefone? +5
  if exists (select 1 from public.contacts where id = lead_rec.contact_id and phone is not null) then
    total_score := total_score + 5;
  end if;

  -- Tem empresa? +10
  if lead_rec.company_id is not null then
    total_score := total_score + 10;
  end if;

  -- Activities recentes (últimos 7 dias) +5 por atividade (max 25)
  total_score := total_score + least(25,
    (select count(*) * 5 from public.activities
     where lead_id = p_lead_id and created_at >= now() - interval '7 days')
  );

  -- Valor do lead +10 se > 0
  if lead_rec.value is not null and lead_rec.value > 0 then
    total_score := total_score + 10;
  end if;

  -- Atualiza o score
  update public.leads set score = total_score where id = p_lead_id;

  return total_score;
end;
$$;

-- ============================================================
-- RPC: Relatório de receita mensal
-- ============================================================
create or replace function public.get_monthly_revenue(
  p_org_id  uuid default null,
  p_months  integer default 12
)
returns table(month text, revenue numeric, won_count bigint) language sql security definer stable as $$
  select
    to_char(date_trunc('month', actual_close_date), 'YYYY-MM') as month,
    sum(value) as revenue,
    count(*) as won_count
  from public.opportunities
  where organization_id = coalesce(p_org_id, public.get_user_org_id())
    and status = 'won'
    and actual_close_date >= now() - (p_months || ' months')::interval
  group by date_trunc('month', actual_close_date)
  order by 1;
$$;

-- ============================================================
-- RPC: Estatísticas de conversão por funil
-- ============================================================
create or replace function public.get_funnel_stats(p_funnel_id uuid)
returns jsonb language sql security definer stable as $$
  select jsonb_build_object(
    'total',       count(*),
    'won',         count(*) filter (where status = 'won'),
    'lost',        count(*) filter (where status = 'lost'),
    'open',        count(*) filter (where status = 'open'),
    'total_value', coalesce(sum(value) filter (where status = 'open'), 0),
    'won_value',   coalesce(sum(value) filter (where status = 'won'), 0),
    'conversion',  case when count(*) = 0 then 0
                     else round(count(*) filter (where status = 'won') * 100.0 / count(*), 1)
                   end,
    'avg_cycle_days', round(avg(
      case when status = 'won' and actual_close_date is not null
        then extract(epoch from (actual_close_date::timestamptz - created_at)) / 86400
      end
    ))
  )
  from public.opportunities
  where funnel_id = p_funnel_id and deleted_at is null;
$$;
