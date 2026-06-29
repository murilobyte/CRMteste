/**
 * Modal System — gerencia modais globais
 */
import { esc } from '../core/utils.js';

export const Modal = {
  _stack: [],
  _escHandler: null,

  open({ title, body, footer, size = '', onClose }) {
    const overlay = document.getElementById('modal-overlay');
    const modal   = document.getElementById('modal');
    const titleEl = document.getElementById('modal-title');
    const bodyEl  = document.getElementById('modal-body');
    const footerEl= document.getElementById('modal-footer');

    titleEl.textContent = title || '';
    bodyEl.innerHTML    = body  || '';
    footerEl.innerHTML  = '';
    footerEl.style.display = 'none';

    // Size
    modal.className = 'modal ' + (size ? `modal-${size}` : '');

    if (footer) {
      footerEl.innerHTML = footer;
      footerEl.style.display = 'flex';
    }

    overlay.classList.add('open');
    this._stack.push({ onClose });

    // Fecha no Escape — guarda a referência única do handler para removê-lo em close()
    if (!this._escHandler) {
      this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
      document.addEventListener('keydown', this._escHandler);
    }

    // Reinicia ícones Lucide
    requestAnimationFrame(() => lucide.createIcons({ nodes: [overlay] }));
  },

  close() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('open');
    const top = this._stack.pop();
    top?.onClose?.();

    // Remove o listener de Escape quando não há mais modais empilhados
    if (!this._stack.length && this._escHandler) {
      document.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
  },

  closeOnOverlay(e) {
    if (e.target === document.getElementById('modal-overlay')) this.close();
  },

  /** Abre um modal de confirmação */
  confirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', onConfirm, dangerous = false }) {
    this.open({
      title,
      body: `<p style="color:var(--text-secondary);font-size:var(--text-sm);line-height:1.6">${esc(message)}</p>`,
      footer: `
        <button class="btn btn-secondary" onclick="Modal.close()"><span class="btn-text">${esc(cancelText)}</span></button>
        <button class="btn ${dangerous ? 'btn-danger' : 'btn-primary'}" id="modal-confirm-btn">
          <span class="btn-text">${esc(confirmText)}</span>
        </button>`,
    });
    requestAnimationFrame(() => {
      document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
        onConfirm?.();
        this.close();
      });
    });
  },
};
