/**
 * Leads Module — CRUD completo de leads com timeline
 */
import { db }       from '../services/supabase.js';
import { Store }    from '../core/store.js';
import { Modal }    from '../components/modal.js';
import { Toasts }   from '../components/notifications.js';
import { fmt, badge, avatar, STATUS, debounce, renderPagination, esc, safeUrl } from '../core/utils.js';

const PAGE_SIZE = 25;
let _currentPage = 1;
let _total       = 0;
let _filter      = 'all';
let _search      = '';
let _sort        = { field: 'created_at', asc: false };
let _data        = [];

export const Leads = {
  async init() {
    await this.load();
  },

  async load(page = 1) {
    _currentPage = page;
    const orgId  = Store.get('orgId');

    let q = db.from('leads')
      .select('*, contacts(first_name,last_name,email,avatar_url), companies(name), profiles:owner_id(first_name,last_name)', { count: 'exact' })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    // Filtros
    if (_filter === 'new')       q = q.eq('status', 'new');
    if (_filter === 'hot')       q = q.eq('temperature', 'hot');
    if (_filter === 'qualified') q = q.eq('status', 'qualified');
    if (_filter === 'mine')      q = q.eq('owner_id', Store.get('user')?.id);

    // Busca
    if (_search) q = q.or(`title.ilike.%${_search}%,description.ilike.%${_search}%`);

    // Ordenação
    q = q.order(_sort.field, { ascending: _sort.asc });

    // Paginação
    const from = (page - 1) * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) { Toasts.error('Erro', 'Falha ao carregar leads'); return; }

    _data  = data  || [];
    _total = count || 0;

    this._renderTable();
    this._renderPagination();

    document.getElementById('leads-count').textContent =
      `${fmt.number(_total)} lead${_total !== 1 ? 's' : ''} encontrado${_total !== 1 ? 's' : ''}`;

    // Badge na sidebar
    const badge = document.getElementById('badge-leads');
    if (badge) {
      const hot = _data.filter(l => l.temperature === 'hot').length;
      badge.textContent = hot;
      badge.style.display = hot > 0 ? 'flex' : 'none';
    }
  },

  _renderTable() {
    const tbody = document.getElementById('leads-tbody');
    if (!tbody) return;

    if (!_data.length) {
      tbody.innerHTML = `<tr><td colspan="10">
        <div class="empty-state">
          <div class="empty-state-icon"><i data-lucide="users"></i></div>
          <div class="empty-state-title">Nenhum lead encontrado</div>
          <div class="empty-state-desc">Crie seu primeiro lead ou ajuste os filtros</div>
          <button class="btn btn-primary" onclick="Leads.openCreate()">
            <i data-lucide="plus" style="width:16px;height:16px"></i> Novo Lead
          </button>
        </div>
      </td></tr>`;
      lucide.createIcons({ nodes: [tbody] });
      return;
    }

    tbody.innerHTML = _data.map(l => {
      const contact = l.contacts;
      const company = l.companies;
      const st      = STATUS.lead[l.status]   || { label: l.status,    color:'#64748b' };
      const tp      = STATUS.temperature[l.temperature] || { label: l.temperature, color:'#64748b' };

      return `<tr onclick="Leads.openDetail('${l.id}')" style="cursor:pointer">
        <td onclick="event.stopPropagation()">
          <input type="checkbox" data-id="${l.id}" onchange="Leads.toggleSelect(this)" style="accent-color:var(--color-primary-500)">
        </td>
        <td>
          <div style="font-weight:var(--font-medium);color:var(--text-primary)">${esc(l.title)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(l.source||'')}</div>
        </td>
        <td>${contact ? `
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            ${avatar(contact.first_name, contact.avatar_url, 'sm')}
            <div>
              <div style="font-size:var(--text-sm)">${esc(contact.first_name)} ${esc(contact.last_name||'')}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(contact.email||'')}</div>
            </div>
          </div>` : '—'}
        </td>
        <td>${esc(company?.name || '—')}</td>
        <td><span class="badge" style="background:${st.color}20;color:${st.color}">${esc(st.label)}</span></td>
        <td><span class="badge" style="background:${tp.color}20;color:${tp.color}">${esc(tp.label)}</span></td>
        <td>
          <div class="score">
            <div class="score-bar"><div class="score-fill" style="width:${l.score}%;background:${fmt.scoreColor(l.score)}"></div></div>
            <span class="score-value">${l.score}</span>
          </div>
        </td>
        <td>${l.value ? fmt.currency(l.value) : '—'}</td>
        <td style="color:var(--text-tertiary);font-size:var(--text-xs)">${fmt.date(l.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-xs" onclick="Leads.openDetail('${l.id}')" title="Ver detalhes">
              <i data-lucide="eye" style="width:14px;height:14px"></i>
            </button>
            <button class="btn btn-ghost btn-xs" onclick="Leads.openEdit('${l.id}')" title="Editar">
              <i data-lucide="pencil" style="width:14px;height:14px"></i>
            </button>
            <button class="btn btn-ghost btn-xs" onclick="Leads.confirmDelete('${l.id}')" title="Excluir" style="color:var(--color-danger)">
              <i data-lucide="trash-2" style="width:14px;height:14px"></i>
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');
    lucide.createIcons({ nodes: [tbody] });
  },

  _renderPagination() {
    const el   = document.getElementById('leads-pagination');
    const info = document.getElementById('leads-pagination-info');
    if (!el) return;

    const from = (_currentPage - 1) * PAGE_SIZE + 1;
    const to   = Math.min(_currentPage * PAGE_SIZE, _total);
    if (info) info.textContent = `${from}–${to} de ${fmt.number(_total)}`;

    el.innerHTML = renderPagination(_currentPage, _total, PAGE_SIZE, 'Leads.load');
    lucide.createIcons({ nodes: [el] });
  },

  search: debounce(function(val) {
    _search = val;
    Leads.load(1);
  }, 400),

  filter(f, evt) {
    _filter = f;
    document.querySelectorAll('#leads-filter-bar .filter-chip').forEach(c => c.classList.remove('active'));
    const target = (evt || (typeof event !== 'undefined' ? event : null))?.target;
    target?.classList.add('active');
    this.load(1);
  },

  filterBySource(src) { _search = src ? `source.eq.${src}` : ''; this.load(1); },

  sort(field) {
    _sort = { field, asc: _sort.field === field ? !_sort.asc : false };
    this.load(_currentPage);
  },

  toggleFilters() {
    const bar = document.getElementById('leads-filter-bar');
    bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
  },

  selectAll(cb) {
    document.querySelectorAll('#leads-tbody input[type=checkbox]')
      .forEach(c => c.checked = cb.checked);
  },

  toggleSelect(cb) {
    const id = cb.dataset.id;
    // batch actions (expandir conforme necessário)
  },

  /** Abre modal de criação */
  openCreate() {
    Modal.open({
      title: 'Novo Lead',
      size: 'lg',
      body: this._buildForm(),
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Leads.save()">
          <i data-lucide="save" style="width:16px;height:16px"></i>
          <span class="btn-text">Salvar Lead</span>
        </button>`,
    });
  },

  async openEdit(id) {
    const { data } = await db.from('leads').select('*').eq('id', id).single();
    if (!data) return;
    Modal.open({
      title: 'Editar Lead',
      size: 'lg',
      body: this._buildForm(data),
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Leads.update('${id}')">
          <i data-lucide="save" style="width:16px;height:16px"></i>
          <span class="btn-text">Atualizar</span>
        </button>`,
    });
  },

  _buildForm(lead = {}) {
    return `
      <div class="detail-form-grid">
        <div class="input-group full-width">
          <label class="input-label required">Título do Lead</label>
          <input type="text" class="input" id="f-title" value="${esc(lead.title||'')}" placeholder="Ex: Implantação de ERP">
        </div>

        <div class="input-group">
          <label class="input-label">Status</label>
          <select class="input" id="f-status">
            ${Object.entries(STATUS.lead).map(([v,s]) => `<option value="${v}" ${lead.status===v?'selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>

        <div class="input-group">
          <label class="input-label">Temperatura</label>
          <select class="input" id="f-temperature">
            ${Object.entries(STATUS.temperature).map(([v,s]) => `<option value="${v}" ${lead.temperature===v?'selected':''}>${s.label}</option>`).join('')}
          </select>
        </div>

        <div class="input-group">
          <label class="input-label">Valor estimado</label>
          <input type="number" class="input" id="f-value" value="${esc(lead.value||'')}" placeholder="0,00" step="0.01">
        </div>

        <div class="input-group">
          <label class="input-label">Fonte</label>
          <select class="input" id="f-source">
            <option value="">Selecionar...</option>
            ${['google','linkedin','facebook','instagram','referral','event','website','cold_call','email','other']
              .map(s => `<option value="${s}" ${lead.source===s?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>

        <div class="input-group">
          <label class="input-label">Fechamento previsto</label>
          <input type="date" class="input" id="f-close-date" value="${esc(lead.expected_close_date||'')}">
        </div>

        <div class="input-group full-width">
          <label class="input-label">Descrição</label>
          <textarea class="input" id="f-desc" rows="3" placeholder="Detalhes do lead...">${esc(lead.description||'')}</textarea>
        </div>
      </div>
    `;
  },

  async save() {
    const btn   = document.getElementById('modal-footer')?.querySelector('.btn-primary');
    if (btn) { btn.classList.add('loading'); btn.disabled = true; }

    const orgId = Store.get('orgId');
    const userId= Store.get('user')?.id;

    const payload = {
      organization_id: orgId,
      owner_id:        userId,
      title:       document.getElementById('f-title').value.trim(),
      status:      document.getElementById('f-status').value,
      temperature: document.getElementById('f-temperature').value,
      value:       parseFloat(document.getElementById('f-value').value) || null,
      source:      document.getElementById('f-source').value || null,
      expected_close_date: document.getElementById('f-close-date').value || null,
      description: document.getElementById('f-desc').value.trim() || null,
    };

    if (!payload.title) { Toasts.error('Erro', 'O título é obrigatório'); if(btn){btn.classList.remove('loading');btn.disabled=false;} return; }

    const { error } = await db.from('leads').insert(payload);
    if (error) { Toasts.error('Erro', error.message); if(btn){btn.classList.remove('loading');btn.disabled=false;} return; }

    Modal.close();
    Toasts.success('Lead criado', `"${payload.title}" foi adicionado`);
    await this.load(_currentPage);
  },

  async update(id) {
    const payload = {
      title:       document.getElementById('f-title').value.trim(),
      status:      document.getElementById('f-status').value,
      temperature: document.getElementById('f-temperature').value,
      value:       parseFloat(document.getElementById('f-value').value) || null,
      source:      document.getElementById('f-source').value || null,
      expected_close_date: document.getElementById('f-close-date').value || null,
      description: document.getElementById('f-desc').value.trim() || null,
    };

    const { error } = await db.from('leads').update(payload).eq('id', id);
    if (error) { Toasts.error('Erro', error.message); return; }

    Modal.close();
    Toasts.success('Lead atualizado', 'Alterações salvas com sucesso');
    await this.load(_currentPage);
  },

  confirmDelete(id) {
    Modal.confirm({
      title: 'Excluir Lead',
      message: 'Tem certeza que deseja excluir este lead? Esta ação não pode ser desfeita.',
      confirmText: 'Excluir',
      dangerous: true,
      onConfirm: () => this.delete(id),
    });
  },

  async delete(id) {
    const { error } = await db.from('leads').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { Toasts.error('Erro', error.message); return; }
    Toasts.success('Lead excluído', 'Lead movido para a lixeira');
    await this.load(_currentPage);
  },

  /** Abre painel lateral de detalhe + timeline */
  async openDetail(id) {
    const { data: lead } = await db
      .from('leads')
      .select('*, contacts(*), companies(*), profiles:owner_id(*)')
      .eq('id', id)
      .single();

    if (!lead) return;

    const panel = document.getElementById('detail-panel');
    document.getElementById('detail-title').textContent   = lead.title;
    document.getElementById('detail-subtitle').textContent = lead.contacts
      ? `${lead.contacts.first_name} ${lead.contacts.last_name||''} • ${lead.companies?.name||''}`.trim()
      : lead.companies?.name || '';

    // Tabs
    document.getElementById('detail-tabs').innerHTML = `
      <div class="tab active" onclick="Leads._showDetailTab('info',this)">Informações</div>
      <div class="tab" onclick="Leads._showDetailTab('timeline',this)">Timeline</div>
      <div class="tab" onclick="Leads._showDetailTab('tasks',this)">Tarefas</div>
    `;

    // Body
    document.getElementById('detail-body').innerHTML = `
      <div id="detail-tab-info" style="padding:var(--space-4)">
        ${this._buildDetailInfo(lead)}
      </div>
      <div id="detail-tab-timeline" style="padding:var(--space-4);display:none">
        <div id="lead-timeline-content"><div class="shimmer-loading" style="height:200px"></div></div>
        <div style="margin-top:var(--space-4)">
          <textarea class="input" id="lead-note-input" rows="2" placeholder="Adicionar nota..."></textarea>
          <div style="display:flex;gap:var(--space-2);margin-top:var(--space-2)">
            <button class="btn btn-secondary btn-sm" onclick="Leads.logActivity('${id}','call')"><i data-lucide="phone" style="width:14px;height:14px"></i> Ligação</button>
            <button class="btn btn-secondary btn-sm" onclick="Leads.logActivity('${id}','email')"><i data-lucide="mail" style="width:14px;height:14px"></i> E-mail</button>
            <button class="btn btn-secondary btn-sm" onclick="Leads.logActivity('${id}','meeting')"><i data-lucide="calendar" style="width:14px;height:14px"></i> Reunião</button>
            <button class="btn btn-primary btn-sm" onclick="Leads.addNote('${id}')"><i data-lucide="plus" style="width:14px;height:14px"></i> Nota</button>
          </div>
        </div>
      </div>
      <div id="detail-tab-tasks" style="padding:var(--space-4);display:none">
        <div id="lead-tasks-content"><div class="shimmer-loading" style="height:150px"></div></div>
        <button class="btn btn-primary btn-sm" onclick="Tasks.openCreate({leadId:'${id}'})" style="margin-top:var(--space-3)">
          <i data-lucide="plus" style="width:14px;height:14px"></i> Nova Tarefa
        </button>
      </div>
    `;

    panel.classList.add('open');
    lucide.createIcons({ nodes: [panel] });
    this._loadTimeline(id);
    this._loadLeadTasks(id);
  },

  _buildDetailInfo(lead) {
    const st = STATUS.lead[lead.status]         || { label: lead.status, color:'#64748b' };
    const tp = STATUS.temperature[lead.temperature] || { label: lead.temperature, color:'#64748b' };
    const fields = [
      { label:'Status',     value: `<span class="badge" style="background:${st.color}20;color:${st.color}">${esc(st.label)}</span>` },
      { label:'Temperatura',value: `<span class="badge" style="background:${tp.color}20;color:${tp.color}">${esc(tp.label)}</span>` },
      { label:'Fonte',      value: esc(lead.source || '—') },
      { label:'Valor',      value: lead.value ? fmt.currency(lead.value) : '—' },
      { label:'Score',      value: `<div class="score" style="width:120px"><div class="score-bar"><div class="score-fill" style="width:${lead.score}%;background:${fmt.scoreColor(lead.score)}"></div></div><span class="score-value">${lead.score}</span></div>` },
      { label:'Responsável',value: lead.profiles ? `${esc(lead.profiles.first_name)} ${esc(lead.profiles.last_name||'')}` : '—' },
      { label:'Fechamento previsto', value: fmt.date(lead.expected_close_date) },
      { label:'Criado em',  value: fmt.datetime(lead.created_at) },
    ];

    return `
      ${lead.description ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);margin-bottom:var(--space-4);padding:var(--space-3);background:var(--bg-overlay);border-radius:var(--radius-md)">${esc(lead.description)}</p>` : ''}
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${fields.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
            <span style="font-size:var(--text-xs);color:var(--text-tertiary);font-weight:var(--font-medium);text-transform:uppercase;letter-spacing:0.05em">${f.label}</span>
            <span style="font-size:var(--text-sm);color:var(--text-primary)">${f.value}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
        <button class="btn btn-secondary btn-sm" onclick="Leads.openEdit('${lead.id}')">
          <i data-lucide="pencil" style="width:14px;height:14px"></i> Editar
        </button>
        <button class="btn btn-danger btn-sm" onclick="Leads.confirmDelete('${lead.id}')">
          <i data-lucide="trash-2" style="width:14px;height:14px"></i> Excluir
        </button>
      </div>
    `;
  },

  async _loadTimeline(leadId) {
    const timeline = await rpc_get_timeline('lead', leadId);
    const container = document.getElementById('lead-timeline-content');
    if (!container) return;

    if (!timeline?.length) {
      container.innerHTML = `<div class="empty-state" style="padding:var(--space-6)">
        <div class="empty-state-icon"><i data-lucide="clock"></i></div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary)">Nenhuma atividade registrada</p>
      </div>`;
      lucide.createIcons({ nodes: [container] });
      return;
    }

    const typeIcons = { call:'phone', email:'mail', meeting:'calendar', note:'sticky-note', stage_change:'git-merge', task:'check-square', comment:'message-square' };

    container.innerHTML = `<div class="timeline">${timeline.map(item => `
      <div class="timeline-item">
        <div class="timeline-icon ${item.subtype||item.timeline_type}">
          <i data-lucide="${typeIcons[item.timeline_type]||'activity'}" style="width:12px;height:12px"></i>
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <div class="timeline-title">${esc(item.title)}</div>
            <div class="timeline-time">${fmt.relativeTime(item.created_at)}</div>
          </div>
          ${item.description ? `<div class="timeline-body">${esc(item.description)}</div>` : ''}
        </div>
      </div>
    `).join('')}</div>`;
    lucide.createIcons({ nodes: [container] });
  },

  async _loadLeadTasks(leadId) {
    const { data: tasks } = await db
      .from('tasks')
      .select('*')
      .eq('lead_id', leadId)
      .is('deleted_at', null)
      .order('due_date');

    const container = document.getElementById('lead-tasks-content');
    if (!container) return;

    if (!tasks?.length) {
      container.innerHTML = `<p style="font-size:var(--text-sm);color:var(--text-secondary)">Nenhuma tarefa vinculada</p>`;
      return;
    }

    container.innerHTML = tasks.map(t => {
      const pr = STATUS.priority[t.priority];
      return `<div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
        <input type="checkbox" ${t.status==='done'?'checked':''} onchange="Tasks.complete('${t.id}',this)" style="accent-color:var(--color-primary-500)">
        <div style="flex:1">
          <div style="font-size:var(--text-sm);${t.status==='done'?'text-decoration:line-through;color:var(--text-tertiary)':''}">${esc(t.title)}</div>
          <div style="font-size:var(--text-xs);color:${pr?.color||'var(--text-tertiary)'}">
            ${esc(pr?.label||'')} ${t.due_date ? '• ' + fmt.date(t.due_date) : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  },

  _showDetailTab(tab, el) {
    document.querySelectorAll('#detail-tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('[id^="detail-tab-"]').forEach(d => d.style.display = 'none');
    document.getElementById(`detail-tab-${tab}`).style.display = 'block';
  },

  async logActivity(leadId, type) {
    const note  = document.getElementById('lead-note-input')?.value.trim();
    const labels= { call:'Ligação registrada', email:'E-mail registrado', meeting:'Reunião registrada' };

    const { error } = await db.from('activities').insert({
      organization_id: Store.get('orgId'),
      type,
      title:       note || labels[type],
      description: note || null,
      lead_id:     leadId,
      performed_by:Store.get('user')?.id,
      status:      'completed',
    });

    if (error) { Toasts.error('Erro', error.message); return; }
    if (document.getElementById('lead-note-input')) document.getElementById('lead-note-input').value = '';
    Toasts.success(labels[type], 'Atividade registrada na timeline');
    this._loadTimeline(leadId);
  },

  async addNote(leadId) {
    const note = document.getElementById('lead-note-input')?.value.trim();
    if (!note) { Toasts.warning('Aviso', 'Digite o conteúdo da nota'); return; }
    await this.logActivity(leadId, 'note');
  },
};

// Helper para chamar RPC de timeline (exposta globalmente para uso nos templates)
async function rpc_get_timeline(entityType, entityId) {
  const { data } = await db.rpc('get_timeline', { p_entity_type: entityType, p_entity_id: entityId });
  return data;
}
