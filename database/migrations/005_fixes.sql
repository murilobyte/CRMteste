-- ============================================================
-- CRM Pro - Migration 005: Correções
-- Execute no SQL Editor do Supabase APÓS as migrations 001-004.
--
-- Corrige:
--   1) Cadeia de triggers do signup (causa do erro 500
--      "Database error saving new user") -> agora é robusta e
--      nunca bloqueia a criação do usuário.
--   2) global_search: nomes de parâmetros e colunas alinhados
--      ao que o frontend chama (p_org_id, p_query, p_limit; entity_type).
--   3) seed_demo_data: bug de variável/coluna ambígua (funnel_id = funnel_id).
-- ============================================================

-- ============================================================
-- 1a. Seed de defaults da organização (roles, funil, etapas, tags)
--     Robusto: se algo falhar, registra um WARNING mas NÃO derruba
--     a criação da organização (e portanto não derruba o signup).
-- ============================================================
create or replace function public.handle_new_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_funnel_id uuid;
begin
  -- Roles padrão
  insert into public.roles (organization_id, name, description, is_system, level, permissions)
  values
    (new.id, 'admin',   'Acesso total ao sistema', true, 100, '{"*":"*"}'::jsonb),
    (new.id, 'manager', 'Gerencia equipes e visualiza relatórios', true, 50,
      '{"leads":"*","contacts":"*","opportunities":"*","reports":"read","users":"read"}'::jsonb),
    (new.id, 'member',  'Acesso padrão de vendedor', true, 10,
      '{"leads":"*","contacts":"*","opportunities":"*","tasks":"*"}'::jsonb),
    (new.id, 'viewer',  'Somente leitura', true, 1,
      '{"leads":"read","contacts":"read","opportunities":"read"}'::jsonb);

  -- Funil de vendas padrão
  insert into public.funnels (organization_id, name, description, is_default, color, icon, created_by)
  values (new.id, 'Pipeline de Vendas', 'Funil principal de vendas', true, '#6366f1', 'git-merge', null)
  returning id into v_funnel_id;

  -- Etapas padrão
  insert into public.pipeline_stages (funnel_id, name, position, color, probability, type)
  values
    (v_funnel_id, 'Prospecção',        0, '#94a3b8', 10,  'open'),
    (v_funnel_id, 'Qualificação',      1, '#3b82f6', 25,  'open'),
    (v_funnel_id, 'Proposta',          2, '#f59e0b', 50,  'open'),
    (v_funnel_id, 'Negociação',        3, '#8b5cf6', 75,  'open'),
    (v_funnel_id, 'Fechado - Ganho',   4, '#10b981', 100, 'won'),
    (v_funnel_id, 'Fechado - Perdido', 5, '#ef4444', 0,   'lost');

  -- Tags padrão
  insert into public.tags (organization_id, name, color, entity_types)
  values
    (new.id, 'VIP',       '#f59e0b', '{lead,contact,company}'),
    (new.id, 'Urgente',   '#ef4444', '{lead,task,opportunity}'),
    (new.id, 'Follow-up', '#3b82f6', '{lead,contact}'),
    (new.id, 'Parceiro',  '#10b981', '{company,contact}'),
    (new.id, 'Inativo',   '#94a3b8', '{contact,company}');

  return new;
exception when others then
  raise warning '[handle_new_organization] falha ao semear defaults da org %: %', new.id, sqlerrm;
  return new;
end;
$$;

-- ============================================================
-- 1b. Auto-criar Profile + Org após signup
--     Robusto: encapsula partes secundárias em sub-blocos e
--     NUNCA propaga exceção para o auth.users (evita o erro 500).
--     Eventuais falhas viram WARNING nos logs (Logs -> Postgres).
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_org_name text;
begin
  -- Organização: usa a dos metadados ou cria uma nova
  if new.raw_user_meta_data->>'organization_id' is not null then
    v_org_id := (new.raw_user_meta_data->>'organization_id')::uuid;
  else
    v_org_name := coalesce(
      nullif(trim(new.raw_user_meta_data->>'organization_name'), ''),
      split_part(new.email, '@', 2),
      'Minha Empresa'
    );
    insert into public.organizations (name, slug, plan)
    values (
      v_org_name,
      lower(regexp_replace(v_org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8),
      'starter'
    )
    returning id into v_org_id;
  end if;

  -- Perfil (núcleo: precisa existir para o login funcionar)
  insert into public.profiles (id, organization_id, email, first_name, last_name)
  values (
    new.id,
    v_org_id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'first_name'), ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'last_name'
  )
  on conflict (id) do nothing;

  -- Role de admin para o usuário (best-effort)
  begin
    insert into public.user_roles (user_id, role_id, organization_id, granted_by)
    select new.id, r.id, v_org_id, new.id
    from public.roles r
    where r.organization_id = v_org_id and r.name = 'admin'
    limit 1
    on conflict (user_id, role_id) do nothing;
  exception when others then
    raise warning '[handle_new_user] falha ao atribuir role admin para %: %', new.email, sqlerrm;
  end;

  return new;
exception when others then
  -- Nunca bloqueia o signup; registra para diagnóstico
  raise warning '[handle_new_user] erro ao provisionar conta %: %', new.email, sqlerrm;
  return new;
end;
$$;

-- Garante que os triggers existem (idempotente)
drop trigger if exists tr_new_user on auth.users;
create trigger tr_new_user
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists tr_new_organization on public.organizations;
create trigger tr_new_organization
  after insert on public.organizations
  for each row execute function public.handle_new_organization();

-- ============================================================
-- 2. global_search: alinhado ao frontend
--    Frontend chama: rpc('global_search', { p_org_id, p_query, p_limit })
--    e lê as colunas: entity_type, id, title, subtitle
--    (Precisa de DROP porque mudam nomes de parâmetros e o retorno.)
-- ============================================================
drop function if exists public.global_search(text, uuid, integer);

create or replace function public.global_search(
  p_query  text,
  p_org_id uuid default null,
  p_limit  integer default 20
)
returns table (
  id          uuid,
  entity_type text,
  title       text,
  subtitle    text,
  url         text,
  created_at  timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select id, 'lead'::text, title, status, '/leads/' || id, created_at
  from public.leads
  where organization_id = coalesce(p_org_id, public.get_user_org_id())
    and deleted_at is null
    and (title ilike '%' || p_query || '%' or description ilike '%' || p_query || '%')
  union all
  select id, 'contact', first_name || ' ' || coalesce(last_name, ''), email, '/contacts/' || id, created_at
  from public.contacts
  where organization_id = coalesce(p_org_id, public.get_user_org_id())
    and deleted_at is null
    and (first_name ilike '%' || p_query || '%'
      or last_name  ilike '%' || p_query || '%'
      or email      ilike '%' || p_query || '%')
  union all
  select id, 'company', name, industry, '/companies/' || id, created_at
  from public.companies
  where organization_id = coalesce(p_org_id, public.get_user_org_id())
    and deleted_at is null
    and name ilike '%' || p_query || '%'
  union all
  select id, 'opportunity', title, status, '/pipeline/' || id, created_at
  from public.opportunities
  where organization_id = coalesce(p_org_id, public.get_user_org_id())
    and deleted_at is null
    and title ilike '%' || p_query || '%'
  order by created_at desc
  limit p_limit;
$$;

-- ============================================================
-- 3. seed_demo_data: corrige variável/coluna ambígua
--    (antes: "where funnel_id = funnel_id" era sempre verdadeiro)
--    Renomeia a variável para v_funnel_id.
-- ============================================================
create or replace function public.seed_demo_data(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer
set search_path = public
as $$
declare
  company1_id uuid;
  company2_id uuid;
  company3_id uuid;
  contact1_id uuid;
  contact2_id uuid;
  contact3_id uuid;
  contact4_id uuid;
  lead1_id    uuid;
  lead2_id    uuid;
  lead3_id    uuid;
  v_funnel_id uuid;
  stage1_id   uuid;
  stage2_id   uuid;
  stage3_id   uuid;
  stage4_id   uuid;
begin
  -- Só executa se não houver dados ainda
  if exists (select 1 from public.companies where organization_id = p_org_id limit 1) then
    return;
  end if;

  -- Busca funil padrão
  select id into v_funnel_id from public.funnels where organization_id = p_org_id and is_default = true limit 1;
  if v_funnel_id is null then return; end if;

  -- Busca stages (agora filtrando pelo funil correto)
  select id into stage1_id from public.pipeline_stages where funnel_id = v_funnel_id and position = 0 limit 1;
  select id into stage2_id from public.pipeline_stages where funnel_id = v_funnel_id and position = 1 limit 1;
  select id into stage3_id from public.pipeline_stages where funnel_id = v_funnel_id and position = 2 limit 1;
  select id into stage4_id from public.pipeline_stages where funnel_id = v_funnel_id and position = 3 limit 1;

  -- Empresas
  insert into public.companies (organization_id, name, industry, company_size, annual_revenue, phone, email, website, status, owner_id, score)
  values
    (p_org_id, 'Tech Solutions Ltda', 'Tecnologia', '50-200', 2500000, '(11) 3456-7890', 'contato@techsolutions.com.br', 'https://techsolutions.com.br', 'active', p_user_id, 85),
    (p_org_id, 'Grupo Varejo Nacional', 'Varejo', '200-500', 15000000, '(21) 2345-6789', 'compras@grupovarejo.com.br', 'https://grupovarejo.com.br', 'active', p_user_id, 72),
    (p_org_id, 'Construtora Horizonte', 'Construção Civil', '50-200', 8000000, '(31) 3456-7890', 'engenharia@horizonte.com.br', null, 'active', p_user_id, 60);

  select id into company1_id from public.companies where organization_id = p_org_id and name = 'Tech Solutions Ltda' limit 1;
  select id into company2_id from public.companies where organization_id = p_org_id and name = 'Grupo Varejo Nacional' limit 1;
  select id into company3_id from public.companies where organization_id = p_org_id and name = 'Construtora Horizonte' limit 1;

  -- Contatos
  insert into public.contacts (organization_id, company_id, first_name, last_name, email, phone, job_title, status, owner_id, score, source, temperature)
  values
    (p_org_id, company1_id, 'Rafael',   'Mendes',   'rafael.mendes@techsolutions.com.br', '(11) 99234-5678', 'CTO', 'active', p_user_id, 90, 'linkedin', 'hot'),
    (p_org_id, company1_id, 'Carla',    'Ferreira',  'carla@techsolutions.com.br',         '(11) 98765-4321', 'CEO', 'active', p_user_id, 95, 'referral', 'hot'),
    (p_org_id, company2_id, 'Marcos',   'Silva',     'marcos.silva@grupovarejo.com.br',    '(21) 97654-3210', 'Diretor de TI', 'active', p_user_id, 70, 'google', 'warm'),
    (p_org_id, company3_id, 'Juliana',  'Costa',     'juliana@horizonte.com.br',           '(31) 96543-2109', 'Gerente Financeira', 'active', p_user_id, 55, 'event', 'cold');

  select id into contact1_id from public.contacts where organization_id = p_org_id and email = 'rafael.mendes@techsolutions.com.br' limit 1;
  select id into contact2_id from public.contacts where organization_id = p_org_id and email = 'carla@techsolutions.com.br' limit 1;
  select id into contact3_id from public.contacts where organization_id = p_org_id and email = 'marcos.silva@grupovarejo.com.br' limit 1;
  select id into contact4_id from public.contacts where organization_id = p_org_id and email = 'juliana@horizonte.com.br' limit 1;

  -- Leads
  insert into public.leads (organization_id, contact_id, company_id, title, description, status, source, temperature, score, value, owner_id, tags)
  values
    (p_org_id, contact1_id, company1_id, 'Implantação de CRM - Tech Solutions', 'Empresa buscando solução completa de CRM para equipe de 50 vendedores', 'qualified', 'linkedin', 'hot', 90, 45000, p_user_id, '{VIP,Urgente}'),
    (p_org_id, contact3_id, company2_id, 'Plataforma de E-commerce B2B',        'Projeto de transformação digital da área de vendas B2B', 'new', 'google', 'warm', 70, 120000, p_user_id, '{Follow-up}'),
    (p_org_id, contact4_id, company3_id, 'Software de Gestão de Obras',         'Busca por software ERP integrado com CRM', 'contacted', 'event', 'cold', 40, 25000, p_user_id, '{}');

  select id into lead1_id from public.leads where organization_id = p_org_id and contact_id = contact1_id limit 1;
  select id into lead2_id from public.leads where organization_id = p_org_id and contact_id = contact3_id limit 1;
  select id into lead3_id from public.leads where organization_id = p_org_id and contact_id = contact4_id limit 1;

  -- Oportunidades no pipeline
  if v_funnel_id is not null and stage1_id is not null then
    insert into public.opportunities (organization_id, funnel_id, stage_id, lead_id, contact_id, company_id, title, value, probability, expected_close_date, status, owner_id)
    values
      (p_org_id, v_funnel_id, stage3_id, lead1_id, contact1_id, company1_id, 'CRM - Tech Solutions', 45000, 75, current_date + 30, 'open', p_user_id),
      (p_org_id, v_funnel_id, stage2_id, lead2_id, contact3_id, company2_id, 'E-commerce B2B - Grupo Varejo', 120000, 25, current_date + 60, 'open', p_user_id),
      (p_org_id, v_funnel_id, stage1_id, lead3_id, contact4_id, company3_id, 'ERP+CRM - Construtora Horizonte', 25000, 10, current_date + 90, 'open', p_user_id),
      (p_org_id, v_funnel_id, stage4_id, null, contact2_id, company1_id, 'Suporte Enterprise - Tech Solutions', 8400, 90, current_date + 7, 'open', p_user_id);
  end if;

  -- Activities / Timeline
  insert into public.activities (organization_id, type, title, description, lead_id, contact_id, company_id, performed_by, status, created_at)
  values
    (p_org_id, 'call', 'Ligação inicial de prospecção', 'Apresentei a solução e agendei demo. Rafael demonstrou interesse alto.', lead1_id, contact1_id, company1_id, p_user_id, 'completed', now() - interval '5 days'),
    (p_org_id, 'email', 'Envio de material de apresentação', 'Email com deck e case studies enviado para Rafael e Carla.', lead1_id, contact1_id, company1_id, p_user_id, 'completed', now() - interval '4 days'),
    (p_org_id, 'meeting', 'Demo do produto realizada', 'Demonstração de 2h com equipe técnica da Tech Solutions. Ótima recepção.', lead1_id, contact1_id, company1_id, p_user_id, 'completed', now() - interval '2 days'),
    (p_org_id, 'note', 'Observação importante', 'Rafael mencionou que decisão final será na reunião de board do dia 15. Carla é a decisora.', lead1_id, contact1_id, company1_id, p_user_id, 'completed', now() - interval '1 day'),
    (p_org_id, 'call', 'Follow-up Grupo Varejo', 'Marcos pediu 15 dias para avaliar proposta internamente.', lead2_id, contact3_id, company2_id, p_user_id, 'completed', now() - interval '3 days');

  -- Tarefas
  insert into public.tasks (organization_id, title, description, status, priority, type, due_date, lead_id, contact_id, company_id, owner_id, assigned_to)
  values
    (p_org_id, 'Enviar proposta comercial - Tech Solutions', 'Preparar proposta detalhada com ROI e cronograma de implantação', 'todo', 'urgent', 'task', now() + interval '2 days', lead1_id, contact1_id, company1_id, p_user_id, p_user_id),
    (p_org_id, 'Agendar reunião de negociação - Tech Solutions', 'Marcar reunião com Carla para discussão do contrato', 'in_progress', 'high', 'meeting', now() + interval '5 days', lead1_id, contact2_id, company1_id, p_user_id, p_user_id),
    (p_org_id, 'Follow-up Grupo Varejo', 'Ligar para Marcos sobre decisão da proposta', 'todo', 'medium', 'call', now() + interval '10 days', lead2_id, contact3_id, company2_id, p_user_id, p_user_id),
    (p_org_id, 'Enviar case de construção civil', 'Preparar material específico para Construtora Horizonte', 'todo', 'low', 'email', now() + interval '7 days', lead3_id, contact4_id, company3_id, p_user_id, p_user_id);

  -- Notificações de boas-vindas
  insert into public.notifications (organization_id, user_id, type, title, message, action_url)
  values
    (p_org_id, p_user_id, 'welcome', 'Bem-vindo ao CRM Pro! 🎉', 'Seus dados de demonstração foram carregados. Explore o sistema!', '/'),
    (p_org_id, p_user_id, 'task_due', 'Tarefa urgente pendente', 'Você tem uma proposta para enviar hoje para a Tech Solutions.', '/tasks'),
    (p_org_id, p_user_id, 'pipeline', 'Oportunidade quente!', 'Tech Solutions está em fase de Proposta com 75% de probabilidade.', '/pipeline');

end;
$$;
