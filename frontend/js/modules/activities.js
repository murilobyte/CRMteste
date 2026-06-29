/**
 * Activities Module — Timeline global de atividades
 */
import { db }      from '../services/supabase.js';
import { Store }   from '../core/store.js';
import { Modal }   from '../components/modal.js';
import { Toasts }  from '../components/notifications.js';
import { fmt, esc } from '../core/utils.js';

const PAGE_SIZE = 50;
let _page = 1, _total = 0, _type = 'all', _data = [];

const TYPE_ICONS = {
  call:     'phone',
  email:    'mail',
  meeting:  'calendar',
  note:     'file-text',
  task:     'check-square',
  whatsapp: 'message-circle',
  visit:    'map-pin',
  linkedin: 'linkedin',
};

const TYPE_LABELS = {
  call:     'Ligação',
  email:    'E-mail',
  meeting:  'Reunião',
  note:     'Nota',
  task:     'Tarefa',
  whatsapp: 'WhatsApp',
  visit:    'Visita',
  linkedin: 'LinkedIn',
};

export const Activities = {
  async init() { await this.load(); },

  async load(page = 1) {
    _page = page;
    const orgId = Store.get('orgId');

    let q = db.from('activities')
      .select(`
        *,
        profiles:user_id(first_name, last_name, avatar_url),
        leads(title),
        contacts(first_name, last_name),
        companies(name)
      `, { count: 'exact' })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (_type !== 'all') q = q.eq('type', _type);
    q = q.order('created_at', { ascending: false });

    const from = (page - 1) * PAGE_SIZE;
    q = q.range(from, from + PAGE_SIZE - 1);

    const { data, count, error } = await q;
    if (error) { Toasts.error('Erro', error.message); return; }

    _data  = data  || [];
    _total = count || 0;
    this._render();

    const el = document.getElementById('activities-count');
    if (el) el.textContent = `${fmt.number(_total)} atividade${_total !== 1 ? 's' : ''}`;
  },

  _render() {
    const body = document.getElementById('activities-timeline') || document.getElementById('activities-body');
    if (!body) return;

    if (!_data.length) {
      body.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="activity"></i></div>
        <div class="empty-state-title">Nenhuma atividade registrada</div>
        <div class="empty-state-desc">As atividades aparecem automaticamente quando você interage com leads e contatos</div>
        <button class="btn btn-primary" onclick="Activities.openCreate()"><i data-lucide="plus" style="width:16px;height:16px"></i> Registrar Atividade</button>
      </div>`;
      lucide.createIcons({ nodes: [body] });
      return;
    }

    // Agrupa por dia
    const byDay = {};
    _data.forEach(a => {
      const day = fmt.date(a.created_at);
      byDay[day] = byDay[day] || [];
      byDay[day].push(a);
    });

    body.innerHTML = Object.entries(byDay).map(([day, acts]) => `
      <div style="margin-bottom:var(--space-6)">
        <div style="position:sticky;top:0;background:var(--bg-primary);z-index:1;padding:var(--space-2) 0;font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.08em;color:var(--text-tertiary);margin-bottom:var(--space-3)">
          ${day}
        </div>
        <div class="timeline">
          ${acts.map(a => this._buildItem(a)).join('')}
        </div>
      </div>
    `).join('');

    lucide.createIcons({ nodes: [body] });

    // Paginação
    const pg = document.getElementById('activities-pagination');
    if (pg) {
      const totalPages = Math.ceil(_total / PAGE_SIZE);
      pg.innerHTML = totalPages > 1 ? `
        <button class="btn btn-ghost btn-sm" onclick="Activities.load(${_page - 1})" ${_page === 1 ? 'disabled' : ''}>
          <i data-lucide="chevron-left" style="width:14px;height:14px"></i>
        </button>
        <span style="font-size:var(--text-sm);color:var(--text-secondary)">Página ${_page} de ${totalPages}</span>
        <button class="btn btn-ghost btn-sm" onclick="Activities.load(${_page + 1})" ${_page >= totalPages ? 'disabled' : ''}>
          <i data-lucide="chevron-right" style="width:14px;height:14px"></i>
        </button>
      ` : '';
      lucide.createIcons({ nodes: [pg] });
    }
  },

  _buildItem(a) {
    const icon  = TYPE_ICONS[a.type]  || 'activity';
    const label = TYPE_LABELS[a.type] || a.type;
    const user  = a.profiles ? `${a.profiles.first_name} ${a.profiles.last_name || ''}`.trim() : 'Sistema';
    const ref   = a.leads?.title || (a.contacts ? `${a.contacts.first_name} ${a.contacts.last_name || ''}`.trim() : '') || a.companies?.name || '';

    return `<div class="timeline-item animate-fadeIn">
      <div class="timeline-icon">
        <i data-lucide="${icon}"></i>
      </div>
      <div class="timeline-content">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <span class="badge badge-outline" style="margin-bottom:4px">${esc(label)}</span>
            <div style="font-size:var(--text-sm);color:var(--text-primary);font-weight:var(--font-medium)">${esc(a.title || label)}</div>
            ${a.description ? `<div style="font-size:var(--text-xs);color:var(--text-secondary);margin-top:4px">${esc(a.description)}</div>` : ''}
            ${ref ? `<div style="font-size:var(--text-xs);color:var(--color-primary-400);margin-top:4px">${esc(ref)}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0;margin-left:var(--space-4)">
            <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${fmt.relativeTime(a.created_at)}</div>
            <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(user)}</div>
          </div>
        </div>
      </div>
    </div>`;
  },

  filterType(type) {
    _type = type;
    document.querySelectorAll('#page-activities .filter-chip').forEach(c => c.classList.remove('active'));
    event?.target?.classList.add('active');
    this.load(1);
  },

  openCreate() {
    Modal.open({
      title: 'Registrar Atividade',
      size: 'lg',
      body: `<div class="detail-form-grid">
        <div class="input-group">
          <label class="input-label required">Tipo</label>
          <select class="input" id="act-type">
            ${Object.entries(TYPE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
          </select>
        </div>
        <div class="input-group full-width">
          <label class="input-label required">Título</label>
          <input type="text" class="input" id="act-title" placeholder="Descreva a atividade...">
        </div>
        <div class="input-group full-width">
          <label class="input-label">Descrição</label>
          <textarea class="input" id="act-desc" rows="3" placeholder="Detalhes adicionais..."></textarea>
        </div>
        <div class="input-group">
          <label class="input-label">Data/Hora</label>
          <input type="datetime-local" class="input" id="act-date" value="${new Date().toISOString().slice(0, 16)}">
        </div>
        <div class="input-group">
          <label class="input-label">Duração (min)</label>
          <input type="number" class="input" id="act-duration" placeholder="30" min="1">
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Activities.save()"><span class="btn-text">Registrar</span></button>`,
    });
  },

  async save() {
    const orgId = Store.get('orgId');
    const title = document.getElementById('act-title')?.value.trim();
    if (!title) { Toasts.error('Erro', 'Título é obrigatório'); return; }

    const { error } = await db.from('activities').insert({
      organization_id: orgId,
      user_id:     Store.get('user')?.id,
      type:        document.getElementById('act-type')?.value,
      title,
      description: document.getElementById('act-desc')?.value.trim() || null,
      occurred_at: document.getElementById('act-date')?.value || new Date().toISOString(),
      duration:    parseInt(document.getElementById('act-duration')?.value) || null,
    });

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Atividade registrada', title);
    await this.load(_page);
  },
};
