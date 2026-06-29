/**
 * Calendar Module — FullCalendar com tarefas e reuniões
 */
import { db }     from '../services/supabase.js';
import { Store }  from '../core/store.js';
import { Modal }  from '../components/modal.js';
import { Toasts } from '../components/notifications.js';
import { fmt, esc } from '../core/utils.js';

let _calendar = null;
let _initialized = false;

export const CalendarModule = {
  async init() {
    if (_initialized) {
      _calendar?.refetchEvents();
      return;
    }
    _initialized = true;

    const el = document.getElementById('calendar-container');
    if (!el || typeof FullCalendar === 'undefined') {
      // FullCalendar não carregado ainda — aguarda
      if (typeof FullCalendar === 'undefined') {
        el.innerHTML = `<div style="padding:var(--space-8);text-align:center;color:var(--text-secondary)">
          <i data-lucide="calendar" style="width:48px;height:48px;opacity:0.3;margin-bottom:var(--space-4)"></i>
          <p>FullCalendar não encontrado. Adicione o script no app.html.</p>
        </div>`;
        lucide.createIcons({ nodes: [el] });
        return;
      }
      return;
    }

    _calendar = new FullCalendar.Calendar(el, {
      initialView:   'dayGridMonth',
      locale:        'pt-br',
      height:        '100%',
      headerToolbar: {
        left:   'prev,next today',
        center: 'title',
        right:  'dayGridMonth,timeGridWeek,timeGridDay,listWeek',
      },
      buttonText: {
        today:   'Hoje',
        month:   'Mês',
        week:    'Semana',
        day:     'Dia',
        list:    'Lista',
      },
      editable:   true,
      selectable: true,
      nowIndicator: true,

      events: async (info, success, failure) => {
        const orgId = Store.get('orgId');
        try {
          const [{ data: tasks }, { data: meetings }] = await Promise.all([
            db.from('tasks')
              .select('id,title,due_date,priority,status')
              .eq('organization_id', orgId)
              .is('deleted_at', null)
              .not('due_date', 'is', null)
              .gte('due_date', info.startStr)
              .lte('due_date', info.endStr),
            db.from('meetings')
              .select('id,title,start_at,end_at,status')
              .eq('organization_id', orgId)
              .is('deleted_at', null)
              .gte('start_at', info.startStr)
              .lte('start_at', info.endStr),
          ]);

          const events = [
            ...(tasks || []).map(t => ({
              id:         `task-${t.id}`,
              title:      t.title,
              start:      t.due_date,
              allDay:     true,
              color:      t.status === 'done' ? '#10b981' : t.priority === 'urgent' ? '#ef4444' : t.priority === 'high' ? '#f59e0b' : '#6366f1',
              extendedProps: { type: 'task', raw: t },
            })),
            ...(meetings || []).map(m => ({
              id:         `meeting-${m.id}`,
              title:      m.title,
              start:      m.start_at,
              end:        m.end_at,
              color:      '#a855f7',
              extendedProps: { type: 'meeting', raw: m },
            })),
          ];
          success(events);
        } catch(err) {
          failure(err);
        }
      },

      eventClick: (info) => {
        const { type, raw } = info.event.extendedProps;
        this._showEventDetail(type, raw);
      },

      select: (info) => {
        this.openCreate(info.startStr, info.endStr);
      },

      eventDrop: async (info) => {
        const { type, raw } = info.event.extendedProps;
        const newDate = info.event.startStr;

        if (type === 'task') {
          const { error } = await db.from('tasks')
            .update({ due_date: new Date(newDate).toISOString() })
            .eq('id', raw.id);
          if (error) { Toasts.error('Erro', error.message); info.revert(); }
          else Toasts.success('Tarefa atualizada', '');
        }
      },
    });

    _calendar.render();
  },

  _showEventDetail(type, raw) {
    if (type === 'task') {
      Modal.open({
        title: raw.title,
        size:  'sm',
        body: `<div style="display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-2)">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Tipo</span>
            <span class="badge badge-outline">Tarefa</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Vencimento</span>
            <span style="font-size:var(--text-sm)">${fmt.datetime(raw.due_date)}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Status</span>
            <span style="font-size:var(--text-sm)">${esc(raw.status)}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Prioridade</span>
            <span style="font-size:var(--text-sm)">${esc(raw.priority)}</span>
          </div>
        </div>`,
        footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fechar</button>`,
      });
    } else {
      Modal.open({
        title: raw.title,
        size:  'sm',
        body: `<div style="display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-2)">
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Tipo</span>
            <span class="badge" style="background:var(--color-accent-500)20;color:var(--color-accent-500)">Reunião</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Início</span>
            <span style="font-size:var(--text-sm)">${fmt.datetime(raw.start_at)}</span>
          </div>
          ${raw.end_at ? `<div style="display:flex;justify-content:space-between">
            <span style="color:var(--text-tertiary);font-size:var(--text-sm)">Fim</span>
            <span style="font-size:var(--text-sm)">${fmt.datetime(raw.end_at)}</span>
          </div>` : ''}
        </div>`,
        footer: `<button class="btn btn-secondary" onclick="Modal.close()">Fechar</button>`,
      });
    }
  },

  openCreate(start = '', end = '') {
    const startVal = start ? new Date(start).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16);

    Modal.open({
      title: 'Novo Evento',
      size:  'lg',
      body: `<div class="detail-form-grid">
        <div class="input-group">
          <label class="input-label">Tipo</label>
          <select class="input" id="cal-type">
            <option value="task">Tarefa</option>
            <option value="meeting">Reunião</option>
          </select>
        </div>
        <div class="input-group full-width">
          <label class="input-label required">Título</label>
          <input type="text" class="input" id="cal-title" placeholder="Título do evento">
        </div>
        <div class="input-group">
          <label class="input-label">Data/Hora início</label>
          <input type="datetime-local" class="input" id="cal-start" value="${startVal}">
        </div>
        <div class="input-group">
          <label class="input-label">Data/Hora fim</label>
          <input type="datetime-local" class="input" id="cal-end">
        </div>
        <div class="input-group full-width">
          <label class="input-label">Descrição</label>
          <textarea class="input" id="cal-desc" rows="3" placeholder="Detalhes..."></textarea>
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="CalendarModule.save()"><span class="btn-text">Criar</span></button>`,
    });
  },

  async save() {
    const orgId  = Store.get('orgId');
    const userId = Store.get('user')?.id;
    const type   = document.getElementById('cal-type')?.value;
    const title  = document.getElementById('cal-title')?.value.trim();
    if (!title) { Toasts.error('Erro', 'Título é obrigatório'); return; }

    if (type === 'task') {
      const { error } = await db.from('tasks').insert({
        organization_id: orgId,
        owner_id:    userId,
        assigned_to: userId,
        title,
        description: document.getElementById('cal-desc')?.value.trim() || null,
        due_date:    document.getElementById('cal-start')?.value || null,
        status:      'todo',
        priority:    'medium',
        type:        'task',
      });
      if (error) { Toasts.error('Erro', error.message); return; }
    } else {
      const { error } = await db.from('meetings').insert({
        organization_id: orgId,
        owner_id:    userId,
        title,
        description: document.getElementById('cal-desc')?.value.trim() || null,
        start_at:    document.getElementById('cal-start')?.value || new Date().toISOString(),
        end_at:      document.getElementById('cal-end')?.value   || null,
        status:      'scheduled',
      });
      if (error) { Toasts.error('Erro', error.message); return; }
    }

    Modal.close();
    Toasts.success('Evento criado', title);
    _calendar?.refetchEvents();
  },

  changeView(view) {
    _calendar?.changeView(view);
  },

  today() {
    _calendar?.today();
  },

  prev() {
    _calendar?.prev();
  },

  next() {
    _calendar?.next();
  },
};
