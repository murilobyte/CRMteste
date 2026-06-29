/**
 * Pipeline Module — Kanban com drag & drop
 */
import { db, rpc } from '../services/supabase.js';
import { Store }   from '../core/store.js';
import { Modal }   from '../components/modal.js';
import { Toasts }  from '../components/notifications.js';
import { fmt, STATUS, esc } from '../core/utils.js';

let _funnels = [];
let _currentFunnel = null;
let _pipeline  = [];
let _draggedId = null;
let _draggedFromStage = null;
let _dragDropBound = false;

export const Pipeline = {
  async init() {
    await this._loadFunnels();
    if (_currentFunnel) await this.loadFunnel(_currentFunnel);
  },

  async _loadFunnels() {
    const orgId = Store.get('orgId');
    const { data } = await db.from('funnels')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('position');

    _funnels = data || [];
    const select = document.getElementById('funnel-select');
    if (!select || !_funnels.length) return;

    select.innerHTML = _funnels.map(f =>
      `<option value="${esc(f.id)}" ${f.is_default?'selected':''}>${esc(f.name)}</option>`
    ).join('');

    _currentFunnel = _funnels.find(f => f.is_default)?.id || _funnels[0]?.id;
    if (_currentFunnel) await this.loadFunnel(_currentFunnel);
  },

  async loadFunnel(funnelId) {
    _currentFunnel = funnelId;
    const board = document.getElementById('pipeline-board');
    board.innerHTML = '<div class="shimmer-loading" style="width:280px;height:400px;border-radius:12px"></div>'.repeat(3);

    const data = await rpc('get_pipeline_data', { p_funnel_id: funnelId });
    _pipeline = data || [];

    // Estatísticas no subtítulo
    const totalValue = _pipeline.reduce((s, stage) => s + (stage.total_value || 0), 0);
    const totalCount = _pipeline.reduce((s, stage) => s + (stage.count || 0), 0);
    const sub = document.getElementById('pipeline-subtitle');
    if (sub) sub.textContent = `${totalCount} oportunidades • ${fmt.currency(totalValue)} em aberto`;

    this._renderBoard();
  },

  _renderBoard() {
    const board = document.getElementById('pipeline-board');
    board.innerHTML = '';

    _pipeline.forEach(({ stage, opportunities }) => {
      const opps = opportunities || [];
      const col  = this._buildColumn(stage, opps);
      board.appendChild(col);
    });

    // Botão para adicionar coluna
    const addBtn = document.createElement('div');
    addBtn.innerHTML = `
      <div style="width:60px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--space-2);cursor:pointer;opacity:0.5;transition:opacity 0.2s;margin-top:16px" onclick="Pipeline.addStage()">
        <div style="width:40px;height:40px;border:2px dashed var(--border-default);border-radius:50%;display:flex;align-items:center;justify-content:center;color:var(--text-tertiary)">
          <i data-lucide="plus" style="width:18px;height:18px"></i>
        </div>
        <span style="font-size:10px;color:var(--text-tertiary);white-space:nowrap">Nova etapa</span>
      </div>`;
    addBtn.addEventListener('mouseenter', () => addBtn.firstElementChild.style.opacity = '1');
    addBtn.addEventListener('mouseleave', () => addBtn.firstElementChild.style.opacity = '0.5');
    board.appendChild(addBtn);

    lucide.createIcons({ nodes: [board] });
    this._initDragDrop();
  },

  _buildColumn(stage, opps) {
    const col = document.createElement('div');
    col.className = 'kanban-column';
    col.dataset.stageId = stage.id;

    const totalVal = opps.reduce((s, o) => s + (o.value || 0), 0);

    col.innerHTML = `
      <div class="kanban-column-header">
        <div>
          <div class="kanban-column-title">
            <div class="kanban-column-dot" style="background:${stage.color||'#6366f1'}"></div>
            ${esc(stage.name)}
          </div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:2px">
            ${opps.length} deal${opps.length!==1?'s':''} • ${fmt.currency(totalVal)}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:4px">
          <span style="font-size:var(--text-xs);color:var(--text-tertiary);background:var(--bg-overlay);padding:2px 8px;border-radius:var(--radius-full)">${stage.probability}%</span>
          <button class="btn btn-ghost btn-xs" onclick="Pipeline.openCreate('${stage.id}')">
            <i data-lucide="plus" style="width:14px;height:14px"></i>
          </button>
        </div>
      </div>
      <div class="kanban-column-cards" data-stage-id="${stage.id}">
        ${opps.map(o => this._buildCard(o)).join('')}
      </div>
    `;

    return col;
  },

  _buildCard(opp) {
    const daysLeft = opp.expected_close_date
      ? Math.ceil((new Date(opp.expected_close_date) - new Date()) / 86400000)
      : null;

    return `
      <div class="kanban-card" draggable="true"
           data-id="${opp.id}"
           onclick="Pipeline.openDetail('${opp.id}')">
        <div class="kanban-card-title">${esc(opp.title)}</div>
        ${opp.value ? `<div class="kanban-card-value">${fmt.currency(opp.value)}</div>` : ''}
        <div class="kanban-card-meta">
          <div style="display:flex;align-items:center;gap:var(--space-2)">
            ${daysLeft !== null ? `
              <span style="font-size:var(--text-xs);color:${daysLeft<0?'var(--color-danger)':daysLeft<7?'var(--color-warning)':'var(--text-tertiary)'}">
                <i data-lucide="clock" style="width:12px;height:12px"></i>
                ${daysLeft < 0 ? `${Math.abs(daysLeft)}d atrasado` : `${daysLeft}d restantes`}
              </span>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:4px">
            ${opp.probability ? `
              <div style="width:40px;height:4px;background:var(--bg-overlay);border-radius:4px;overflow:hidden">
                <div style="width:${opp.probability}%;height:100%;background:var(--color-primary-500)"></div>
              </div>` : ''}
            <span style="font-size:10px;color:var(--text-tertiary)">${opp.probability||0}%</span>
          </div>
        </div>
      </div>`;
  },

  _initDragDrop() {
    const board = document.getElementById('pipeline-board');
    if (!board) return;

    // Os listeners são delegados no elemento #pipeline-board, que persiste entre
    // renders (apenas o innerHTML é trocado). Anexá-los a cada render acumularia
    // handlers e dispararia updates duplicados — então só vinculamos uma vez.
    if (_dragDropBound) return;
    _dragDropBound = true;

    board.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.kanban-card');
      if (!card) return;
      _draggedId = card.dataset.id;
      _draggedFromStage = card.closest('.kanban-column-cards')?.dataset.stageId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    board.addEventListener('dragend', (e) => {
      const card = e.target.closest('.kanban-card');
      card?.classList.remove('dragging');
      document.querySelectorAll('.kanban-column-cards').forEach(c => c.classList.remove('drag-target'));
    });

    board.addEventListener('dragover', (e) => {
      e.preventDefault();
      const col = e.target.closest('.kanban-column-cards');
      if (col) {
        document.querySelectorAll('.kanban-column-cards').forEach(c => c.classList.remove('drag-target'));
        col.classList.add('drag-target');
      }
    });

    board.addEventListener('drop', async (e) => {
      e.preventDefault();
      const col = e.target.closest('.kanban-column-cards');
      if (!col || !_draggedId) return;

      const newStageId = col.dataset.stageId;
      if (newStageId === _draggedFromStage) return;

      col.classList.remove('drag-target');

      // Move card no DOM imediatamente
      const card = board.querySelector(`[data-id="${_draggedId}"]`);
      if (card) col.appendChild(card);

      // Persiste no banco
      const { error } = await db.from('opportunities')
        .update({ stage_id: newStageId })
        .eq('id', _draggedId);

      if (error) {
        Toasts.error('Erro', 'Falha ao mover oportunidade');
        await this.loadFunnel(_currentFunnel);
      } else {
        Toasts.success('Pipeline', 'Oportunidade movida com sucesso');
      }

      _draggedId = null;
      _draggedFromStage = null;
    });
  },

  async openCreate(stageId = null) {
    const orgId = Store.get('orgId');

    // Busca contatos e empresas para o select
    const [{ data: contacts }, { data: companies }] = await Promise.all([
      db.from('contacts').select('id,first_name,last_name').eq('organization_id', orgId).limit(100),
      db.from('companies').select('id,name').eq('organization_id', orgId).limit(100),
    ]);

    // Stages disponíveis
    const stages = _pipeline.map(p => p.stage).filter(s => s.type === 'open');

    Modal.open({
      title: 'Nova Oportunidade',
      size: 'lg',
      body: `
        <div class="detail-form-grid">
          <div class="input-group full-width">
            <label class="input-label required">Título</label>
            <input type="text" class="input" id="op-title" placeholder="Ex: Proposta para...">
          </div>
          <div class="input-group">
            <label class="input-label">Etapa</label>
            <select class="input" id="op-stage">
              ${stages.map(s => `<option value="${esc(s.id)}" ${s.id===stageId?'selected':''}>${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Valor</label>
            <input type="number" class="input" id="op-value" placeholder="0,00" step="0.01">
          </div>
          <div class="input-group">
            <label class="input-label">Contato</label>
            <select class="input" id="op-contact">
              <option value="">Selecionar...</option>
              ${(contacts||[]).map(c => `<option value="${esc(c.id)}">${esc(c.first_name)} ${esc(c.last_name||'')}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Empresa</label>
            <select class="input" id="op-company">
              <option value="">Selecionar...</option>
              ${(companies||[]).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label class="input-label">Probabilidade (%)</label>
            <input type="number" class="input" id="op-prob" min="0" max="100" value="25">
          </div>
          <div class="input-group">
            <label class="input-label">Fechamento previsto</label>
            <input type="date" class="input" id="op-close">
          </div>
          <div class="input-group full-width">
            <label class="input-label">Descrição</label>
            <textarea class="input" id="op-desc" rows="2" placeholder="Detalhes da oportunidade..."></textarea>
          </div>
        </div>`,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
        <button class="btn btn-primary" onclick="Pipeline.saveOpportunity()">
          <i data-lucide="save" style="width:16px;height:16px"></i>
          <span class="btn-text">Salvar</span>
        </button>`,
    });
  },

  async saveOpportunity() {
    const orgId  = Store.get('orgId');
    const userId = Store.get('user')?.id;
    const funnelId = _currentFunnel;

    const payload = {
      organization_id:     orgId,
      funnel_id:           funnelId,
      stage_id:            document.getElementById('op-stage').value,
      owner_id:            userId,
      title:               document.getElementById('op-title').value.trim(),
      value:               parseFloat(document.getElementById('op-value').value) || null,
      contact_id:          document.getElementById('op-contact').value || null,
      company_id:          document.getElementById('op-company').value || null,
      probability:         parseInt(document.getElementById('op-prob').value) || 0,
      expected_close_date: document.getElementById('op-close').value || null,
      description:         document.getElementById('op-desc').value.trim() || null,
    };

    if (!payload.title) { Toasts.error('Erro', 'O título é obrigatório'); return; }

    const { error } = await db.from('opportunities').insert(payload);
    if (error) { Toasts.error('Erro', error.message); return; }

    Modal.close();
    Toasts.success('Oportunidade criada', `"${payload.title}" adicionada ao pipeline`);
    await this.loadFunnel(funnelId);
  },

  async openDetail(id) {
    const { data: opp } = await db
      .from('opportunities')
      .select('*, pipeline_stages(*), contacts(*), companies(*), profiles:owner_id(*)')
      .eq('id', id)
      .single();

    if (!opp) return;

    const panel = document.getElementById('detail-panel');
    document.getElementById('detail-title').textContent    = opp.title;
    document.getElementById('detail-subtitle').textContent = opp.pipeline_stages?.name || '';

    document.getElementById('detail-tabs').innerHTML = `
      <div class="tab active" onclick="Pipeline._detailTab('info',this)">Detalhes</div>
      <div class="tab" onclick="Pipeline._detailTab('timeline',this)">Timeline</div>
    `;

    document.getElementById('detail-body').innerHTML = `
      <div id="detail-tab-info" style="padding:var(--space-4)">
        ${this._buildOppInfo(opp)}
      </div>
      <div id="detail-tab-timeline" style="padding:var(--space-4);display:none">
        <div id="opp-timeline-content"><div class="shimmer-loading" style="height:200px"></div></div>
      </div>
    `;

    panel.classList.add('open');
    lucide.createIcons({ nodes: [panel] });
  },

  _buildOppInfo(opp) {
    return `
      <div style="display:flex;flex-direction:column;gap:var(--space-3)">
        ${[
          { label:'Etapa',       value: esc(opp.pipeline_stages?.name || '—') },
          { label:'Valor',       value: opp.value ? fmt.currency(opp.value) : '—' },
          { label:'Probabilidade',value: `${opp.probability || 0}%` },
          { label:'Fechamento',  value: fmt.date(opp.expected_close_date) },
          { label:'Status',      value: esc(opp.status) },
          { label:'Responsável', value: opp.profiles ? `${esc(opp.profiles.first_name)} ${esc(opp.profiles.last_name||'')}` : '—' },
        ].map(f => `
          <div style="display:flex;justify-content:space-between;padding:var(--space-2) 0;border-bottom:1px solid var(--border-subtle)">
            <span style="font-size:var(--text-xs);color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.05em;font-weight:500">${f.label}</span>
            <span style="font-size:var(--text-sm)">${f.value}</span>
          </div>`).join('')}
      </div>
      ${opp.description ? `<p style="margin-top:var(--space-4);font-size:var(--text-sm);color:var(--text-secondary)">${esc(opp.description)}</p>` : ''}
      <div style="margin-top:var(--space-4);display:flex;gap:var(--space-2)">
        <button class="btn btn-success btn-sm" onclick="Pipeline.markWon('${opp.id}')">
          <i data-lucide="check-circle" style="width:14px;height:14px"></i> Marcar como Ganho
        </button>
        <button class="btn btn-danger btn-sm" onclick="Pipeline.markLost('${opp.id}')">
          <i data-lucide="x-circle" style="width:14px;height:14px"></i> Marcar como Perdido
        </button>
      </div>`;
  },

  _detailTab(tab, el) {
    document.querySelectorAll('#detail-tabs .tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('[id^="detail-tab-"]').forEach(d => d.style.display = 'none');
    document.getElementById(`detail-tab-${tab}`).style.display = 'block';
  },

  async markWon(id) {
    await db.from('opportunities').update({
      status: 'won',
      actual_close_date: new Date().toISOString().split('T')[0],
    }).eq('id', id);
    Toasts.success('Pipeline', '🎉 Oportunidade marcada como GANHA!');
    document.getElementById('detail-panel').classList.remove('open');
    await this.loadFunnel(_currentFunnel);
  },

  async markLost(id) {
    await db.from('opportunities').update({ status: 'lost' }).eq('id', id);
    Toasts.info('Pipeline', 'Oportunidade marcada como perdida');
    document.getElementById('detail-panel').classList.remove('open');
    await this.loadFunnel(_currentFunnel);
  },

  async addStage() {
    Toasts.info('Em breve', 'Gerenciamento de etapas via interface em desenvolvimento');
  },

  async manageStages() {
    Toasts.info('Em breve', 'Editor de etapas estará disponível na próxima versão');
  },
};
