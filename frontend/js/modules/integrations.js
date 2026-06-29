/**
 * Integrations Module — Gerenciamento de integrações externas
 */
import { db }     from '../services/supabase.js';
import { Store }  from '../core/store.js';
import { Modal }  from '../components/modal.js';
import { Toasts } from '../components/notifications.js';
import { fmt, esc } from '../core/utils.js';

const INTEGRATIONS_CATALOG = [
  {
    id:          'gmail',
    name:        'Gmail',
    description: 'Sincronize e-mails e histórico de comunicação',
    icon:        'mail',
    color:       '#ea4335',
    category:    'email',
  },
  {
    id:          'whatsapp',
    name:        'WhatsApp Business',
    description: 'Envie e receba mensagens WhatsApp pelo CRM',
    icon:        'message-circle',
    color:       '#25d366',
    category:    'messaging',
  },
  {
    id:          'slack',
    name:        'Slack',
    description: 'Notificações e alertas do CRM no Slack',
    icon:        'slack',
    color:       '#4a154b',
    category:    'notifications',
  },
  {
    id:          'zapier',
    name:        'Zapier',
    description: 'Conecte com 5.000+ aplicativos via Zapier',
    icon:        'zap',
    color:       '#ff4a00',
    category:    'automation',
  },
  {
    id:          'stripe',
    name:        'Stripe',
    description: 'Pagamentos e faturamento integrados',
    icon:        'credit-card',
    color:       '#635bff',
    category:    'payments',
  },
  {
    id:          'calendar_google',
    name:        'Google Calendar',
    description: 'Sincronize reuniões com o Google Agenda',
    icon:        'calendar',
    color:       '#4285f4',
    category:    'calendar',
  },
  {
    id:          'linkedin',
    name:        'LinkedIn Sales Navigator',
    description: 'Importe leads do LinkedIn diretamente',
    icon:        'linkedin',
    color:       '#0a66c2',
    category:    'leads',
  },
  {
    id:          'openai',
    name:        'OpenAI',
    description: 'Assistente de IA para análise e geração de conteúdo',
    icon:        'brain',
    color:       '#10a37f',
    category:    'ai',
  },
];

let _active = {};

export const Integrations = {
  async init() { await this.load(); },

  async load() {
    const orgId = Store.get('orgId');
    const { data } = await db.from('integrations')
      .select('*')
      .eq('organization_id', orgId);

    _active = {};
    (data || []).forEach(i => { _active[i.provider] = i; });
    this._render();
  },

  _render() {
    const body = document.getElementById('integrations-body');
    if (!body) return;

    // Agrupa por categoria
    const categories = {};
    INTEGRATIONS_CATALOG.forEach(i => {
      categories[i.category] = categories[i.category] || [];
      categories[i.category].push(i);
    });

    const catLabels = {
      email:         'E-mail',
      messaging:     'Mensagens',
      notifications: 'Notificações',
      automation:    'Automação',
      payments:      'Pagamentos',
      calendar:      'Calendário',
      leads:         'Geração de Leads',
      ai:            'Inteligência Artificial',
    };

    body.innerHTML = Object.entries(categories).map(([cat, items]) => `
      <div style="margin-bottom:var(--space-8)">
        <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.08em;color:var(--text-tertiary);margin-bottom:var(--space-4)">${catLabels[cat] || cat}</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:var(--space-4)">
          ${items.map(i => this._buildCard(i)).join('')}
        </div>
      </div>
    `).join('');

    lucide.createIcons({ nodes: [body] });
  },

  _buildCard(integ) {
    const active = _active[integ.id];
    const isConnected = !!active;

    return `<div class="card" style="padding:var(--space-5);border:1px solid ${isConnected ? 'var(--color-primary-500)40' : 'var(--border-default)'}">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-3)">
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <div style="width:44px;height:44px;border-radius:var(--radius-lg);background:${integ.color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="${integ.icon}" style="width:22px;height:22px;color:${integ.color}"></i>
          </div>
          <div>
            <div style="font-weight:var(--font-semibold);margin-bottom:2px">${esc(integ.name)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(integ.description)}</div>
          </div>
        </div>
        <span class="badge ${isConnected ? 'badge-success' : 'badge-neutral'}" style="flex-shrink:0">${isConnected ? 'Conectado' : 'Desconectado'}</span>
      </div>
      <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
        ${isConnected ? `
          <button class="btn btn-ghost btn-sm" onclick="Integrations.configure('${integ.id}')">
            <i data-lucide="settings" style="width:14px;height:14px"></i> Configurar
          </button>
          <button class="btn btn-ghost btn-sm" onclick="Integrations.disconnect('${integ.id}')" style="color:var(--color-danger)">
            <i data-lucide="link-2-off" style="width:14px;height:14px"></i> Desconectar
          </button>
        ` : `
          <button class="btn btn-primary btn-sm" onclick="Integrations.connect('${integ.id}')">
            <i data-lucide="link-2" style="width:14px;height:14px"></i> Conectar
          </button>
        `}
      </div>
      ${isConnected && active.last_sync_at ? `
        <div style="margin-top:var(--space-2);font-size:var(--text-xs);color:var(--text-tertiary)">
          Última sincronização: ${fmt.relativeTime(active.last_sync_at)}
        </div>` : ''}
    </div>`;
  },

  connect(provider) {
    const integ = INTEGRATIONS_CATALOG.find(i => i.id === provider);
    if (!integ) return;

    Modal.open({
      title: `Conectar ${integ.name}`,
      size:  'sm',
      body: `<div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div style="text-align:center;padding:var(--space-4)">
          <div style="width:64px;height:64px;border-radius:var(--radius-xl);background:${integ.color}20;display:flex;align-items:center;justify-content:center;margin:0 auto var(--space-4)">
            <i data-lucide="${integ.icon}" style="width:32px;height:32px;color:${integ.color}"></i>
          </div>
          <p style="font-size:var(--text-sm);color:var(--text-secondary)">${esc(integ.description)}</p>
        </div>
        <div class="input-group">
          <label class="input-label">API Key / Token</label>
          <input type="password" class="input" id="integ-key" placeholder="Cole sua chave de API aqui">
        </div>
        <div class="input-group">
          <label class="input-label">Webhook URL (opcional)</label>
          <input type="text" class="input" id="integ-webhook" placeholder="https://...">
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Integrations.saveConnection('${provider}')">
                 <i data-lucide="link-2" style="width:14px;height:14px"></i> Conectar
               </button>`,
    });
    setTimeout(() => lucide.createIcons(), 50);
  },

  async saveConnection(provider) {
    const orgId = Store.get('orgId');
    const apiKey = document.getElementById('integ-key')?.value.trim();
    if (!apiKey) { Toasts.error('Erro', 'Informe a chave de API'); return; }

    const existing = _active[provider];

    const payload = {
      organization_id: orgId,
      provider,
      status:      'active',
      config:      { webhook_url: document.getElementById('integ-webhook')?.value.trim() || null },
      credentials: { api_key: apiKey }, // Supabase vai criptografar via RLS + vault
    };

    const { error } = existing
      ? await db.from('integrations').update(payload).eq('id', existing.id)
      : await db.from('integrations').insert(payload);

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Integração conectada', provider);
    await this.load();
  },

  configure(provider) {
    this.connect(provider);
  },

  async disconnect(provider) {
    Modal.confirm({
      title:   `Desconectar ${provider}`,
      message: 'Deseja remover essa integração? Dados sincronizados serão mantidos.',
      confirmText: 'Desconectar',
      dangerous: true,
      onConfirm: async () => {
        const existing = _active[provider];
        if (!existing) return;
        await db.from('integrations').update({ status: 'inactive' }).eq('id', existing.id);
        Toasts.success('Integração removida', provider);
        await Integrations.load();
      },
    });
  },
};
