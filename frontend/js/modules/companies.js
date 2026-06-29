/**
 * Companies Module
 */
import { db }      from '../services/supabase.js';
import { Store }   from '../core/store.js';
import { Modal }   from '../components/modal.js';
import { Toasts }  from '../components/notifications.js';
import { fmt, avatar, debounce, renderPagination, esc, safeUrl } from '../core/utils.js';

const PAGE_SIZE = 25;
let _page=1, _total=0, _search='', _data=[];

export const Companies = {
  async init() { await this.load(); },

  async load(page=1) {
    _page = page;
    const orgId = Store.get('orgId');
    let q = db.from('companies')
      .select('*', { count:'exact' })
      .eq('organization_id', orgId)
      .is('deleted_at', null);

    if (_search) q = q.ilike('name', `%${_search}%`);
    q = q.order('created_at', {ascending:false});
    const from = (page-1)*PAGE_SIZE;
    q = q.range(from, from+PAGE_SIZE-1);

    const { data, count } = await q;
    _data=data||[]; _total=count||0;
    this._render();
    document.getElementById('companies-count').textContent = `${fmt.number(_total)} empresa${_total!==1?'s':''}`;
  },

  _render() {
    const tbody = document.getElementById('companies-tbody');
    if (!tbody) return;
    if (!_data.length) {
      tbody.innerHTML=`<tr><td colspan="7"><div class="empty-state">
        <div class="empty-state-icon"><i data-lucide="building-2"></i></div>
        <div class="empty-state-title">Nenhuma empresa cadastrada</div>
        <button class="btn btn-primary" onclick="Companies.openCreate()"><i data-lucide="plus" style="width:16px;height:16px"></i> Nova Empresa</button>
      </div></td></tr>`;
      lucide.createIcons({nodes:[tbody]}); return;
    }
    tbody.innerHTML = _data.map(c=>`
      <tr onclick="Companies.openDetail('${c.id}')" style="cursor:pointer">
        <td>
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            ${avatar(c.name, c.logo_url, 'sm')}
            <div>
              <div style="font-weight:var(--font-medium)">${esc(c.name)}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(c.website||'')}</div>
            </div>
          </div>
        </td>
        <td style="color:var(--text-secondary)">${esc(c.industry||'—')}</td>
        <td style="color:var(--text-secondary)">${esc(c.phone||'—')}</td>
        <td style="color:var(--text-secondary)">${esc(c.email||'—')}</td>
        <td>
          <div class="score" style="width:80px">
            <div class="score-bar"><div class="score-fill" style="width:${c.score}%;background:${fmt.scoreColor(c.score)}"></div></div>
            <span class="score-value">${c.score}</span>
          </div>
        </td>
        <td><span class="badge ${c.status==='active'?'badge-success':'badge-neutral'}">${c.status==='active'?'Ativa':'Inativa'}</span></td>
        <td onclick="event.stopPropagation()">
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-xs" onclick="Companies.openEdit('${c.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i></button>
            <button class="btn btn-ghost btn-xs" onclick="Companies.confirmDelete('${c.id}')" style="color:var(--color-danger)"><i data-lucide="trash-2" style="width:14px;height:14px"></i></button>
          </div>
        </td>
      </tr>`).join('');
    lucide.createIcons({nodes:[tbody]});

    const pg = document.getElementById('companies-pagination');
    if (pg) { pg.innerHTML = renderPagination(_page,_total,PAGE_SIZE,'Companies.load'); lucide.createIcons({nodes:[pg]}); }
  },

  search: debounce(function(val) { _search=val; Companies.load(1); }, 350),

  openCreate() {
    Modal.open({
      title: 'Nova Empresa',
      size: 'lg',
      body: this._buildForm(),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Companies.save()"><span class="btn-text">Salvar</span></button>`,
    });
  },

  async openEdit(id) {
    const { data } = await db.from('companies').select('*').eq('id',id).single();
    if (!data) return;
    Modal.open({
      title: 'Editar Empresa',
      size: 'lg',
      body: this._buildForm(data),
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Companies.update('${id}')"><span class="btn-text">Atualizar</span></button>`,
    });
  },

  _buildForm(c={}) {
    const industries = ['Tecnologia','Varejo','Saúde','Educação','Construção','Finanças','Manufatura','Serviços','Outro'];
    const sizes = ['1-10','10-50','50-200','200-500','500-1000','1000+'];
    return `<div class="detail-form-grid">
      <div class="input-group full-width"><label class="input-label required">Nome da Empresa</label>
        <input type="text" class="input" id="co-name" value="${esc(c.name||'')}" placeholder="Empresa Ltda">
      </div>
      <div class="input-group"><label class="input-label">Setor</label>
        <select class="input" id="co-industry">
          <option value="">Selecionar...</option>
          ${industries.map(i=>`<option value="${i}" ${c.industry===i?'selected':''}>${i}</option>`).join('')}
        </select>
      </div>
      <div class="input-group"><label class="input-label">Tamanho</label>
        <select class="input" id="co-size">
          <option value="">Selecionar...</option>
          ${sizes.map(s=>`<option value="${s}" ${c.company_size===s?'selected':''}>${s} funcionários</option>`).join('')}
        </select>
      </div>
      <div class="input-group"><label class="input-label">Telefone</label>
        <input type="tel" class="input" id="co-phone" value="${esc(c.phone||'')}" placeholder="(11) 3456-7890">
      </div>
      <div class="input-group"><label class="input-label">E-mail</label>
        <input type="email" class="input" id="co-email" value="${esc(c.email||'')}" placeholder="contato@empresa.com">
      </div>
      <div class="input-group"><label class="input-label">Website</label>
        <input type="url" class="input" id="co-website" value="${esc(c.website||'')}" placeholder="https://empresa.com">
      </div>
      <div class="input-group"><label class="input-label">Receita Anual (R$)</label>
        <input type="number" class="input" id="co-revenue" value="${esc(c.annual_revenue||'')}" placeholder="0">
      </div>
      <div class="input-group"><label class="input-label">CNPJ</label>
        <input type="text" class="input" id="co-doc" value="${esc(c.document||'')}" placeholder="00.000.000/0001-00">
      </div>
    </div>`;
  },

  async save() {
    const orgId = Store.get('orgId');
    const name  = document.getElementById('co-name').value.trim();
    if (!name) { Toasts.error('Erro','Nome é obrigatório'); return; }

    const { error } = await db.from('companies').insert({
      organization_id: orgId,
      owner_id: Store.get('user')?.id,
      name,
      industry:       document.getElementById('co-industry').value||null,
      company_size:   document.getElementById('co-size').value||null,
      phone:          document.getElementById('co-phone').value.trim()||null,
      email:          document.getElementById('co-email').value.trim()||null,
      website:        document.getElementById('co-website').value.trim()||null,
      annual_revenue: parseFloat(document.getElementById('co-revenue').value)||null,
      document:       document.getElementById('co-doc').value.trim()||null,
    });
    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Empresa criada', name);
    await this.load(_page);
  },

  async update(id) {
    const name = document.getElementById('co-name').value.trim();
    if (!name) { Toasts.error('Erro','Nome é obrigatório'); return; }

    const { error } = await db.from('companies').update({
      name,
      industry:       document.getElementById('co-industry').value||null,
      company_size:   document.getElementById('co-size').value||null,
      phone:          document.getElementById('co-phone').value.trim()||null,
      email:          document.getElementById('co-email').value.trim()||null,
      website:        document.getElementById('co-website').value.trim()||null,
      annual_revenue: parseFloat(document.getElementById('co-revenue').value)||null,
    }).eq('id', id);
    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Empresa atualizada','');
    await this.load(_page);
  },

  confirmDelete(id) {
    Modal.confirm({
      title:'Excluir Empresa', message:'Tem certeza? Esta ação não pode ser desfeita.',
      confirmText:'Excluir', dangerous:true,
      onConfirm: async () => {
        await db.from('companies').update({deleted_at:new Date().toISOString()}).eq('id',id);
        Toasts.success('Empresa excluída','');
        await Companies.load(_page);
      },
    });
  },

  async openDetail(id) {
    const { data: c } = await db.from('companies').select('*').eq('id',id).single();
    if (!c) return;
    const panel = document.getElementById('detail-panel');
    document.getElementById('detail-title').textContent   = c.name;
    document.getElementById('detail-subtitle').textContent = c.industry || '';
    document.getElementById('detail-tabs').innerHTML = `<div class="tab active">Detalhes</div>`;
    document.getElementById('detail-body').innerHTML = `<div style="padding:var(--space-4)">${this._buildInfo(c)}</div>`;
    panel.classList.add('open');
    lucide.createIcons({nodes:[panel]});
  },

  _buildInfo(c) {
    const websiteUrl = safeUrl(c.website);
    const fields = [
      {l:'Setor',    v:esc(c.industry||'—')},
      {l:'Tamanho',  v:esc(c.company_size||'—')},
      {l:'Telefone', v:esc(c.phone||'—')},
      {l:'E-mail',   v:esc(c.email||'—')},
      {l:'Website',  v:websiteUrl?`<a href="${websiteUrl}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a>`:'—'},
      {l:'Receita',  v:c.annual_revenue?fmt.currency(c.annual_revenue):'—'},
      {l:'CNPJ',     v:esc(c.document||'—')},
      {l:'Status',   v:esc(c.status||'—')},
    ];
    return `<div style="display:flex;flex-direction:column;gap:var(--space-3)">
      ${fields.map(f=>`
        <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:500">${f.l}</span>
          <span style="font-size:var(--text-sm)">${f.v}</span>
        </div>`).join('')}
    </div>
    <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
      <button class="btn btn-secondary btn-sm" onclick="Companies.openEdit('${c.id}')"><i data-lucide="pencil" style="width:14px;height:14px"></i> Editar</button>
    </div>`;
  },
};
