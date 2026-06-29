/**
 * CRM Pro — Application Bootstrap
 * Ponto de entrada da SPA. Importa todos os módulos, inicializa serviços,
 * configura rotas e expõe globals necessários para os onclick do app.html.
 */

// ─── Services ────────────────────────────────────────────────────────────────
import { db }              from '../services/supabase.js';
import { AuthService }     from '../services/auth.js';
import { RealtimeService } from '../services/realtime.js';

// ─── Core ─────────────────────────────────────────────────────────────────────
import { Store }    from './store.js';
import { Router }   from './router.js';
import { bus }      from './events.js';
import { fmt, esc, safeUrl } from './utils.js';

// ─── Components ───────────────────────────────────────────────────────────────
import { Modal }         from '../components/modal.js';
import { Toasts, Notifications } from '../components/notifications.js';

// ─── Modules ─────────────────────────────────────────────────────────────────
import { Dashboard }     from '../modules/dashboard.js';
import { Leads }         from '../modules/leads.js';
import { Pipeline }      from '../modules/pipeline.js';
import { Contacts }      from '../modules/contacts.js';
import { Companies }     from '../modules/companies.js';
import { Tasks }         from '../modules/tasks.js';
import { Activities }    from '../modules/activities.js';
import { CalendarModule }from '../modules/calendar.js';
import { Reports }       from '../modules/reports.js';
import { Automations }   from '../modules/automations.js';
import { Integrations }  from '../modules/integrations.js';
import { Settings }      from '../modules/settings.js';
import { AI }            from '../modules/ai.js';

// ─── Global CRM Controller ────────────────────────────────────────────────────
const CRM = {
  navigate(path) {
    Router.navigate(path);
    this.closeMobileMenu();
    this._closeAllDropdowns();
  },

  toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const main    = document.getElementById('main-area');
    if (!sidebar) return;

    if (window.innerWidth <= 1024) {
      const nowOpen = sidebar.classList.toggle('mobile-open');
      const overlay = document.getElementById('mobile-overlay');
      if (overlay) overlay.style.display = nowOpen ? 'block' : 'none';
    } else {
      const collapsed = sidebar.classList.toggle('collapsed');
      if (main) main.classList.toggle('sidebar-collapsed', collapsed);
      localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
    }
  },

  closeMobileMenu() {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    const overlay = document.getElementById('mobile-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  openSearch() {
    const panel = document.getElementById('global-search-panel');
    if (panel) {
      panel.classList.add('open');
      setTimeout(() => document.getElementById('global-search-input')?.focus(), 50);
    }
  },

  closeSearch() {
    const panel = document.getElementById('global-search-panel');
    if (panel) panel.classList.remove('open');
    const inp = document.getElementById('global-search-input');
    if (inp) inp.value = '';
    const results = document.getElementById('search-results');
    if (results) results.innerHTML = '';
  },

  async performSearch(query) {
    if (!query || query.trim().length < 2) return;
    const results = document.getElementById('search-results');
    if (!results) return;

    results.innerHTML = `<div style="padding:var(--space-4);text-align:center;color:var(--text-tertiary)"><div class="spinner"></div></div>`;

    const orgId = Store.get('orgId');
    const { data } = await db.rpc('global_search', { p_org_id: orgId, p_query: query.trim(), p_limit: 10 });

    if (!data?.length) {
      results.innerHTML = `<div style="padding:var(--space-6);text-align:center;color:var(--text-tertiary)">Nenhum resultado para "${esc(query)}"</div>`;
      return;
    }

    const ICONS = { lead:'users', contact:'user', company:'building-2', opportunity:'trending-up' };
    const LABELS = { lead:'Lead', contact:'Contato', company:'Empresa', opportunity:'Oportunidade' };

    results.innerHTML = data.map(r => `
      <div class="search-result-item" onclick="CRM._openSearchResult('${esc(r.entity_type)}','${esc(r.id)}')"
           style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3) var(--space-4);cursor:pointer;border-radius:var(--radius-md)"
           onmouseenter="this.style.background='var(--bg-hover)'"
           onmouseleave="this.style.background=''">
        <div style="width:32px;height:32px;border-radius:var(--radius-md);background:var(--color-primary-900);display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <i data-lucide="${ICONS[r.entity_type]||'file'}" style="width:14px;height:14px;color:var(--color-primary-400)"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:var(--text-sm);font-weight:var(--font-medium);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.title)}</div>
          <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(LABELS[r.entity_type]||r.entity_type)} · ${esc(r.subtitle||'')}</div>
        </div>
      </div>`).join('');

    lucide.createIcons({ nodes: [results] });
  },

  _openSearchResult(type, id) {
    this.closeSearch();
    const routeMap = { lead:'/leads', contact:'/contacts', company:'/companies', opportunity:'/pipeline' };
    Router.navigate(routeMap[type] || '/dashboard');

    setTimeout(() => {
      if      (type === 'lead')        Leads.openDetail(id);
      else if (type === 'contact')     Contacts.openDetail(id);
      else if (type === 'company')     Companies.openDetail(id);
    }, 300);
  },

  closeDetail() {
    document.getElementById('detail-panel')?.classList.remove('open');
  },

  toggleNotifications() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const wasOpen = panel.classList.contains('open');
    this._closeAllDropdowns();
    if (!wasOpen) {
      panel.classList.add('open');
      Notifications.load();
    }
  },

  toggleNewMenu() {
    const menu = document.getElementById('new-menu');
    if (!menu) return;
    const wasOpen = menu.classList.contains('show');
    this._closeAllDropdowns();
    if (!wasOpen) menu.classList.add('show');
  },

  toggleUserMenu() {
    const menu = document.getElementById('user-menu');
    if (!menu) return;
    const wasOpen = menu.classList.contains('show');
    this._closeAllDropdowns();
    if (!wasOpen) menu.classList.add('show');
  },

  toggleMobileMenu() {
    this.toggleSidebar();
  },

  _closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.show, .notif-panel.open').forEach(el => {
      el.classList.remove('show', 'open');
    });
  },

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next    = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('crm-theme', next);
    const btn = document.getElementById('theme-btn');
    if (btn) {
      btn.innerHTML = `<i data-lucide="${next === 'dark' ? 'moon' : 'sun'}" style="width:18px;height:18px"></i>`;
      lucide.createIcons({ nodes: [btn] });
    }
  },

  async signOut() {
    Modal.confirm({
      title:       'Sair do sistema',
      message:     'Tem certeza que deseja encerrar a sessão?',
      confirmText: 'Sair',
      dangerous:   false,
      onConfirm:   async () => {
        RealtimeService.unsubscribeAll();
        await AuthService.signOut();
        window.location.href = './index.html';
      },
    });
  },

  showNewItemMenu() {
    this.toggleNewMenu();
  },
};

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  // 1. Verifica sessão
  const session = await AuthService.getSession();
  if (!session) {
    window.location.replace('./index.html');
    return;
  }

  // 2. Carrega perfil e org
  const user    = session.user;
  const profile = await AuthService.loadProfile();

  if (!profile) {
    // Perfil ainda não criado (trigger pode estar atrasado), aguarda e tenta novamente
    await new Promise(r => setTimeout(r, 1500));
    const retried = await AuthService.loadProfile();
    if (!retried) {
      document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;font-family:system-ui">
        <div style="text-align:center">
          <p>Finalizando configuração da conta...</p>
          <p style="font-size:14px;margin-top:8px">Atualize a página em alguns segundos.</p>
          <button onclick="location.reload()" style="margin-top:16px;padding:8px 16px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer">Atualizar</button>
        </div>
      </div>`;
      return;
    }
  }

  const finalProfile = await AuthService.loadProfile();
  const orgId        = finalProfile?.organization_id;

  let org = null;
  if (orgId) {
    const { data } = await db.from('organizations').select('*').eq('id', orgId).single();
    org = data;
  }

  // 3. Inicializa Store
  Store.init({ user, profile: finalProfile, org, orgId });

  // 4. Aplica tema salvo
  const savedTheme = localStorage.getItem('crm-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // 5. Popula header
  _populateHeader(user, finalProfile, org);

  // 6. Sidebar collapsed state
  const wasCollapsed = localStorage.getItem('sidebar-collapsed') === '1';
  if (wasCollapsed) {
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.getElementById('main-area')?.classList.add('sidebar-collapsed');
  }

  // 7. Registra rotas
  _registerRoutes();

  // 8. Configura realtime
  _setupRealtime(orgId, user.id);

  // 9. Revela o app e esconde o loader
  const loader = document.getElementById('page-loader');
  const app    = document.getElementById('app');
  if (loader) { loader.classList.add('fade-out'); setTimeout(() => loader.remove(), 400); }
  if (app)    app.style.display = '';

  // 10. Fecha dropdowns ao clicar fora
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-dropdown], .dropdown-menu, .notifications-panel, #new-item-btn, #user-menu-btn, #notif-btn')) {
      CRM._closeAllDropdowns();
    }
  });

  // 11. Fecha search overlay com ESC
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      CRM.closeSearch();
      CRM.closeDetail();
      CRM._closeAllDropdowns();
      Modal.close();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      CRM.openSearch();
    }
  });

  // 12. AI input auto-resize (HTML já tem oninput, mas também configura Enter)
  const aiInput = document.getElementById('ai-input');
  if (aiInput) {
    aiInput.addEventListener('input', () => {
      aiInput.style.height = 'auto';
      aiInput.style.height = Math.min(aiInput.scrollHeight, 120) + 'px';
    });
    aiInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); AI.send(); }
    });
  }

  // 13. Inicializa ícones Lucide
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 14. Inicializa notificações
  await Notifications.load();

  // 15. Atualiza last_seen
  AuthService.updateLastSeen();

  // 16. Verifica se precisa de seed demo
  await _maybeSeedDemo(orgId, user.id);

  // 17. Inicia roteamento (renderiza página inicial baseada no hash)
  Router.init();

  // 18. Atualiza last_seen periodicamente
  setInterval(() => AuthService.updateLastSeen(), 5 * 60 * 1000);

  // 19. Registra service worker PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function _populateHeader(user, profile, org) {
  const name    = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || user.email : user.email;
  const email   = user.email;
  const avatar  = profile?.avatar_url;
  const initial = (profile?.first_name || email || 'U').charAt(0).toUpperCase();
  const orgName = org?.name || 'CRM Pro';

  const safeAvatar = safeUrl(avatar);
  const avatarHTML = safeAvatar
    ? `<img src="${safeAvatar}" alt="${esc(name)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">`
    : `<span style="font-size:var(--text-sm);font-weight:700">${esc(initial)}</span>`;

  // Sidebar logo org name
  const orgLogoEl = document.getElementById('org-name');
  if (orgLogoEl) orgLogoEl.textContent = orgName;

  // Sidebar user section
  const sidebarAvEl    = document.getElementById('sidebar-avatar');
  const sidebarNameEl  = document.getElementById('sidebar-user-name');
  const sidebarRoleEl  = document.getElementById('sidebar-user-role');
  if (sidebarAvEl)   sidebarAvEl.innerHTML  = avatarHTML;
  if (sidebarNameEl) sidebarNameEl.textContent = name;
  if (sidebarRoleEl) sidebarRoleEl.textContent = profile?.role || profile?.job_title || 'Membro';

  // Header avatar
  const headerAvEl = document.getElementById('header-avatar');
  if (headerAvEl) headerAvEl.innerHTML = avatarHTML;

  // User dropdown
  const menuNameEl  = document.getElementById('menu-user-name');
  const menuEmailEl = document.getElementById('menu-user-email');
  if (menuNameEl)  menuNameEl.textContent  = name;
  if (menuEmailEl) menuEmailEl.textContent = email;
}

function _registerRoutes() {
  const routes = [
    { path: '/dashboard',    pageId: 'dashboard',    title: 'Dashboard',      onEnter: () => Dashboard.init()     },
    { path: '/leads',        pageId: 'leads',        title: 'Leads',          onEnter: () => Leads.init()         },
    { path: '/pipeline',     pageId: 'pipeline',     title: 'Pipeline',       onEnter: () => Pipeline.init()      },
    { path: '/contacts',     pageId: 'contacts',     title: 'Contatos',       onEnter: () => Contacts.init()      },
    { path: '/companies',    pageId: 'companies',    title: 'Empresas',       onEnter: () => Companies.init()     },
    { path: '/tasks',        pageId: 'tasks',        title: 'Tarefas',        onEnter: () => Tasks.init()         },
    { path: '/activities',   pageId: 'activities',   title: 'Atividades',     onEnter: () => Activities.init()    },
    { path: '/calendar',     pageId: 'calendar',     title: 'Calendário',     onEnter: () => CalendarModule.init()},
    { path: '/reports',      pageId: 'reports',      title: 'Relatórios',     onEnter: () => Reports.init()       },
    { path: '/automations',  pageId: 'automations',  title: 'Automações',     onEnter: () => Automations.init()   },
    { path: '/integrations', pageId: 'integrations', title: 'Integrações',    onEnter: () => Integrations.init()  },
    { path: '/settings',     pageId: 'settings',     title: 'Configurações',  onEnter: () => Settings.init()      },
  ];
  routes.forEach(r => Router.register(r.path, { pageId: r.pageId, title: r.title, onEnter: r.onEnter }));
}

function _setupRealtime(orgId, userId) {
  // Notificações em tempo real
  RealtimeService.subscribeNotifications(userId, (payload) => {
    if (payload.eventType === 'INSERT') {
      Notifications.pushNew(payload.new);
      _updateNotifBadge(1);
    }
  });

  // Leads em tempo real
  RealtimeService.subscribe('leads', orgId, (payload) => {
    bus.emit('leads:changed', payload);
    if (payload.eventType === 'INSERT') _updateBadge('badge-leads', 1);
  });

  // Tasks em tempo real
  RealtimeService.subscribe('tasks', orgId, (payload) => {
    bus.emit('tasks:changed', payload);
  });

  // Oportunidades em tempo real
  RealtimeService.subscribe('opportunities', orgId, (payload) => {
    bus.emit('pipeline:changed', payload);
  });

  // Atividades em tempo real
  RealtimeService.subscribe('activities', orgId, (payload) => {
    bus.emit('activities:changed', payload);
  });

  // Recarrega módulo ativo ao receber evento
  bus.on('leads:changed',     () => { if (Router._current === '/leads')       Leads.load(); });
  bus.on('tasks:changed',     () => { if (Router._current === '/tasks')       Tasks.load(); });
  bus.on('pipeline:changed',  () => { if (Router._current === '/pipeline')    Pipeline.init(); });
  bus.on('activities:changed',() => { if (Router._current === '/activities')  Activities.load(); });
}

function _updateNotifBadge(delta) {
  const dot = document.getElementById('notif-dot');
  if (dot && delta > 0) dot.style.display = 'block';
}

function _updateBadge(id, delta) {
  const badge = document.getElementById(id);
  if (!badge) return;
  const n = parseInt(badge.textContent || '0') + delta;
  badge.textContent   = n;
  badge.style.display = n > 0 ? 'flex' : 'none';
}

async function _maybeSeedDemo(orgId, userId) {
  // Checa se já há dados
  const { count } = await db.from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId);

  if (count && count > 0) return;

  // Pede confirmação para seed
  const wantsSeed = localStorage.getItem('crm-seeded') === '1';
  if (wantsSeed) return;

  try {
    await db.rpc('seed_demo_data', { p_org_id: orgId, p_user_id: userId });
    localStorage.setItem('crm-seeded', '1');
    Toasts.success('Bem-vindo ao CRM Pro!', 'Dados de demonstração foram carregados.');
  } catch(_) {
    // seed é opcional — não bloqueia
  }
}

// ─── Auth state listener (sessão expirada) ────────────────────────────────────
AuthService.onAuthChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
    if (event === 'SIGNED_OUT') window.location.replace('./index.html');
  }
});

// ─── Expose globals para onclick handlers no app.html ────────────────────────
window.CRM           = CRM;
window.Modal         = Modal;
window.Toasts        = Toasts;
window.Notifications = Notifications;
window.Dashboard     = Dashboard;
window.Leads         = Leads;
window.Pipeline      = Pipeline;
window.Contacts      = Contacts;
window.Companies     = Companies;
window.Tasks         = Tasks;
window.Activities    = Activities;
window.CalendarModule= CalendarModule;
window.Reports       = Reports;
window.Automations   = Automations;
window.Integrations  = Integrations;
window.Settings      = Settings;
window.AI            = AI;
window.fmt           = fmt;
window.Store         = Store;
window.Router        = Router;

// ─── Start ────────────────────────────────────────────────────────────────────
boot().catch(err => {
  console.error('[CRM] Boot error:', err);
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;color:#94a3b8;font-family:system-ui">
    <div style="text-align:center;max-width:400px;padding:32px">
      <div style="font-size:48px;margin-bottom:16px">⚠️</div>
      <h2 style="color:#f1f5f9;margin-bottom:8px">Erro ao inicializar</h2>
      <p style="font-size:14px;margin-bottom:16px">${err.message}</p>
      <p style="font-size:12px;color:#64748b">Verifique a configuração em config/supabase.js</p>
      <button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#6366f1;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Tentar Novamente</button>
    </div>
  </div>`;
});
