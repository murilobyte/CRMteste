/**
 * Tasks Module
 */
import { db }     from '../services/supabase.js';
import { Store }  from '../core/store.js';
import { Modal }  from '../components/modal.js';
import { Toasts } from '../components/notifications.js';
import { fmt, STATUS, esc } from '../core/utils.js';

let _filterStatus = 'all';
let _data = [];

export const Tasks = {
  async init() { await this.load(); },

  async load() {
    const orgId  = Store.get('orgId');
    const userId = Store.get('user')?.id;

    let q = db.from('tasks')
      .select('*, leads(title), contacts(first_name,last_name), profiles:assigned_to(first_name,last_name,avatar_url)')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true, nullsFirst: false });

    if (_filterStatus !== 'all') q = q.eq('status', _filterStatus);
    q = q.limit(100);

    const { data } = await q;
    _data = data || [];
    this._render();

    const count = document.getElementById('tasks-count');
    if (count) count.textContent = `${_data.length} tarefa${_data.length!==1?'s':''}`;

    // Badge
    const overdue = _data.filter(t => t.status!=='done' && t.due_date && new Date(t.due_date) < new Date()).length;
    const badge = document.getElementById('badge-tasks');
    if (badge) { badge.textContent = overdue; badge.style.display = overdue>0?'flex':'none'; }
  },

  _render() {
    const body = document.getElementById('tasks-body');
    if (!body) return;

    if (!_data.length) {
      body.innerHTML = `<div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="check-square"></i></div>
        <div class="empty-state-title">Nenhuma tarefa</div>
        <div class="empty-state-desc">Crie tarefas para organizar suas atividades</div>
        <button class="btn btn-primary" onclick="Tasks.openCreate()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nova Tarefa</button>
      </div>`;
      lucide.createIcons({nodes:[body]}); return;
    }

    // Agrupa por data
    const groups = this._groupByDate(_data);
    body.innerHTML = Object.entries(groups).map(([date, tasks]) => `
      <div style="margin-bottom:var(--space-6)">
        <div style="font-size:var(--text-xs);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.08em;color:var(--text-tertiary);margin-bottom:var(--space-3);padding:0 var(--space-2)">${date}</div>
        <div class="card" style="overflow:hidden">
          ${tasks.map(t => this._buildTaskRow(t)).join('')}
        </div>
      </div>
    `).join('');
    lucide.createIcons({nodes:[body]});
  },

  _groupByDate(tasks) {
    const today    = new Date().toDateString();
    const tomorrow = new Date(Date.now()+86400000).toDateString();
    const groups   = {};

    tasks.forEach(t => {
      let label;
      if (!t.due_date) { label = 'Sem data'; }
      else {
        const d = new Date(t.due_date).toDateString();
        if (d === today)    label = '🔴 Hoje';
        else if (d === tomorrow) label = '🟡 Amanhã';
        else if (new Date(t.due_date) < new Date()) label = '⚠️ Atrasadas';
        else label = fmt.date(t.due_date);
      }
      groups[label] = groups[label] || [];
      groups[label].push(t);
    });

    return groups;
  },

  _buildTaskRow(t) {
    const pr    = STATUS.priority[t.priority]  || { label: t.priority,  color:'#64748b' };
    const st    = STATUS.task[t.status]        || { label: t.status,     color:'#64748b' };
    const isDone= t.status === 'done';
    const isOverdue = !isDone && t.due_date && new Date(t.due_date) < new Date();

    return `<div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--border-subtle);transition:background 0.15s"
         onmouseenter="this.style.background='var(--bg-hover)'"
         onmouseleave="this.style.background=''"
         onclick="Tasks.openDetail('${t.id}')">
      <input type="checkbox"
             ${isDone?'checked':''}
             onclick="event.stopPropagation();Tasks.complete('${t.id}',this)"
             style="accent-color:var(--color-primary-500);width:16px;height:16px;cursor:pointer;flex-shrink:0">

      <div style="flex:1;min-width:0">
        <div style="font-size:var(--text-sm);${isDone?'text-decoration:line-through;color:var(--text-tertiary)':'color:var(--text-primary)'}">${esc(t.title)}</div>
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-top:3px">
          ${t.leads ? `<span style="font-size:var(--text-xs);color:var(--text-tertiary)"><i data-lucide="users" style="width:10px;height:10px"></i> ${esc(t.leads.title)}</span>` : ''}
          ${t.contacts ? `<span style="font-size:var(--text-xs);color:var(--text-tertiary)"><i data-lucide="user" style="width:10px;height:10px"></i> ${esc(t.contacts.first_name)}</span>` : ''}
        </div>
      </div>

      <div style="display:flex;align-items:center;gap:var(--space-3);flex-shrink:0">
        <span class="badge" style="background:${pr.color}20;color:${pr.color}">${esc(pr.label)}</span>
        ${t.due_date ? `
          <span style="font-size:var(--text-xs);color:${isOverdue?'var(--color-danger)':'var(--text-tertiary)'}">
            ${isOverdue ? '⚠️ ' : ''}${fmt.date(t.due_date)}
          </span>` : ''}
        <div style="display:flex;gap:4px" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-xs" onclick="Tasks.openEdit('${t.id}')">
            <i data-lucide="pencil" style="width:12px;height:12px"></i>
          </button>
          <button class="btn btn-ghost btn-xs" onclick="Tasks.confirmDelete('${t.id}')" style="color:var(--color-danger)">
            <i data-lucide="trash-2" style="width:12px;height:12px"></i>
          </button>
        </div>
      </div>
    </div>`;
  },

  filterStatus(status) {
    _filterStatus = status;
    document.querySelectorAll('#page-tasks .tab').forEach((t,i) => {
      t.classList.toggle('active',
        (status==='all' && i===0) || (status==='todo' && i===1) ||
        (status==='in_progress' && i===2) || (status==='done' && i===3)
      );
    });
    this.load();
  },

  async complete(id, checkbox) {
    const status = checkbox.checked ? 'done' : 'todo';
    const { error } = await db.from('tasks').update({
      status,
      completed_at: checkbox.checked ? new Date().toISOString() : null,
    }).eq('id', id);
    if (error) { checkbox.checked = !checkbox.checked; Toasts.error('Erro', error.message); return; }
    if (checkbox.checked) Toasts.success('Tarefa concluída', '✓');
    setTimeout(() => this.load(), 300);
  },

  openCreate(ctx = {}) {
    Modal.open({
      title: 'Nova Tarefa',
      size: 'lg',
      body: this._buildForm({}, ctx),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Tasks.save()"><span class="btn-text">Salvar</span></button>`,
    });
  },

  async openEdit(id) {
    const { data } = await db.from('tasks').select('*').eq('id',id).single();
    if (!data) return;
    Modal.open({
      title: 'Editar Tarefa',
      size: 'lg',
      body: this._buildForm(data),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Tasks.update('${id}')"><span class="btn-text">Atualizar</span></button>`,
    });
  },

  _buildForm(t={}, ctx={}) {
    return `<div class="detail-form-grid">
      <div class="input-group full-width">
        <label class="input-label required">Título</label>
        <input type="text" class="input" id="t-title" value="${esc(t.title||'')}" placeholder="O que precisa ser feito?">
      </div>
      <div class="input-group">
        <label class="input-label">Status</label>
        <select class="input" id="t-status">
          ${Object.entries(STATUS.task).map(([v,s])=>`<option value="${v}" ${(t.status||'todo')===v?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Prioridade</label>
        <select class="input" id="t-priority">
          ${Object.entries(STATUS.priority).map(([v,s])=>`<option value="${v}" ${(t.priority||'medium')===v?'selected':''}>${s.label}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Tipo</label>
        <select class="input" id="t-type">
          ${['task','call','email','meeting','visit'].map(tp=>`<option value="${tp}" ${(t.type||'task')===tp?'selected':''}>${tp}</option>`).join('')}
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Data de vencimento</label>
        <input type="datetime-local" class="input" id="t-due" value="${esc(t.due_date?t.due_date.slice(0,16):'')}">
      </div>
      <div class="input-group full-width">
        <label class="input-label">Descrição</label>
        <textarea class="input" id="t-desc" rows="3" placeholder="Detalhes da tarefa...">${esc(t.description||'')}</textarea>
      </div>
    </div>`;
  },

  async save() {
    const orgId = Store.get('orgId');
    const title = document.getElementById('t-title').value.trim();
    if (!title) { Toasts.error('Erro','Título é obrigatório'); return; }

    const { error } = await db.from('tasks').insert({
      organization_id: orgId,
      owner_id:    Store.get('user')?.id,
      assigned_to: Store.get('user')?.id,
      title,
      status:      document.getElementById('t-status').value,
      priority:    document.getElementById('t-priority').value,
      type:        document.getElementById('t-type').value,
      due_date:    document.getElementById('t-due').value || null,
      description: document.getElementById('t-desc').value.trim() || null,
    });
    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Tarefa criada', title);
    await this.load();
  },

  async update(id) {
    const title = document.getElementById('t-title').value.trim();
    if (!title) { Toasts.error('Erro','Título é obrigatório'); return; }

    const { error } = await db.from('tasks').update({
      title,
      status:      document.getElementById('t-status').value,
      priority:    document.getElementById('t-priority').value,
      type:        document.getElementById('t-type').value,
      due_date:    document.getElementById('t-due').value || null,
      description: document.getElementById('t-desc').value.trim() || null,
    }).eq('id', id);
    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Tarefa atualizada','');
    await this.load();
  },

  confirmDelete(id) {
    Modal.confirm({
      title:'Excluir Tarefa', message:'Tem certeza?', confirmText:'Excluir', dangerous:true,
      onConfirm: async () => {
        await db.from('tasks').update({deleted_at:new Date().toISOString()}).eq('id',id);
        Toasts.success('Tarefa excluída','');
        await Tasks.load();
      },
    });
  },

  async openDetail(id) {
    const { data:t } = await db.from('tasks').select('*').eq('id',id).single();
    if (!t) return;
    const panel = document.getElementById('detail-panel');
    document.getElementById('detail-title').textContent    = t.title;
    document.getElementById('detail-subtitle').textContent = STATUS.task[t.status]?.label || t.status;
    document.getElementById('detail-tabs').innerHTML = '';
    document.getElementById('detail-body').innerHTML = `<div style="padding:var(--space-4)">
      ${[
        {l:'Status',    v:esc(STATUS.task[t.status]?.label||t.status)},
        {l:'Prioridade',v:esc(STATUS.priority[t.priority]?.label||t.priority)},
        {l:'Tipo',      v:esc(t.type)},
        {l:'Vencimento',v:t.due_date?fmt.datetime(t.due_date):'—'},
        {l:'Criada em', v:fmt.datetime(t.created_at)},
      ].map(f=>`
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:500">${f.l}</span>
          <span style="font-size:var(--text-sm)">${f.v}</span>
        </div>`).join('')}
      ${t.description?`<p style="margin-top:var(--space-4);font-size:var(--text-sm);color:var(--text-secondary)">${esc(t.description)}</p>`:''}
      <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
        <button class="btn btn-secondary btn-sm" onclick="Tasks.openEdit('${t.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i> Editar</button>
        <button class="btn btn-success btn-sm" onclick="Tasks.complete('${t.id}',{checked:true})"><i data-lucide="check" style="width:14px;height:14px"></i> Concluir</button>
      </div>
    </div>`;
    panel.classList.add('open');
    lucide.createIcons({nodes:[panel]});
  },
};
