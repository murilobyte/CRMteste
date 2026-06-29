/**
 * Event Bus — comunicação desacoplada entre módulos
 */
export class EventBus {
  constructor() { this._listeners = new Map(); }

  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this._listeners.get(event)?.delete(handler);
  }

  emit(event, data) {
    this._listeners.get(event)?.forEach(h => {
      try { h(data); } catch(e) { console.error(`[EventBus] ${event}:`, e); }
    });
  }

  once(event, handler) {
    const wrapper = (data) => { handler(data); this.off(event, wrapper); };
    this.on(event, wrapper);
  }
}

export const bus = new EventBus();
