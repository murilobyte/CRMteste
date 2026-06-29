/**
 * Notification System — toasts e painel de notificações
 */
import { db } from '../services/supabase.js';
import { AuthService } from '../services/auth.js';
import { fmt, esc } from '../core/utils.js';

export const Toasts = {
  show({ type = 'info', title, message, duration = 4000 }) {
    const icons = { success: 'check-circle', error: 'x-circle', warning: 'alert-triangle', info: 'info' };
    const icon  = icons[type] || 'info';

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <i data-lucide="${icon}" class="toast-icon"></i>
      <div>
        <div class="toast-title">${esc(title)}</div>
        ${message ? `<div class="toast-message">${esc(message)}</div>` : ''}
      </div>
      <button style="margin-left:auto;color:var(--text-tertiary)" onclick="this.closest('.toast').click()">
        <i data-lucide="x" style="width:14px;height:14px"></i>
      </button>`;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    lucide.createIcons({ nodes: [toast] });

    toast.addEventListener('click', () => this._remove(toast));
    if (duration > 0) setTimeout(() => this._remove(toast), duration);
  },

  _remove(toast) {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => toast.remove());
  },

  success(title, message) { this.show({ type: 'success', title, message }); },
  error  (title, message) { this.show({ type: 'error',   title, message }); },
  warning(title, message) { this.show({ type: 'warning', title, message }); },
  info   (title, message) { this.show({ type: 'info',    title, message }); },
};

export const Notifications = {
  _items: [],

  async load() {
    const userId = AuthService.user?.id;
    if (!userId) return;

    const { data } = await db
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30);

    this._items = data || [];
    this._render();
    this._updateDot();
  },

  _render() {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (!this._items.length) {
      list.innerHTML = `<div class="empty-state" style="padding:var(--space-8)">
        <div class="empty-state-icon"><i data-lucide="bell-off"></i></div>
        <p style="font-size:var(--text-sm);color:var(--text-secondary)">Sem notificações</p>
      </div>`;
      lucide.createIcons({ nodes: [list] });
      return;
    }

    list.innerHTML = this._items.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" onclick="Notifications.markRead('${n.id}','${esc(n.action_url||'')}')">
        <div class="notif-item-icon" style="background:${this._iconBg(n.type)}">
          <i data-lucide="${this._icon(n.type)}" style="width:16px;height:16px;color:${this._iconColor(n.type)}"></i>
        </div>
        <div style="flex:1;min-width:0">
          <div class="notif-item-title">${esc(n.title)}</div>
          ${n.message ? `<div class="notif-item-msg">${esc(n.message)}</div>` : ''}
          <div class="notif-item-time">${fmt.relativeTime(n.created_at)}</div>
        </div>
        ${!n.is_read ? '<div class="notif-dot"></div>' : ''}
      </div>
    `).join('');
    lucide.createIcons({ nodes: [list] });
  },

  _updateDot() {
    const unread = this._items.filter(n => !n.is_read).length;
    const dot    = document.getElementById('notif-dot');
    if (dot) dot.style.display = unread > 0 ? 'block' : 'none';
  },

  async markRead(id, url) {
    await db.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id);
    const n = this._items.find(i => i.id === id);
    if (n) n.is_read = true;
    this._render();
    this._updateDot();
    if (url && url !== 'undefined') {
      window.CRM?.navigate(url.replace('#', ''));
    }
  },

  async markAllRead() {
    const userId = AuthService.user?.id;
    if (!userId) return;
    await db.from('notifications').update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId).eq('is_read', false);
    this._items.forEach(n => n.is_read = true);
    this._render();
    this._updateDot();
    Toasts.success('Notificações', 'Todas marcadas como lidas');
  },

  pushNew(notif) {
    this._items.unshift(notif);
    this._render();
    this._updateDot();
    Toasts.info(notif.title, notif.message);
  },

  _icon(type) {
    const map = {
      welcome: 'sparkles', task_assigned: 'check-square', pipeline: 'git-merge',
      task_due: 'clock', email: 'mail', call: 'phone', meeting: 'calendar',
    };
    return map[type] || 'bell';
  },
  _iconBg(type) {
    const map = { welcome:'rgba(16,185,129,0.1)', task_due:'rgba(239,68,68,0.1)', pipeline:'rgba(99,102,241,0.1)' };
    return map[type] || 'rgba(99,102,241,0.1)';
  },
  _iconColor(type) {
    const map = { welcome:'var(--color-success)', task_due:'var(--color-danger)', pipeline:'var(--color-primary-400)' };
    return map[type] || 'var(--color-primary-400)';
  },
};
