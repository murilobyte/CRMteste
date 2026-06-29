/**
 * Store — estado global reativo do app
 */
import { bus } from './events.js';

const _state = {
  user:    null,
  profile: null,
  org:     null,
  orgId:   null,

  // UI
  currentRoute: '/',
  sidebarCollapsed: false,
  theme: 'dark',

  // Cache
  leads:     [],
  contacts:  [],
  companies: [],
  funnels:   [],
  tasks:     [],
  notifications: [],
  kpis:      {},

  // Pagination
  leadsPage: 1,
  contactsPage: 1,
  companiesPage: 1,
};

export const Store = {
  get(key) { return _state[key]; },

  set(key, value) {
    _state[key] = value;
    bus.emit(`store:${key}`, value);
    bus.emit('store:change', { key, value });
  },

  patch(key, partial) {
    _state[key] = { ..._state[key], ...partial };
    bus.emit(`store:${key}`, _state[key]);
  },

  subscribe(key, fn) {
    return bus.on(`store:${key}`, fn);
  },

  getAll() { return { ..._state }; },

  /** Inicializa o store com os dados do usuário logado */
  async init({ user, profile, org }) {
    this.set('user',    user);
    this.set('profile', profile);
    this.set('org',     org);
    this.set('orgId',   profile?.organization_id);

    // Restaura preferências
    const prefs = profile?.preferences || {};
    if (prefs.sidebarCollapsed) this.set('sidebarCollapsed', true);
    this.set('theme', prefs.theme || 'dark');
  },
};
