/**
 * Router — roteamento por hash (GitHub Pages compatible)
 */
import { bus } from './events.js';

export const Router = {
  _routes: new Map(),
  _current: null,
  _beforeHooks: [],

  /** Registra uma rota: path → { page, title, onEnter } */
  register(path, config) {
    this._routes.set(path, config);
  },

  /** Navega para um path */
  navigate(path, pushState = true) {
    if (path === this._current) return;

    // Executa hooks de saída
    for (const hook of this._beforeHooks) {
      if (!hook(path)) return;
    }

    // Resolve a rota ANTES de atualizar o estado, para não travar a navegação
    let route = this._routes.get(path);
    if (!route) {
      // Rota inexistente → redireciona para o fallback (/dashboard ou primeira rota)
      const fallback = this._routes.has('/dashboard') ? '/dashboard' : this._routes.keys().next().value;
      if (!fallback || fallback === path) return; // nada para onde ir
      return this.navigate(fallback, pushState);
    }

    // Só agora confirma a rota como atual
    this._current = path;
    if (pushState) window.location.hash = path;

    // Atualiza UI
    this._activatePage(route.pageId);
    this._updateBreadcrumb(route.title);
    this._updateNavItems(path);

    bus.emit('route:change', { path, route });
    route.onEnter?.();
  },

  _activatePage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(`page-${pageId}`);
    if (page) {
      page.classList.add('active');
      page.classList.add('page-enter');
      setTimeout(() => page.classList.remove('page-enter'), 300);
    }
  },

  _updateBreadcrumb(title) {
    const el = document.getElementById('breadcrumb-page');
    if (el) el.textContent = title;
    document.title = `${title} — CRM Pro`;
  },

  _updateNavItems(path) {
    document.querySelectorAll('.nav-item').forEach(item => {
      const href = item.getAttribute('href')?.replace('#', '');
      item.classList.toggle('active', href === path || (path === '/' && href === '/dashboard'));
    });
  },

  /** Inicializa o router lendo o hash atual */
  init() {
    window.addEventListener('hashchange', () => {
      const path = window.location.hash.replace('#', '') || '/dashboard';
      this.navigate(path, false);
    });

    const initialPath = window.location.hash.replace('#', '') || '/dashboard';
    this.navigate(initialPath, false);
  },
};
