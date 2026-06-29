/**
 * Automations Module — Lista e criação de automações
 */
import { db }     from '../services/supabase.js';
import { Store }  from '../core/store.js';
import { Modal }  from '../components/modal.js';
import { Toasts } from '../components/notifications.js';
import { fmt, esc } from '../core/utils.js';

let _data = [];

const TRIGGER_LABELS = {
  lead_created:         'Lead criado',
  lead_status_changed:  'Status do lead alterado',
  opportunity_stage_changed: 'Oportunidade muda de etapa',
  task_completed:       'Tarefa concluída',
  task_overdue:         'Tarefa atrasada',
  contact_created:      'Contato criado',
  deal_won:             'Negócio ganho',
  deal_lost:            'Negócio perdido',
  inactivity:           'Inatividade (X dias)',
};

const ACTION_LABELS = {
  send_email:           'Enviar e-mail',
  create_task:          'Criar tarefa',
  send_notification:    'Enviar notificação interna',
  update_lead_status:   'Atualizar status do lead',
  assign_owner:         'Atribuir responsável',
  add_tag:              'Adicionar tag',
  move_stage:           'Mover de etapa',
  webhook:              'Disparar webhook',
};

export const Automations = {
  async init() { await this.load(); },

  async load() {
    const orgId = Store.get('orgId');
    const { data, error } = await db.from('automations')
      .select('*, profiles:owner_id(first_name,last_name)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) { Toasts.error('Erro', error.message); return; }
    _data = data || [];
    this._render();
  },

  _render() {
    const body = document.getElementById('automations-body');
    if (!body) return;

    if (!_data.length) {
      body.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="zap"></i></div>
        <div class="empty-state-title">Nenhuma automação configurada</div>
        <div class="empty-state-desc">Automações executam ações automaticamente quando eventos ocorrem</div>
        <button class="btn btn-primary" onclick="Automations.openCreate()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nova Automação</button>
      </div>`;
      lucide.createIcons({ nodes: [body] });
      return;
    }

    body.innerHTML = `<div style="display:flex;flex-direction:column;gap:var(--space-4)">
      ${_data.map(a => this._buildCard(a)).join('')}
    </div>`;
    lucide.createIcons({ nodes: [body] });
  },

  _buildCard(a) {
    const trigLabel = TRIGGER_LABELS[a.trigger_type] || a.trigger_type;
    const owner = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name || ''}`.trim() : '—';
    const actions = Array.isArray(a.actions) ? a.actions : [];

    return `<div class="card" style="padding:var(--space-5)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--space-4)">
        <div style="display:flex;align-items:flex-start;gap:var(--space-4);flex:1">
          <div style="width:40px;height:40px;border-radius:var(--radius-lg);background:${a.is_active ? 'var(--color-primary-900)' : 'var(--bg-tertiary)'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="zap" style="width:18px;height:18px;color:${a.is_active ? 'var(--color-primary-400)' : 'var(--text-tertiary)'}"></i>
          </div>
          <div style="flex:1">
            <div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:4px">
              <span style="font-weight:var(--font-semibold)">${esc(a.name)}</span>
              <span class="badge ${a.is_active ? 'badge-success' : 'badge-neutral'}">${a.is_active ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-3)">
              <strong>Gatilho:</strong> ${esc(trigLabel)}
            </div>
            ${actions.length ? `
              <div style="display:flex;flex-wrap:wrap;gap:var(--space-2)">
                ${actions.map(ac => `
                  <span class="badge badge-outline">
                    <i data-lucide="arrow-right" style="width:10px;height:10px;margin-right:4px"></i>
                    ${esc(ACTION_LABELS[ac.type] || ac.type)}
                  </span>`).join('')}
              </div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);flex-shrink:0">
          <label class="toggle" title="${a.is_active ? 'Desativar' : 'Ativar'}">
            <input type="checkbox" ${a.is_active ? 'checked' : ''} onchange="Automations.toggle('${a.id}', this.checked)">
            <span class="toggle-slider"></span>
          </label>
          <button class="btn btn-ghost btn-xs" onclick="Automations.openEdit('${a.id}')">
            <i data-lucide="pencil" style="width:14px;height:14px"></i>
          </button>
          <button class="btn btn-ghost btn-xs" onclick="Automations.confirmDelete('${a.id}')" style="color:var(--color-danger)">
            <i data-lucide="trash-2" style="width:14px;height:14px"></i>
          </button>
        </div>
      </div>
      <div style="margin-top:var(--space-3);padding-top:var(--space-3);border-top:1px solid var(--border-subtle);display:flex;gap:var(--space-6)">
        <div style="font-size:var(--text-xs);color:var(--text-tertiary)">
          <i data-lucide="play" style="width:10px;height:10px"></i>
          Executada ${fmt.number(a.run_count || 0)} vez${(a.run_count || 0) !== 1 ? 'es' : ''}
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary)">
          <i data-lucide="user" style="width:10px;height:10px"></i>
          ${esc(owner)}
        </div>
        ${a.last_run_at ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary)">
          Última execução: ${fmt.relativeTime(a.last_run_at)}
        </div>` : ''}
      </div>
    </div>`;
  },

  async toggle(id, active) {
    const { error } = await db.from('automations')
      .update({ is_active: active })
      .eq('id', id);

    if (error) { Toasts.error('Erro', error.message); return; }
    Toasts.success(active ? 'Automação ativada' : 'Automação desativada', '');
    await this.load();
  },

  openCreate() {
    Modal.open({
      title: 'Nova Automação',
      size:  'lg',
      body:  this._buildForm(),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Automations.save()"><span class="btn-text">Criar Automação</span></button>`,
    });
  },

  async openEdit(id) {
    const { data } = await db.from('automations').select('*').eq('id', id).single();
    if (!data) return;
    Modal.open({
      title: 'Editar Automação',
      size:  'lg',
      body:  this._buildForm(data),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Automations.update('${id}')"><span class="btn-text">Atualizar</span></button>`,
    });
  },

  _buildForm(a = {}) {
    const actions = Array.isArray(a.actions) ? a.actions : [];
    return `<div class="detail-form-grid">
      <div class="input-group full-width">
        <label class="input-label required">Nome da Automação</label>
        <input type="text" class="input" id="auto-name" value="${esc(a.name || '')}" placeholder="Ex: Notificar responsável em novos leads">
      </div>
      <div class="input-group full-width">
        <label class="input-label">Descrição</label>
        <textarea class="input" id="auto-desc" rows="2" placeholder="O que essa automação faz...">${esc(a.description || '')}</textarea>
      </div>
      <div class="input-group full-width">
        <label class="input-label required">Gatilho (quando executar)</label>
        <select class="input" id="auto-trigger">
          ${Object.entries(TRIGGER_LABELS).map(([v, l]) => `<option value="${v}" ${a.trigger_type === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="input-group full-width">
        <label class="input-label required">Ação (o que fazer)</label>
        <select class="input" id="auto-action">
          ${Object.entries(ACTION_LABELS).map(([v, l]) => `<option value="${v}" ${actions[0]?.type === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="input-group full-width">
        <label class="input-label">Parâmetro da ação</label>
        <input type="text" class="input" id="auto-action-value" value="${esc(actions[0]?.value || '')}" placeholder="Ex: ID do usuário, texto do e-mail...">
      </div>
    </div>`;
  },

  async save() {
    const orgId = Store.get('orgId');
    const name  = document.getElementById('auto-name')?.value.trim();
    if (!name) { Toasts.error('Erro', 'Nome é obrigatório'); return; }

    const actions = [{
      type:  document.getElementById('auto-action')?.value,
      value: document.getElementById('auto-action-value')?.value.trim() || null,
    }];

    const { error } = await db.from('automations').insert({
      organization_id: orgId,
      owner_id:     Store.get('user')?.id,
      name,
      description:  document.getElementById('auto-desc')?.value.trim() || null,
      trigger_type: document.getElementById('auto-trigger')?.value,
      actions,
      is_active:    true,
      run_count:    0,
    });

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Automação criada', name);
    await this.load();
  },

  async update(id) {
    const name = document.getElementById('auto-name')?.value.trim();
    if (!name) { Toasts.error('Erro', 'Nome é obrigatório'); return; }

    const actions = [{
      type:  document.getElementById('auto-action')?.value,
      value: document.getElementById('auto-action-value')?.value.trim() || null,
    }];

    const { error } = await db.from('automations').update({
      name,
      description:  document.getElementById('auto-desc')?.value.trim() || null,
      trigger_type: document.getElementById('auto-trigger')?.value,
      actions,
    }).eq('id', id);

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Automação atualizada', '');
    await this.load();
  },

  confirmDelete(id) {
    Modal.confirm({
      title: 'Excluir Automação',
      message: 'Tem certeza? Esta automação será removida permanentemente.',
      confirmText: 'Excluir',
      dangerous: true,
      onConfirm: async () => {
        await db.from('automations').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        Toasts.success('Automação excluída', '');
        await Automations.load();
      },
    });
  },
};
