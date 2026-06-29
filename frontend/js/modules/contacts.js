/**
 * Contacts Module
 */
import { db }      from '../services/supabase.js';
import { Store }   from '../core/store.js';
import { Modal }   from '../components/modal.js';
import { Toasts }  from '../components/notifications.js';
import { fmt, avatar, debounce, renderPagination, esc } from '../core/utils.js';

const PAGE_SIZE = 25;
let _page = 1, _total = 0, _search = '', _data = [];

export const Contacts = {
  async init() { await this.load(); },

  async load(page = 1) {
    _page = page;
    const orgId = Store.get('orgId');
    let q = db.from('contacts')
      .select('*, companies(name)', { count:'exact' })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (_search) q = q.or(`first_name.ilike.%${_search}%,last_name.ilike.%${_search}%,email.ilike.%${_search}%`);

    q = q.order('created_at', { ascending: false });
    const from = (page-1)*PAGE_SIZE;
    q = q.range(from, from+PAGE_SIZE-1);

    const { data, count } = await q;
    _data = data || []; _total = count || 0;
    this._render();

    document.getElementById('contacts-count').textContent = `${fmt.number(_total)} contato${_total!==1?'s':''}`;
  },

  _render() {
    const tbody = document.getElementById('contacts-tbody');
    if (!tbody) return;

    if (!_data.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="user-x"></i></div>
        <div class="empty-state-title">Nenhum contato</div>
        <button class="btn btn-primary" onclick="Contacts.openCreate()"><i data-lucide="plus" style="width:16px;height:16px"></i> Novo Contato</button>
      </div></td></tr>`;
      lucide.createIcons({ nodes: [tbody] });
      return;
    }

    tbody.innerHTML = _data.map(c => `
      <tr onclick="Contacts.openDetail('${c.id}')" style="cursor:pointer">
        <td>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            ${avatar(`${c.first_name} ${c.last_name||''}`, c.avatar_url, 'sm')}
            <div>
              <div style="font-weight:var(--font-medium)">${esc(c.first_name)} ${esc(c.last_name||'')}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(c.job_title||'')}</div>
            </div>
          </div>
        </td>
        <td style="color:var(--text-secondary)">${esc(c.email||'—')}</td>
        <td style="color:var(--text-secondary)">${esc(c.phone||c.mobile||'—')}</td>
        <td>${esc(c.companies?.name||'—')}</td>
        <td><span class="badge ${c.status==='active'?'badge-success':'badge-neutral'}">${c.status==='active'?'Ativo':'Inativo'}</span></td>
        <td>
          <div class="score" style="width:80px">
            <div class="score-bar"><div class="score-fill" style="width:${c.score}%;background:${fmt.scoreColor(c.score)}"></div></div>
            <span class="score-value">${c.score}</span>
          </div>
        </td>
        <td style="color:var(--text-tertiary);font-size:var(--text-xs)">${fmt.date(c.created_at)}</td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-xs" onclick="Contacts.openEdit('${c.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
            <button class="btn btn-ghost btn-xs" onclick="Contacts.confirmDelete('${c.id}')" style="color:var(--color-danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
          </div>
        </td>
      </tr>`).join('');
    lucide.createIcons({ nodes: [tbody] });

    const pg = document.getElementById('contacts-pagination');
    if (pg) { pg.innerHTML = renderPagination(_page, _total, PAGE_SIZE, 'Contacts.load'); lucide.createIcons({nodes:[pg]}); }
    const info = document.getElementById('contacts-pagination-info');
    if (info) { const f=(_page-1)*PAGE_SIZE+1,t=Math.min(_page*PAGE_SIZE,_total); info.textContent=`${f}–${t} de ${fmt.number(_total)}`; }
  },

  search: debounce(function(val) { _search = val; Contacts.load(1); }, 350),

  openCreate() {
    Modal.open({
      title: 'Novo Contato',
      size: 'lg',
      body: this._buildForm(),
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Contacts.save()"><span class="btn-text">Salvar</span></button>`,
    });
  },

  async openEdit(id) {
    const { data } = await db.from('contacts').select('*').eq('id', id).single();
    if (!data) return;
    Modal.open({
      title: 'Editar Contato',
      size: 'lg',
      body: this._buildForm(data),
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Contacts.update('${id}')"><span class="btn-text">Atualizar</span></button>`,
    });
  },

  _buildForm(c = {}) {
    return `<div class="detail-form-grid">
      <div class="input-group"><label class="input-label required">Nome</label>
        <input type="text" class="input" id="c-fname" value="${esc(c.first_name||'')}" placeholder="João">
      </div>
      <div class="input-group"><label class="input-label">Sobrenome</label>
        <input type="text" class="input" id="c-lname" value="${esc(c.last_name||'')}" placeholder="Silva">
      </div>
      <div class="input-group"><label class="input-label">E-mail</label>
        <input type="email" class="input" id="c-email" value="${esc(c.email||'')}" placeholder="email@empresa.com">
      </div>
      <div class="input-group"><label class="input-label">Telefone</label>
        <input type="tel" class="input" id="c-phone" value="${esc(c.phone||'')}" placeholder="(11) 99999-9999">
      </div>
      <div class="input-group"><label class="input-label">Cargo</label>
        <input type="text" class="input" id="c-title" value="${esc(c.job_title||'')}" placeholder="CEO">
      </div>
      <div class="input-group"><label class="input-label">Departamento</label>
        <input type="text" class="input" id="c-dept" value="${esc(c.department||'')}" placeholder="Comercial">
      </div>
      <div class="input-group"><label class="input-label">LinkedIn</label>
        <input type="url" class="input" id="c-linkedin" value="${esc(c.linkedin_url||'')}" placeholder="linkedin.com/in/...">
      </div>
      <div class="input-group"><label class="input-label">Fonte</label>
        <select class="input" id="c-source">
          <option value="">Selecionar...</option>
          ${['google','linkedin','referral','event','website','cold_call','other'].map(s=>`<option value="${s}" ${c.source===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>`;
  },

  async save() {
    const orgId = Store.get('orgId');
    const fn    = document.getElementById('c-fname').value.trim();
    if (!fn) { Toasts.error('Erro','Nome é obrigatório'); return; }

    const { error } = await db.from('contacts').insert({
      organization_id: orgId,
      owner_id: Store.get('user')?.id,
      first_name:  fn,
      last_name:   document.getElementById('c-lname').value.trim()||null,
      email:       document.getElementById('c-email').value.trim()||null,
      phone:       document.getElementById('c-phone').value.trim()||null,
      job_title:   document.getElementById('c-title').value.trim()||null,
      department:  document.getElementById('c-dept').value.trim()||null,
      linkedin_url:document.getElementById('c-linkedin').value.trim()||null,
      source:      document.getElementById('c-source').value||null,
    });

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Contato criado', `${fn} adicionado`);
    await this.load(_page);
  },

  async update(id) {
    const fn = document.getElementById('c-fname').value.trim();
    if (!fn) { Toasts.error('Erro','Nome é obrigatório'); return; }

    const { error } = await db.from('contacts').update({
      first_name:  fn,
      last_name:   document.getElementById('c-lname').value.trim()||null,
      email:       document.getElementById('c-email').value.trim()||null,
      phone:       document.getElementById('c-phone').value.trim()||null,
      job_title:   document.getElementById('c-title').value.trim()||null,
      department:  document.getElementById('c-dept').value.trim()||null,
      linkedin_url:document.getElementById('c-linkedin').value.trim()||null,
    }).eq('id', id);

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Contato atualizado','');
    await this.load(_page);
  },

  confirmDelete(id) {
    Modal.confirm({
      title:'Excluir Contato', message:'Tem certeza? Esta ação não pode ser desfeita.',
      confirmText:'Excluir', dangerous:true,
      onConfirm: async () => {
        await db.from('contacts').update({deleted_at:new Date().toISOString()}).eq('id',id);
        Toasts.success('Contato excluído','');
        await Contacts.load(_page);
      },
    });
  },

  async openDetail(id) {
    const { data: c } = await db.from('contacts').select('*, companies(*)').eq('id',id).single();
    if (!c) return;
    const panel = document.getElementById('detail-panel');
    const name = `${c.first_name} ${c.last_name||''}`.trim();
    document.getElementById('detail-title').textContent    = name;
    document.getElementById('detail-subtitle').textContent = c.job_title || c.email || '';

    document.getElementById('detail-tabs').innerHTML = `
      <div class="tab active" onclick="Contacts._tab('info',this)">Perfil</div>
      <div class="tab" onclick="Contacts._tab('timeline',this)">Timeline</div>
    `;
    document.getElementById('detail-body').innerHTML = `
      <div id="detail-tab-info" style="padding:var(--space-4)">
        ${this._buildInfo(c)}
      </div>
      <div id="detail-tab-timeline" style="padding:var(--space-4);display:none">
        <div id="contact-timeline"><div class="shimmer-loading" style="height:200px"></div></div>
      </div>
    `;
    panel.classList.add('open');
    lucide.createIcons({nodes:[panel]});
  },

  _buildInfo(c) {
    const fields = [
      {l:'Email',     v:esc(c.email     || '—')},
      {l:'Telefone',  v:esc(c.phone     || '—')},
      {l:'Empresa',   v:esc(c.companies?.name || '—')},
      {l:'Cargo',     v:esc(c.job_title || '—')},
      {l:'Fonte',     v:esc(c.source    || '—')},
      {l:'Status',    v:esc(c.status    || '—')},
      {l:'Criado em', v:fmt.date(c.created_at)},
    ];
    return `<div style="display:flex;flex-direction:column;gap:var(--space-3)">
      ${fields.map(f=>`
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:500">${f.l}</span>
          <span style="font-size:var(--text-sm)">${f.v}</span>
        </div>`).join('')}
    </div>
    <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
      <button class="btn btn-secondary btn-sm" onclick="Contacts.openEdit('${c.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i> Editar</button>
    </div>`;
  },

  _tab(tab, el) {
    document.querySelectorAll('#detail-tabs .tab').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('[id^="detail-tab-"]').forEach(d=>d.style.display='none');
    document.getElementById(`detail-tab-${tab}`).style.display='block';
  },
};
