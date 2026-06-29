/**
 * AI Module — Assistente de IA integrado com OpenAI
 * Análise de leads, geração de propostas, resumos, insights
 */
import { db, rpc }  from '../services/supabase.js';
import { Store }    from '../core/store.js';
import { Toasts }   from '../components/notifications.js';
import { fmt, esc }  from '../core/utils.js';
import { OPENAI_MODEL } from '../../../config/supabase.js';

let _conversationId = null;
let _messages = [];
let _isOpen   = false;
let _isTyping = false;

export const AI = {
  toggle() {
    _isOpen = !_isOpen;
    const panel = document.getElementById('ai-panel');
    const fab   = document.getElementById('ai-fab');
    panel.classList.toggle('open', _isOpen);
    if (_isOpen && !_conversationId) this._initConversation();
  },

  async _initConversation() {
    const orgId  = Store.get('orgId');
    const userId = Store.get('user')?.id;
    if (!userId) return;

    const { data } = await db.from('ai_conversations').insert({
      organization_id: orgId,
      user_id:  userId,
      title:    'Nova conversa',
      messages: [],
      model:    OPENAI_MODEL,
    }).select().single();

    _conversationId = data?.id;
    _messages = [];
  },

  async send() {
    const input = document.getElementById('ai-input');
    const text  = input?.value.trim();
    if (!text || _isTyping) return;

    input.value = '';
    input.style.height = 'auto';
    this._appendMessage('user', text);

    await this._getResponse(text);
  },

  async quickAction(action) {
    const prompts = {
      'summarize-leads':     'Me dê um resumo dos leads mais importantes no CRM agora, destacando os que precisam de atenção.',
      'top-opportunities':   'Quais são as 3 maiores oportunidades no pipeline e quais são as chances de fechamento?',
      'tasks-today':         'Quais tarefas vencem hoje e qual a prioridade de execução?',
      'generate-proposal':   'Me ajude a criar uma proposta comercial. Qual cliente e produto você quer incluir?',
    };
    const prompt = prompts[action];
    if (!prompt) return;

    const input = document.getElementById('ai-input');
    if (input) input.value = prompt;
    await this.send();
  },

  _appendMessage(role, content) {
    _messages.push({ role, content, timestamp: new Date().toISOString() });
    this._renderMessages();
  },

  _renderMessages() {
    const container = document.getElementById('ai-messages');
    if (!container) return;

    container.innerHTML = _messages.map(m => `
      <div class="ai-message ${m.role}">
        ${m.role === 'assistant' ? `
          <div class="ai-avatar" style="width:28px;height:28px;flex-shrink:0">
            <i data-lucide="brain" style="width:14px;height:14px"></i>
          </div>` : ''}
        <div class="ai-bubble">${this._formatContent(m.content)}</div>
      </div>
    `).join('');

    lucide.createIcons({ nodes: [container] });
    container.scrollTop = container.scrollHeight;
  },

  _formatContent(text) {
    // Escapa primeiro o HTML do conteúdo (texto do usuário e da IA) para evitar
    // injeção, e só então aplica a formatação markdown controlada por nós.
    return esc(text)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  },

  async _getResponse(userMessage) {
    _isTyping = true;
    const sendBtn = document.getElementById('ai-send-btn');
    if (sendBtn) sendBtn.disabled = true;

    // Mostra indicador de typing
    const container = document.getElementById('ai-messages');
    const typingEl  = document.createElement('div');
    typingEl.className = 'ai-message assistant';
    typingEl.id = 'ai-typing';
    typingEl.innerHTML = `
      <div class="ai-avatar" style="width:28px;height:28px;flex-shrink:0">
        <i data-lucide="brain" style="width:14px;height:14px"></i>
      </div>
      <div class="ai-bubble" style="display:flex;align-items:center;gap:6px">
        <div style="width:6px;height:6px;border-radius:50%;background:var(--color-primary-400);animation:pulse 1s infinite"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:var(--color-primary-400);animation:pulse 1s infinite 0.2s"></div>
        <div style="width:6px;height:6px;border-radius:50%;background:var(--color-primary-400);animation:pulse 1s infinite 0.4s"></div>
      </div>`;
    container.appendChild(typingEl);
    lucide.createIcons({ nodes: [typingEl] });
    container.scrollTop = container.scrollHeight;

    try {
      let response;

      try {
        // Chama a IA via Edge Function (a chave fica no servidor)
        const context = await this._buildContext(userMessage);
        response = await this._callAI(userMessage, context);
      } catch (_) {
        // Edge Function indisponível ou IA não configurada → resposta demo
        response = await this._demoResponse(userMessage);
      }

      typingEl.remove();
      this._appendMessage('assistant', response);

      // Salva no banco
      if (_conversationId) {
        await db.from('ai_conversations')
          .update({ messages: _messages, updated_at: new Date().toISOString() })
          .eq('id', _conversationId);
      }
    } catch(err) {
      typingEl.remove();
      this._appendMessage('assistant', `Desculpe, ocorreu um erro: ${err.message}. Verifique a configuração da API.`);
    } finally {
      _isTyping = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  },

  async _buildContext(question) {
    const orgId = Store.get('orgId');
    const kpis  = Store.get('kpis') || {};

    // Busca dados relevantes baseado na pergunta
    const context = {
      kpis,
      date: new Date().toLocaleDateString('pt-BR'),
    };

    const q = question.toLowerCase();

    if (q.includes('lead') || q.includes('oportunid')) {
      const { data: leads } = await db.from('leads')
        .select('title,status,temperature,score,value,source')
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .order('score', { ascending: false })
        .limit(10);
      context.leads = leads;
    }

    if (q.includes('tarefa') || q.includes('task')) {
      const { data: tasks } = await db.from('tasks')
        .select('title,status,priority,due_date')
        .eq('organization_id', orgId)
        .neq('status', 'done')
        .is('deleted_at', null)
        .lte('due_date', new Date(Date.now()+7*86400000).toISOString())
        .order('due_date')
        .limit(10);
      context.tasks = tasks;
    }

    return context;
  },

  async _callAI(userMessage, context) {
    const systemPrompt = `Você é um assistente especializado em CRM e vendas B2B.
    Responda sempre em português brasileiro de forma concisa e útil.

    CONTEXTO DO CRM:
    Data: ${context.date}
    KPIs: ${JSON.stringify(context.kpis)}
    ${context.leads ? `Leads: ${JSON.stringify(context.leads)}` : ''}
    ${context.tasks ? `Tarefas: ${JSON.stringify(context.tasks)}` : ''}

    Seja específico, use os dados reais fornecidos e dê recomendações acionáveis.`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ..._messages.slice(-8).map(m => ({ role: m.role, content: m.content })),
      { role: 'user',   content: userMessage },
    ];

    // Chama a Edge Function 'ai-chat' — o supabase-js já anexa o JWT da sessão.
    // A chave da OpenAI NUNCA trafega pelo navegador.
    const { data, error } = await db.functions.invoke('ai-chat', {
      body: { messages, model: OPENAI_MODEL, temperature: 0.7 },
    });

    if (error) throw error;
    if (!data?.content) throw new Error('Resposta vazia da IA');
    return data.content;
  },

  async _demoResponse(question) {
    // Simula delay de IA
    await new Promise(r => setTimeout(r, 1200));
    const kpis = Store.get('kpis') || {};
    const q = question.toLowerCase();

    if (q.includes('lead') || q.includes('resumo')) {
      return `**Resumo dos Leads:**\n\n📊 Total: **${kpis.leads_total || 0} leads** no CRM\n🔥 Quentes: **${kpis.leads_hot || 0}** precisando de atenção imediata\n🆕 Novos (30d): **${kpis.leads_new || 0} leads**\n\n**Recomendações:**\n1. Priorize os leads quentes com follow-up nas próximas 24h\n2. Qualifique os novos leads desta semana\n3. Leads sem atividade há 7+ dias precisam de nurturing`;
    }

    if (q.includes('oportunid') || q.includes('pipeline')) {
      return `**Pipeline de Vendas:**\n\n💰 Valor total em aberto: **${fmt.currency(kpis.revenue_open || 0)}**\n📈 Receita conquistada (mês): **${fmt.currency(kpis.revenue_won || 0)}**\n🎯 Taxa de conversão: **${kpis.conversion_rate || 0}%**\n\nPara aumentar sua taxa de conversão, foque nas oportunidades com probability acima de 50% que vencem nos próximos 30 dias.`;
    }

    if (q.includes('tarefa') || q.includes('hoje')) {
      return `**Suas Tarefas:**\n\n✅ Para hoje: **${kpis.tasks_today || 0} tarefas**\n⚠️ Atrasadas: **${kpis.tasks_overdue || 0} tarefas**\n\n**Sugestão de prioridade:**\n1. Resolva primeiro as tarefas atrasadas\n2. Confirme as reuniões de hoje\n3. Faça follow-up nos leads quentes\n\nPrecisa de ajuda para criar tarefas ou agendar follow-ups?`;
    }

    if (q.includes('proposta')) {
      return `**Gerando Proposta Comercial...**\n\nPara criar uma proposta eficaz, preciso de:\n\n1. **Nome do cliente** e empresa\n2. **Produto/serviço** que será proposto\n3. **Valor estimado** do contrato\n4. **Prazo de entrega**\n\nCom essas informações, posso gerar uma proposta personalizada! Qual cliente você quer incluir?`;
    }

    return `Entendi sua pergunta sobre "${question}". Como assistente do CRM Pro, posso ajudar com:\n\n- 📊 **Análise de leads** e oportunidades\n- 📧 **Rascunho de e-mails** para clientes\n- 📄 **Geração de propostas** comerciais\n- ✅ **Priorização de tarefas**\n- 📈 **Insights de vendas**\n\n*Dica: Implante a Edge Function 'ai-chat' e configure o secret OPENAI_API_KEY no Supabase para respostas personalizadas com seus dados reais.*`;
  },
};
