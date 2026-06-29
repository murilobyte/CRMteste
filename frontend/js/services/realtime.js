/**
 * Realtime Service — gerencia subscriptions do Supabase
 */
import { db } from './supabase.js';

export const RealtimeService = {
  _channels: new Map(),

  /**
   * Escuta mudanças em uma tabela da organização
   * @param {string} table
   * @param {string} orgId
   * @param {Function} callback
   */
  subscribe(table, orgId, callback) {
    const key = `${table}:${orgId}`;
    if (this._channels.has(key)) return;

    const channel = db
      .channel(key)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table,
        filter: `organization_id=eq.${orgId}`,
      }, payload => callback(payload))
      .subscribe();

    this._channels.set(key, channel);
    return () => this.unsubscribe(key);
  },

  /** Escuta notificações do usuário */
  subscribeNotifications(userId, callback) {
    const key = `notifications:${userId}`;
    if (this._channels.has(key)) return;

    const channel = db
      .channel(key)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, payload => callback(payload.new))
      .subscribe();

    this._channels.set(key, channel);
  },

  unsubscribe(key) {
    const ch = this._channels.get(key);
    if (ch) { db.removeChannel(ch); this._channels.delete(key); }
  },

  unsubscribeAll() {
    this._channels.forEach((ch) => db.removeChannel(ch));
    this._channels.clear();
  },
};
