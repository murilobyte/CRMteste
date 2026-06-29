/**
 * Utilitários globais de formatação e helpers
 */

/**
 * Escapa HTML para uso seguro em innerHTML / atributos.
 * SEMPRE use em qualquer dado dinâmico (vindo do banco, do usuário, de URL)
 * que for interpolado em template literals com innerHTML.
 */
export function esc(value) {
  if (value == null) return '';
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

/**
 * Valida e devolve uma URL segura para uso em href/src.
 * Bloqueia esquemas perigosos (javascript:, data:, vbscript:).
 * Retorna '' se a URL não for http(s)/mailto/tel ou relativa.
 */
export function safeUrl(url) {
  if (!url) return '';
  const s = String(url).trim();
  // Permite caminhos relativos e âncoras
  if (/^(\/|\.|#|\?)/.test(s)) return esc(s);
  if (/^(https?:|mailto:|tel:)/i.test(s)) return esc(s);
  return '';
}

export const fmt = {
  /** Formata moeda BRL */
  currency(value, currency = 'BRL') {
    if (value == null) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  },

  /** Formata número */
  number(value) {
    if (value == null) return '0';
    return new Intl.NumberFormat('pt-BR').format(value);
  },

  /** Formata data DD/MM/YYYY */
  date(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString('pt-BR');
  },

  /** Formata data+hora */
  datetime(value) {
    if (!value) return '—';
    return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  },

  /** Tempo relativo (ex: "há 2 dias") */
  relativeTime(value) {
    if (!value) return '';
    const diff = Date.now() - new Date(value).getTime();
    const rtf  = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
    const units = [
      { unit: 'year',   ms: 31536e6 },
      { unit: 'month',  ms: 2592e6 },
      { unit: 'week',   ms: 604800e3 },
      { unit: 'day',    ms: 86400e3 },
      { unit: 'hour',   ms: 3600e3 },
      { unit: 'minute', ms: 60e3 },
      { unit: 'second', ms: 1e3 },
    ];
    for (const { unit, ms } of units) {
      if (Math.abs(diff) >= ms) return rtf.format(-Math.round(diff / ms), unit);
    }
    return 'agora';
  },

  /** Iniciais de nome */
  initials(name) {
    if (!name) return '?';
    return name.split(' ').filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join('');
  },

  /** Trunca texto */
  truncate(str, n = 40) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  },

  /** Score → cor */
  scoreColor(score) {
    if (score >= 80) return 'var(--color-success)';
    if (score >= 50) return 'var(--color-warning)';
    return 'var(--color-danger)';
  },
};

/** Status labels e cores */
export const STATUS = {
  lead: {
    new:       { label: 'Novo',        color: '#3b82f6' },
    contacted: { label: 'Contatado',   color: '#a855f7' },
    qualified: { label: 'Qualificado', color: '#f59e0b' },
    proposal:  { label: 'Proposta',    color: '#f97316' },
    won:       { label: 'Ganho',       color: '#10b981' },
    lost:      { label: 'Perdido',     color: '#ef4444' },
  },
  temperature: {
    hot:  { label: '🔥 Quente', color: '#ef4444' },
    warm: { label: '🌡️ Morno',  color: '#f59e0b' },
    cold: { label: '❄️ Frio',   color: '#64748b' },
  },
  task: {
    todo:        { label: 'A fazer',      color: '#64748b' },
    in_progress: { label: 'Em andamento', color: '#3b82f6' },
    done:        { label: 'Concluída',    color: '#10b981' },
    cancelled:   { label: 'Cancelada',   color: '#ef4444' },
  },
  priority: {
    low:    { label: 'Baixa',  color: '#64748b' },
    medium: { label: 'Média',  color: '#f59e0b' },
    high:   { label: 'Alta',   color: '#f97316' },
    urgent: { label: 'Urgente',color: '#ef4444' },
  },
  opportunity: {
    open: { label: 'Aberta', color: '#3b82f6' },
    won:  { label: 'Ganha',  color: '#10b981' },
    lost: { label: 'Perdida',color: '#ef4444' },
  },
};

/** Gera badge HTML (escapa text/color internamente) */
export function badge(text, color, dotOnly = false) {
  const c = esc(color);
  return `<span class="badge" style="background:${c}20;color:${c}">
    ${dotOnly ? `<span style="width:6px;height:6px;border-radius:50%;background:${c};display:inline-block"></span>` : ''}
    ${esc(text)}
  </span>`;
}

/** Avatar HTML (escapa name e valida url internamente) */
export function avatar(name, url, size = '') {
  const initials = esc(fmt.initials(name || '?'));
  const cl = `avatar ${size ? `avatar-${size}` : ''}`;
  const src = safeUrl(url);
  if (src) return `<div class="${cl}"><img src="${src}" alt="${esc(name)}" loading="lazy"></div>`;
  const color = stringToColor(name || '');
  return `<div class="${cl}" style="background:${color}">${initials}</div>`;
}

/** Converte string em cor hex consistente */
export function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#f59e0b','#10b981','#14b8a6','#3b82f6','#06b6d4'];
  return colors[Math.abs(hash) % colors.length];
}

/** Debounce */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

/** Pagination HTML */
export function renderPagination(current, total, pageSize, onClick) {
  if (total <= pageSize) return '';
  const pages = Math.ceil(total / pageSize);
  let html = `
    <button class="pagination-btn" ${current===1?'disabled':''} onclick="${onClick}(${current-1})">
      <i data-lucide="chevron-left" style="width:14px;height:14px"></i>
    </button>`;

  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - current) <= 2) {
      html += `<button class="pagination-btn ${i===current?'active':''}" onclick="${onClick}(${i})">${i}</button>`;
    } else if (Math.abs(i - current) === 3) {
      html += `<span style="color:var(--text-tertiary);padding:0 4px">...</span>`;
    }
  }

  html += `<button class="pagination-btn" ${current===pages?'disabled':''} onclick="${onClick}(${current+1})">
    <i data-lucide="chevron-right" style="width:14px;height:14px"></i>
  </button>`;
  return html;
}

/** Skeleton loader genérico */
export function skeleton(rows = 5) {
  return Array(rows).fill(null).map(() => `
    <div class="skeleton-row">
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton-text">
        <div class="skeleton skeleton-line skeleton-line-short"></div>
        <div class="skeleton skeleton-line skeleton-line-long"></div>
      </div>
    </div>
  `).join('');
}
