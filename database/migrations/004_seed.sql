-- ============================================================
-- CRM Pro - Migration 004: Seed de Demonstração
-- Execute APÓS criar o primeiro usuário via Auth
-- Substitua 'YOUR_USER_ID' e 'YOUR_ORG_ID' pelos valores reais
-- ============================================================

-- Para obter os IDs:
-- SELECT id FROM auth.users LIMIT 1; -> YOUR_USER_ID
-- SELECT id FROM public.organizations LIMIT 1; -> YOUR_ORG_ID

-- ============================================================
-- Função para seed automático (executa após login)
-- ============================================================
create or replace function public.seed_demo_data(p_org_id uuid, p_user_id uuid)
returns void language plpgsql security definer as $$
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
  funnel_id   uuid;
  stage1_id   uuid;
  stage2_id   uuid;
  stage3_id   uuid;
  stage4_id   uuid;
begin
  -- Só executa se não houver dados ainda
  if exists (select 1 from public.companies where organization_id = p_org_id limit 1) then
    return;
  end if;

  -- Busca funnel padrão
  select id into funnel_id from public.funnels where organization_id = p_org_id and is_default = true limit 1;
  if funnel_id is null then return; end if;

  -- Busca stages
  select id into stage1_id from public.pipeline_stages where funnel_id = funnel_id and position = 0 limit 1;
  select id into stage2_id from public.pipeline_stages where funnel_id = funnel_id and position = 1 limit 1;
  select id into stage3_id from public.pipeline_stages where funnel_id = funnel_id and position = 2 limit 1;
  select id into stage4_id from public.pipeline_stages where funnel_id = funnel_id and position = 3 limit 1;

  -- Empresas
  insert into public.companies (organization_id, name, industry, company_size, annual_revenue, phone, email, website, status, owner_id, score)
  values
    (p_org_id, 'Tech Solutions Ltda', 'Tecnologia', '50-200', 2500000, '(11) 3456-7890', 'contato@techsolutions.com.br', 'https://techsolutions.com.br', 'active', p_user_id, 85),
    (p_org_id, 'Grupo Varejo Nacional', 'Varejo', '200-500', 15000000, '(21) 2345-6789', 'compras@grupovarejo.com.br', 'https://grupovarejo.com.br', 'active', p_user_id, 72),
    (p_org_id, 'Construtora Horizonte', 'Construção Civil', '50-200', 8000000, '(31) 3456-7890', 'engenharia@horizonte.com.br', null, 'active', p_user_id, 60)
  returning id into company1_id;

  select id into company1_id from public.companies where organization_id = p_org_id and name = 'Tech Solutions Ltda' limit 1;
  select id into company2_id from public.companies where organization_id = p_org_id and name = 'Grupo Varejo Nacional' limit 1;
  select id into company3_id from public.companies where organization_id = p_org_id and name = 'Construtora Horizonte' limit 1;

  -- Contatos
  insert into public.contacts (organization_id, company_id, first_name, last_name, email, phone, job_title, status, owner_id, score, source, temperature)
  values
    (p_org_id, company1_id, 'Rafael',   'Mendes',   'rafael.mendes@techsolutions.com.br', '(11) 99234-5678', 'CTO', 'active', p_user_id, 90, 'linkedin', 'hot'),
    (p_org_id, company1_id, 'Carla',    'Ferreira',  'carla@techsolutions.com.br',         '(11) 98765-4321', 'CEO', 'active', p_user_id, 95, 'referral', 'hot'),
    (p_org_id, company2_id, 'Marcos',   'Silva',     'marcos.silva@grupovarejo.com.br',    '(21) 97654-3210', 'Diretor de TI', 'active', p_user_id, 70, 'google', 'warm'),
    (p_org_id, company3_id, 'Juliana',  'Costa',     'juliana@horizonte.com.br',           '(31) 96543-2109', 'Gerente Financeira', 'active', p_user_id, 55, 'event', 'cold')
  returning id into contact1_id;

  select id into contact1_id from public.contacts where organization_id = p_org_id and email = 'rafael.mendes@techsolutions.com.br' limit 1;
  select id into contact2_id from public.contacts where organization_id = p_org_id and email = 'carla@techsolutions.com.br' limit 1;
  select id into contact3_id from public.contacts where organization_id = p_org_id and email = 'marcos.silva@grupovarejo.com.br' limit 1;
  select id into contact4_id from public.contacts where organization_id = p_org_id and email = 'juliana@horizonte.com.br' limit 1;

  -- Leads
  insert into public.leads (organization_id, contact_id, company_id, title, description, status, source, temperature, score, value, owner_id, tags)
  values
    (p_org_id, contact1_id, company1_id, 'Implantação de CRM - Tech Solutions', 'Empresa buscando solução completa de CRM para equipe de 50 vendedores', 'qualified', 'linkedin', 'hot', 90, 45000, p_user_id, '{VIP,Urgente}'),
    (p_org_id, contact3_id, company2_id, 'Plataforma de E-commerce B2B',        'Projeto de transformação digital da área de vendas B2B', 'new', 'google', 'warm', 70, 120000, p_user_id, '{Follow-up}'),
    (p_org_id, contact4_id, company3_id, 'Software de Gestão de Obras',         'Busca por software ERP integrado com CRM', 'contacted', 'event', 'cold', 40, 25000, p_user_id, '{}')
  returning id into lead1_id;

  select id into lead1_id from public.leads where organization_id = p_org_id and contact_id = contact1_id limit 1;
  select id into lead2_id from public.leads where organization_id = p_org_id and contact_id = contact3_id limit 1;
  select id into lead3_id from public.leads where organization_id = p_org_id and contact_id = contact4_id limit 1;

  -- Oportunidades no pipeline
  if funnel_id is not null and stage1_id is not null then
    insert into public.opportunities (organization_id, funnel_id, stage_id, lead_id, contact_id, company_id, title, value, probability, expected_close_date, status, owner_id)
    values
      (p_org_id, funnel_id, stage3_id, lead1_id, contact1_id, company1_id, 'CRM - Tech Solutions', 45000, 75, current_date + 30, 'open', p_user_id),
      (p_org_id, funnel_id, stage2_id, lead2_id, contact3_id, company2_id, 'E-commerce B2B - Grupo Varejo', 120000, 25, current_date + 60, 'open', p_user_id),
      (p_org_id, funnel_id, stage1_id, lead3_id, contact4_id, company3_id, 'ERP+CRM - Construtora Horizonte', 25000, 10, current_date + 90, 'open', p_user_id),
      (p_org_id, funnel_id, stage4_id, null, contact2_id, company1_id, 'Suporte Enterprise - Tech Solutions', 8400, 90, current_date + 7, 'open', p_user_id);
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
