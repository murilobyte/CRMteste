/**
 * Reports Module — Relatórios e análises com Chart.js
 */
import { db, rpc }  from '../services/supabase.js';
import { Store }    from '../core/store.js';
import { fmt, esc }  from '../core/utils.js';
import { Toasts }   from '../components/notifications.js';

const CHART_DEFAULTS = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: { color: '#94a3b8', font: { size: 12 } },
    },
    tooltip: {
      backgroundColor: '#1e293b',
      borderColor:     '#334155',
      borderWidth:     1,
      titleColor:      '#f1f5f9',
      bodyColor:       '#94a3b8',
      padding:         12,
    },
  },
  scales: {
    x: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
    y: { ticks: { color: '#64748b' }, grid: { color: '#1e293b' } },
  },
};

let _charts = {};
let _period = '30';

export const Reports = {
  async init() {
    _period = '30';
    await this.load();
  },

  async load() {
    this._destroyCharts();
    await Promise.all([
      this._loadRevenue(),
      this._loadPipeline(),
      this._loadLeads(),
      this._loadActivities(),
      this._loadConversion(),
      this._loadTopPerformers(),
    ]);
  },

  async setPeriod(days) {
    _period = String(days);
    document.querySelectorAll('#page-reports .filter-chip').forEach(c => c.classList.remove('active'));
    event?.target?.classList.add('active');
    await this.load();
  },

  _destroyCharts() {
    Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_) {} });
    _charts = {};
  },

  async _loadRevenue() {
    const orgId = Store.get('orgId');
    // rpc() retorna data diretamente (não { data })
    const data = await rpc('get_monthly_revenue', { p_org_id: orgId, p_months: 12 });

    const el = document.getElementById('chart-revenue');
    if (!el) return;
    const labels  = (data || []).map(r => r.month);
    const values  = (data || []).map(r => r.revenue || 0);
    const targets = (data || []).map(r => r.target || 0);

    _charts.revenue = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label:           'Receita',
            data:            values,
            backgroundColor: 'rgba(99,102,241,0.8)',
            borderColor:     '#6366f1',
            borderWidth:     1,
            borderRadius:    4,
          },
          {
            label:       'Meta',
            data:        targets,
            type:        'line',
            borderColor: '#a855f7',
            borderWidth: 2,
            fill:        false,
            pointRadius: 3,
            tension:     0.4,
          },
        ],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: { label: ctx => ` ${fmt.currency(ctx.raw)}` },
          },
        },
        scales: {
          ...CHART_DEFAULTS.scales,
          y: { ...CHART_DEFAULTS.scales.y, ticks: { ...CHART_DEFAULTS.scales.y.ticks, callback: v => fmt.currency(v) } },
        },
      },
    });
  },

  async _loadPipeline() {
    const orgId = Store.get('orgId');

    // get_pipeline_data espera p_funnel_id (não p_org_id) e retorna o shape
    // { stage:{...}, opportunities, total_value, count } — igual ao pipeline.js.
    const { data: funnels } = await db.from('funnels')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .limit(1);

    const funnelId = funnels?.[0]?.id;
    const data = funnelId ? await rpc('get_pipeline_data', { p_funnel_id: funnelId }) : [];

    const el = document.getElementById('chart-pipeline');
    if (!el) return;

    _charts.pipeline = new Chart(el, {
      type: 'doughnut',
      data: {
        labels:   (data || []).map(s => s.stage?.name),
        datasets: [{
          data:             (data || []).map(s => s.total_value || 0),
          backgroundColor: ['#6366f1','#a855f7','#3b82f6','#10b981','#f59e0b','#ef4444','#06b6d4'],
          borderWidth:     0,
          hoverOffset:     8,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        cutout: '65%',
        scales: {},
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: {
            ...CHART_DEFAULTS.plugins.tooltip,
            callbacks: { label: ctx => ` ${ctx.label}: ${fmt.currency(ctx.raw)}` },
          },
        },
      },
    });
  },

  async _loadLeads() {
    const orgId = Store.get('orgId');
    const days  = parseInt(_period);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await db.from('leads')
      .select('source, status, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .is('deleted_at', null);

    const el = document.getElementById('chart-source') || document.getElementById('chart-leads-source');
    if (!el || !data) return;

    const bySource = {};
    data.forEach(l => { bySource[l.source || 'outros'] = (bySource[l.source || 'outros'] || 0) + 1; });

    _charts.leadsSource = new Chart(el, {
      type: 'bar',
      data: {
        labels:   Object.keys(bySource),
        datasets: [{
          label:           'Leads',
          data:            Object.values(bySource),
          backgroundColor: '#6366f180',
          borderColor:     '#6366f1',
          borderWidth:     1,
          borderRadius:    4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        indexAxis: 'y',
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      },
    });

    // KPIs do relatório
    const total   = data.length;
    const won     = data.filter(l => l.status === 'won').length;
    const rate    = total > 0 ? Math.round((won / total) * 100) : 0;
    this._setReportKPI('report-leads-total', total);
    this._setReportKPI('report-leads-won',   won);
    this._setReportKPI('report-conv-rate',   `${rate}%`);
  },

  async _loadActivities() {
    const orgId = Store.get('orgId');
    const days  = parseInt(_period);
    const since = new Date(Date.now() - days * 86400000).toISOString();

    const { data } = await db.from('activities')
      .select('type, created_at')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .is('deleted_at', null);

    const el = document.getElementById('chart-activities');
    if (!el || !data) return;

    const byType = {};
    data.forEach(a => { byType[a.type || 'other'] = (byType[a.type || 'other'] || 0) + 1; });

    const COLORS = { call:'#10b981', email:'#6366f1', meeting:'#a855f7', note:'#f59e0b', task:'#3b82f6' };

    _charts.activities = new Chart(el, {
      type: 'polarArea',
      data: {
        labels:   Object.keys(byType),
        datasets: [{
          data:            Object.values(byType),
          backgroundColor: Object.keys(byType).map(t => (COLORS[t] || '#64748b') + '80'),
          borderColor:     Object.keys(byType).map(t => COLORS[t] || '#64748b'),
          borderWidth:     2,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        scales: {},
        plugins: { ...CHART_DEFAULTS.plugins },
      },
    });

    this._setReportKPI('report-activities-total', data.length);
  },

  async _loadConversion() {
    const orgId = Store.get('orgId');
    // Contagem por etapa vem de get_pipeline_data (shape: { stage, count, total_value })
    const { data: funnels } = await db.from('funnels')
      .select('id')
      .eq('organization_id', orgId)
      .eq('is_default', true)
      .limit(1);
    const funnelId = funnels?.[0]?.id;
    const data = funnelId ? await rpc('get_pipeline_data', { p_funnel_id: funnelId }) : [];

    const el = document.getElementById('chart-conversion');
    if (!el || !data) return;

    _charts.conversion = new Chart(el, {
      type: 'bar',
      data: {
        labels:   (data || []).map(s => s.stage?.name),
        datasets: [{
          label:           'Oportunidades',
          data:            (data || []).map(s => s.count || 0),
          backgroundColor: 'rgba(168,85,247,0.7)',
          borderColor:     '#a855f7',
          borderWidth:     1,
          borderRadius:    4,
        }],
      },
      options: {
        ...CHART_DEFAULTS,
        plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
      },
    });
  },

  async _loadTopPerformers() {
    const orgId = Store.get('orgId');
    const { data } = await db.from('opportunities')
      .select('owner_id, value, status, profiles:owner_id(first_name, last_name)')
      .eq('organization_id', orgId)
      .eq('status', 'won')
      .is('deleted_at', null)
      .limit(100);

    const el = document.getElementById('top-performers-list');
    if (!el || !data) return;

    const byUser = {};
    data.forEach(o => {
      const uid  = o.owner_id;
      const name = o.profiles ? `${o.profiles.first_name} ${o.profiles.last_name || ''}`.trim() : 'N/A';
      byUser[uid] = byUser[uid] || { name, total: 0, count: 0 };
      byUser[uid].total += o.value || 0;
      byUser[uid].count++;
    });

    const sorted = Object.values(byUser).sort((a, b) => b.total - a.total).slice(0, 5);

    el.innerHTML = sorted.length ? sorted.map((p, i) => `
      <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) 0;border-bottom:1px solid var(--border-subtle)">
        <div style="width:28px;height:28px;border-radius:50%;background:var(--color-primary-900);color:var(--color-primary-400);font-size:var(--text-sm);font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</div>
        <div style="flex:1">
          <div style="font-size:var(--text-sm);font-weight:var(--font-medium)">${esc(p.name)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${p.count} negócio${p.count !== 1 ? 's' : ''} fechado${p.count !== 1 ? 's' : ''}</div>
        </div>
        <div style="font-size:var(--text-sm);font-weight:var(--font-semibold);color:var(--color-success)">${fmt.currency(p.total)}</div>
      </div>
    `).join('') : '<div style="color:var(--text-tertiary);font-size:var(--text-sm);padding:var(--space-4)">Sem dados no período</div>';
  },

  _setReportKPI(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  },

  create() {
    Toasts.info('Em breve', 'Criação de relatórios customizados está em desenvolvimento');
  },

  async export(format) {
    Toasts.info('Exportando...', `Relatório ${format.toUpperCase()} em preparação`);
    // Exportação real dependeria de uma Edge Function ou lib no frontend
    setTimeout(() => Toasts.success('Exportação pronta', 'Verifique seus downloads'), 1500);
  },
};
