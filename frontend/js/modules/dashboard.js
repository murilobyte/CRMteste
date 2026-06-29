/**
 * Dashboard Module — KPIs, gráficos e widgets personalizáveis
 */
import { db, rpc } from '../services/supabase.js';
import { Store }   from '../core/store.js';
import { fmt, esc } from '../core/utils.js';
import { Toasts }  from '../components/notifications.js';

let _charts = {};

export const Dashboard = {
  async init() {
    this._setGreeting();
    await this._loadKPIs();
    await Promise.all([
      this._loadCharts(),
      this._loadTasks(),
      this._loadActivities(),
      this._loadHotLeads(),
    ]);
  },

  _setGreeting() {
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    const name  = Store.get('profile')?.first_name || 'usuário';
    document.getElementById('dashboard-greeting').textContent = `${greet}, ${name}! 👋`;

    const now   = new Date();
    const date  = now.toLocaleDateString('pt-BR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    document.getElementById('dashboard-date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
  },

  async _loadKPIs() {
    const orgId = Store.get('orgId');
    const kpis  = await rpc('get_dashboard_kpis', { p_org_id: orgId });

    const grid = document.getElementById('kpi-grid');
    if (!kpis) { grid.innerHTML = '<p style="color:var(--color-danger);padding:var(--space-4)">Erro ao carregar KPIs</p>'; return; }

    Store.set('kpis', kpis);

    grid.innerHTML = `
      <div class="stat-card animate-slide-up">
        <div class="stat-header">
          <div>
            <div class="stat-label">Leads Totais</div>
            <div class="stat-value">${fmt.number(kpis.leads_total)}</div>
          </div>
          <div class="stat-icon stat-icon-primary"><i data-lucide="users"></i></div>
        </div>
        <div class="stat-trend up">
          <i data-lucide="trending-up" style="width:12px;height:12px"></i>
          +${kpis.leads_new} novos (30d)
        </div>
      </div>

      <div class="stat-card animate-slide-up" style="animation-delay:.05s">
        <div class="stat-header">
          <div>
            <div class="stat-label">Pipeline Aberto</div>
            <div class="stat-value">${fmt.currency(kpis.revenue_open)}</div>
          </div>
          <div class="stat-icon stat-icon-warning"><i data-lucide="git-merge"></i></div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${fmt.number(kpis.opportunities_open)} oportunidades abertas</div>
      </div>

      <div class="stat-card animate-slide-up" style="animation-delay:.1s">
        <div class="stat-header">
          <div>
            <div class="stat-label">Receita (Mês)</div>
            <div class="stat-value">${fmt.currency(kpis.revenue_won)}</div>
          </div>
          <div class="stat-icon stat-icon-success"><i data-lucide="trending-up"></i></div>
        </div>
        <div class="stat-trend up">
          <i data-lucide="check-circle" style="width:12px;height:12px"></i>
          ${kpis.conversion_rate}% taxa de conversão
        </div>
      </div>

      <div class="stat-card animate-slide-up" style="animation-delay:.15s">
        <div class="stat-header">
          <div>
            <div class="stat-label">Tarefas Vencidas</div>
            <div class="stat-value">${fmt.number(kpis.tasks_overdue)}</div>
          </div>
          <div class="stat-icon stat-icon-danger"><i data-lucide="clock"></i></div>
        </div>
        <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${kpis.tasks_today} tarefas para hoje</div>
      </div>
    `;
    lucide.createIcons({ nodes: [grid] });
  },

  async _loadCharts() {
    const orgId = Store.get('orgId');

    // Receita mensal
    const monthlyData = await rpc('get_monthly_revenue', { p_org_id: orgId, p_months: 6 });
    this._renderRevenueChart(monthlyData || []);

    // Pipeline por etapa
    const { data: funnels } = await db.from('funnels').select('id').eq('organization_id', orgId).eq('is_default', true).limit(1);
    if (funnels?.[0]) {
      const pipelineData = await rpc('get_pipeline_data', { p_funnel_id: funnels[0].id });
      this._renderFunnelChart(pipelineData || []);
    }
  },

  _renderRevenueChart(data) {
    const ctx = document.getElementById('chart-revenue');
    if (!ctx) return;
    if (_charts.revenue) _charts.revenue.destroy();

    const months   = data.map(d => {
      const [year, month] = d.month.split('-');
      return new Date(year, month-1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });
    });
    const revenues = data.map(d => d.revenue || 0);

    _charts.revenue = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [{
          label: 'Receita',
          data: revenues,
          backgroundColor: 'rgba(99,102,241,0.6)',
          borderColor: 'rgba(99,102,241,1)',
          borderWidth: 1,
          borderRadius: 6,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => fmt.currency(ctx.raw),
            },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b' } },
          y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', callback: v => fmt.currency(v) } },
        },
      },
    });
  },

  _renderFunnelChart(data) {
    const ctx = document.getElementById('chart-funnel');
    if (!ctx || !data.length) return;
    if (_charts.funnel) _charts.funnel.destroy();

    const stages = data.filter(d => d.stage.type === 'open');
    const labels = stages.map(d => d.stage.name);
    const counts = stages.map(d => d.count);
    const colors = stages.map(d => d.stage.color || '#6366f1');

    _charts.funnel = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: counts, backgroundColor: colors.map(c => c + 'cc'), borderColor: colors, borderWidth: 2 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 12 } } },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.label}: ${ctx.raw} deal${ctx.raw !== 1 ? 's' : ''}` },
          },
        },
      },
    });
  },

  async _loadTasks() {
    const orgId = Store.get('orgId');
    const today = new Date().toISOString().split('T')[0];

    const { data: tasks } = await db
      .from('tasks')
      .select('*, profiles:assigned_to(first_name,last_name)')
      .eq('organization_id', orgId)
      .neq('status', 'done')
      .lte('due_date', today + 'T23:59:59')
      .order('priority', { ascending: false })
      .limit(8);

    const container = document.getElementById('dashboard-tasks');
    if (!container) return;

    if (!tasks?.length) {
      container.innerHTML = `<div class="empty-state" style="padding:var(--space-6)">
        <div class="empty-state-icon"><i data-lucide="check-circle"></i></div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary)">Sem tarefas para hoje</p>
      </div>`;
      lucide.createIcons({ nodes: [container] });
      return;
    }

    const priorityColors = { urgent:'#ef4444', high:'#f97316', medium:'#f59e0b', low:'#64748b' };

    container.innerHTML = tasks.map(t => `
      <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--border-subtle);cursor:pointer" onclick="Tasks.openDetail('${t.id}')">
        <div style="width:12px;height:12px;border-radius:50%;background:${priorityColors[t.priority]};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text-primary)">${esc(t.title)}</div>
          <div style="font-size:var(--text-xs);color:${new Date(t.due_date) < new Date() ? 'var(--color-danger)' : 'var(--text-tertiary)'}">
            ${fmt.datetime(t.due_date)}
          </div>
        </div>
        <input type="checkbox" onclick="event.stopPropagation();Tasks.complete('${t.id}',this)" ${t.status==='done'?'checked':''} style="accent-color:var(--color-primary-500)">
      </div>
    `).join('');
  },

  async _loadActivities() {
    const orgId = Store.get('orgId');
    const { data: activities } = await db
      .from('activities')
      .select('*, profiles:performed_by(first_name,last_name,avatar_url)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(6);

    const container = document.getElementById('dashboard-activities');
    if (!container) return;

    const typeIcons = {
      call:'phone', email:'mail', meeting:'calendar', note:'sticky-note',
      stage_change:'git-merge', task:'check-square', whatsapp:'message-circle',
    };

    container.innerHTML = (activities || []).map(a => `
      <div style="display:flex;gap:var(--space-3);padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--border-subtle)">
        <div class="timeline-icon ${a.type}" style="position:static;width:28px;height:28px">
          <i data-lucide="${typeIcons[a.type]||'activity'}" style="width:12px;height:12px"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);color:var(--text-primary)">${esc(a.title)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${fmt.relativeTime(a.created_at)}</div>
        </div>
      </div>
    `).join('');
    lucide.createIcons({ nodes: [container] });
  },

  async _loadHotLeads() {
    const orgId = Store.get('orgId');
    const { data: leads } = await db
      .from('leads')
      .select('*, contacts(first_name,last_name,avatar_url), companies(name)')
      .eq('organization_id', orgId)
      .eq('temperature', 'hot')
      .is('deleted_at', null)
      .order('score', { ascending: false })
      .limit(5);

    const container = document.getElementById('dashboard-hot-leads');
    if (!container) return;

    if (!leads?.length) {
      container.innerHTML = `<div class="empty-state" style="padding:var(--space-6)">
        <div class="empty-state-icon"><i data-lucide="flame"></i></div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary)">Nenhum lead quente no momento</p>
      </div>`;
      lucide.createIcons({ nodes: [container] });
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>Lead</th><th>Contato</th><th>Empresa</th><th>Score</th>
          <th>Valor</th><th>Criado em</th>
        </tr></thead>
        <tbody>${leads.map(l => {
          const name = l.contacts ? `${l.contacts.first_name} ${l.contacts.last_name||''}`.trim() : '—';
          return `<tr style="cursor:pointer" onclick="Leads.openDetail('${l.id}')">
            <td><span style="font-weight:var(--font-medium)">${esc(l.title)}</span></td>
            <td>${esc(name)}</td>
            <td>${esc(l.companies?.name||'—')}</td>
            <td>
              <div class="score">
                <div class="score-bar"><div class="score-fill" style="width:${l.score}%;background:${fmt.scoreColor(l.score)}"></div></div>
                <span class="score-value">${l.score}</span>
              </div>
            </td>
            <td>${l.value ? fmt.currency(l.value) : '—'}</td>
            <td>${fmt.date(l.created_at)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>`;
  },

  async refresh() {
    // Destrói gráficos
    Object.values(_charts).forEach(c => c?.destroy());
    _charts = {};
    await this.init();
    Toasts.success('Dashboard', 'Dados atualizados com sucesso');
  },

  customize() {
    Toasts.info('Em breve', 'Dashboard personalizável estará disponível na próxima versão');
  },

  exportChart(name) {
    const chart = _charts[name];
    if (!chart) return;
    const a = document.createElement('a');
    a.href     = chart.toBase64Image();
    a.download = `crm-chart-${name}-${new Date().toISOString().split('T')[0]}.png`;
    a.click();
  },
};
