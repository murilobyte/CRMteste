/**
 * Auth Service — gerencia sessão, usuário e organização
 */
import { db } from './supabase.js';

export const AuthService = {
  _user:    null,
  _profile: null,
  _orgId:   null,

  /** Retorna a sessão ativa */
  async getSession() {
    const { data: { session } } = await db.auth.getSession();
    return session;
  },

  /** Retorna usuário autenticado ou null */
  async getUser() {
    const { data: { user } } = await db.auth.getUser();
    this._user = user;
    return user;
  },

  /** Carrega perfil + organização do usuário logado */
  async loadProfile() {
    const user = await this.getUser();
    if (!user) return null;

    const { data: profile } = await db
      .from('profiles')
      .select('*, organizations(*)')
      .eq('id', user.id)
      .single();

    this._profile = profile;
    this._orgId   = profile?.organization_id;
    return profile;
  },

  get profile() { return this._profile; },
  get orgId()   { return this._orgId; },
  get user()    { return this._user; },

  /** Atualiza last_seen_at */
  async updateLastSeen() {
    if (!this._user) return;
    await db.from('profiles')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', this._user.id);
  },

  async signOut() {
    await db.auth.signOut();
    window.location.href = './index.html';
  },

  /** Escuta mudanças de auth */
  onAuthChange(callback) {
    return db.auth.onAuthStateChange(callback);
  },
};
