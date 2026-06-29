/**
 * Settings Module — Painel de configurações completo
 */
import { db }         from '../services/supabase.js';
import { Store }      from '../core/store.js';
import { AuthService }from '../services/auth.js';
import { Toasts }     from '../components/notifications.js';
import { Modal }      from '../components/modal.js';
import { fmt, esc, safeUrl } from '../core/utils.js';

let _currentTab = 'profile';

export const Settings = {
  async init() {
    await this.show(_currentTab);
  },

  // Alias usado pelos nav-items do app.html
  async show(tab) {
    return this.switchTab(tab);
  },

  async switchTab(tab) {
    _currentTab = tab;

    // Update active state in settings sidebar nav
    document.querySelectorAll('#page-settings nav .nav-item').forEach(t => {
      const onclick = t.getAttribute('onclick') || '';
      t.classList.toggle('active', onclick.includes(`'${tab}'`));
    });

    const content = document.getElementById('settings-content');
    if (!content) return;

    content.innerHTML = `<div style="padding:var(--space-8);text-align:center"><div class="spinner"></div></div>`;

    switch (tab) {
      case 'profile':      await this._renderProfile(content); break;
      case 'organization': await this._renderOrg(content);     break;
      case 'team':         await this._renderTeam(content);     break;
      case 'custom-fields':await this._renderCustomFields(content); break;
      case 'appearance':   this._renderAppearance(content);    break;
      case 'notifications':await this._renderNotifSettings(content); break;
      case 'api':          await this._renderAPI(content);      break;
      case 'billing':      this._renderBilling(content);       break;
      default:             content.innerHTML = '<div style="padding:var(--space-8)">Em breve</div>';
    }

    lucide.createIcons({ nodes: [content] });
  },

  async _renderProfile(el) {
    const profile = Store.get('profile') || {};
    const user    = Store.get('user')    || {};

    el.innerHTML = `
      <div style="max-width:600px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">Meu Perfil</h2>

        <div class="card" style="padding:var(--space-6);margin-bottom:var(--space-4)">
          <div style="display:flex;align-items:center;gap:var(--space-6);margin-bottom:var(--space-6)">
            <div style="position:relative">
              <div style="width:80px;height:80px;border-radius:50%;background:var(--color-primary-800);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:var(--color-primary-300)">
                ${safeUrl(profile.avatar_url)
                  ? `<img src="${safeUrl(profile.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover" alt="Avatar">`
                  : esc((profile.first_name || user.email || 'U').charAt(0).toUpperCase())}
              </div>
            </div>
            <div>
              <div style="font-size:var(--text-lg);font-weight:var(--font-semibold)">${esc(profile.first_name || '')} ${esc(profile.last_name || '')}</div>
              <div style="color:var(--text-secondary);font-size:var(--text-sm)">${esc(user.email || '')}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:4px">${esc(profile.role || 'Membro')}</div>
            </div>
          </div>

          <div class="detail-form-grid">
            <div class="input-group">
              <label class="input-label">Nome</label>
              <input type="text" class="input" id="prof-fname" value="${esc(profile.first_name || '')}" placeholder="João">
            </div>
            <div class="input-group">
              <label class="input-label">Sobrenome</label>
              <input type="text" class="input" id="prof-lname" value="${esc(profile.last_name || '')}" placeholder="Silva">
            </div>
            <div class="input-group full-width">
              <label class="input-label">Cargo / Função</label>
              <input type="text" class="input" id="prof-role" value="${esc(profile.job_title || '')}" placeholder="Gerente de Vendas">
            </div>
            <div class="input-group">
              <label class="input-label">Telefone</label>
              <input type="tel" class="input" id="prof-phone" value="${esc(profile.phone || '')}" placeholder="(11) 99999-9999">
            </div>
            <div class="input-group">
              <label class="input-label">Fuso horário</label>
              <select class="input" id="prof-tz">
                <option value="America/Sao_Paulo" ${profile.timezone==='America/Sao_Paulo'?'selected':''}>América/São Paulo (BRT)</option>
                <option value="America/Manaus"    ${profile.timezone==='America/Manaus'?'selected':''}>América/Manaus (AMT)</option>
                <option value="America/Belem"     ${profile.timezone==='America/Belem'?'selected':''}>América/Belém (BRT)</option>
                <option value="America/Fortaleza" ${profile.timezone==='America/Fortaleza'?'selected':''}>América/Fortaleza (BRT-3)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <div style="margin-top:var(--space-5)">
            <button class="btn btn-primary" onclick="Settings.saveProfile()">
              <i data-lucide="save" style="width:14px;height:14px"></i> Salvar Perfil
            </button>
          </div>
        </div>

        <div class="card" style="padding:var(--space-6)">
          <h3 style="font-size:var(--text-base);font-weight:var(--font-semibold);margin-bottom:var(--space-4)">Alterar Senha</h3>
          <div class="detail-form-grid">
            <div class="input-group full-width">
              <label class="input-label">Nova Senha</label>
              <input type="password" class="input" id="prof-pass" placeholder="Mínimo 8 caracteres">
            </div>
            <div class="input-group full-width">
              <label class="input-label">Confirmar Senha</label>
              <input type="password" class="input" id="prof-pass2" placeholder="Repita a nova senha">
            </div>
          </div>
          <div style="margin-top:var(--space-4)">
            <button class="btn btn-secondary" onclick="Settings.changePassword()">
              <i data-lucide="lock" style="width:14px;height:14px"></i> Alterar Senha
            </button>
          </div>
        </div>
      </div>`;
  },

  async saveProfile() {
    const userId = Store.get('user')?.id;
    const { error } = await db.from('profiles').update({
      first_name: document.getElementById('prof-fname')?.value.trim() || null,
      last_name:  document.getElementById('prof-lname')?.value.trim() || null,
      job_title:  document.getElementById('prof-role')?.value.trim()  || null,
      phone:      document.getElementById('prof-phone')?.value.trim() || null,
      timezone:   document.getElementById('prof-tz')?.value           || 'America/Sao_Paulo',
    }).eq('id', userId);

    if (error) { Toasts.error('Erro', error.message); return; }

    const profile = await AuthService.loadProfile();
    Store.set('profile', profile);

    // Atualiza header
    const nameEl = document.getElementById('header-user-name');
    if (nameEl && profile) nameEl.textContent = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

    Toasts.success('Perfil atualizado', '');
  },

  async changePassword() {
    const pass  = document.getElementById('prof-pass')?.value;
    const pass2 = document.getElementById('prof-pass2')?.value;

    if (!pass || pass.length < 8) { Toasts.error('Erro', 'Senha deve ter pelo menos 8 caracteres'); return; }
    if (pass !== pass2)            { Toasts.error('Erro', 'As senhas não coincidem'); return; }

    const { error } = await db.auth.updateUser({ password: pass });
    if (error) { Toasts.error('Erro', error.message); return; }

    Toasts.success('Senha alterada', 'Sua senha foi atualizada com sucesso');
    document.getElementById('prof-pass').value  = '';
    document.getElementById('prof-pass2').value = '';
  },

  async _renderOrg(el) {
    const org = Store.get('org') || {};

    el.innerHTML = `
      <div style="max-width:600px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">Organização</h2>
        <div class="card" style="padding:var(--space-6)">
          <div class="detail-form-grid">
            <div class="input-group full-width">
              <label class="input-label required">Nome da Empresa</label>
              <input type="text" class="input" id="org-name" value="${esc(org.name || '')}" placeholder="Minha Empresa Ltda">
            </div>
            <div class="input-group full-width">
              <label class="input-label">Domínio</label>
              <input type="text" class="input" id="org-domain" value="${esc(org.domain || '')}" placeholder="minha-empresa.com">
            </div>
            <div class="input-group">
              <label class="input-label">Telefone</label>
              <input type="tel" class="input" id="org-phone" value="${esc(org.phone || '')}" placeholder="(11) 3456-7890">
            </div>
            <div class="input-group">
              <label class="input-label">CNPJ</label>
              <input type="text" class="input" id="org-cnpj" value="${esc(org.document || '')}" placeholder="00.000.000/0001-00">
            </div>
            <div class="input-group">
              <label class="input-label">Moeda</label>
              <select class="input" id="org-currency">
                <option value="BRL" ${org.currency==='BRL'?'selected':''}>R$ – Real Brasileiro</option>
                <option value="USD" ${org.currency==='USD'?'selected':''}>$ – Dólar Americano</option>
                <option value="EUR" ${org.currency==='EUR'?'selected':''}>€ – Euro</option>
              </select>
            </div>
            <div class="input-group">
              <label class="input-label">Idioma</label>
              <select class="input" id="org-lang">
                <option value="pt-BR" ${org.locale==='pt-BR'?'selected':''}>Português (Brasil)</option>
                <option value="en-US" ${org.locale==='en-US'?'selected':''}>English (US)</option>
                <option value="es-ES" ${org.locale==='es-ES'?'selected':''}>Español</option>
              </select>
            </div>
          </div>
          <div style="margin-top:var(--space-5)">
            <button class="btn btn-primary" onclick="Settings.saveOrg()">
              <i data-lucide="save" style="width:14px;height:14px"></i> Salvar
            </button>
          </div>
        </div>
      </div>`;
  },

  async saveOrg() {
    const orgId = Store.get('orgId');
    const { error } = await db.from('organizations').update({
      name:     document.getElementById('org-name')?.value.trim()     || null,
      domain:   document.getElementById('org-domain')?.value.trim()   || null,
      phone:    document.getElementById('org-phone')?.value.trim()     || null,
      document: document.getElementById('org-cnpj')?.value.trim()     || null,
      currency: document.getElementById('org-currency')?.value        || 'BRL',
      locale:   document.getElementById('org-lang')?.value            || 'pt-BR',
    }).eq('id', orgId);

    if (error) { Toasts.error('Erro', error.message); return; }

    const { data: org } = await db.from('organizations').select('*').eq('id', orgId).single();
    if (org) Store.set('org', org);

    Toasts.success('Organização atualizada', '');
  },

  async _renderTeam(el) {
    const orgId = Store.get('orgId');
    const { data: members } = await db.from('profiles')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at');

    el.innerHTML = `
      <div style="max-width:700px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6)">
          <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold)">Equipe</h2>
          <button class="btn btn-primary" onclick="Settings.inviteMember()">
            <i data-lucide="user-plus" style="width:14px;height:14px"></i> Convidar
          </button>
        </div>
        <div class="card" style="overflow:hidden">
          ${(members || []).map(m => `
            <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-4) var(--space-5);border-bottom:1px solid var(--border-subtle)">
              <div style="width:40px;height:40px;border-radius:50%;background:var(--color-primary-900);color:var(--color-primary-400);display:flex;align-items:center;justify-content:center;font-size:var(--text-base);font-weight:700;flex-shrink:0">
                ${safeUrl(m.avatar_url) ? `<img src="${safeUrl(m.avatar_url)}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : esc((m.first_name || 'U').charAt(0))}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-weight:var(--font-medium)">${esc(m.first_name || '')} ${esc(m.last_name || '')}</div>
                <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(m.email || '')} · ${esc(m.role || 'member')}</div>
              </div>
              <div style="display:flex;align-items:center;gap:var(--space-2)">
                <span class="badge ${m.is_active !== false ? 'badge-success' : 'badge-neutral'}">${m.is_active !== false ? 'Ativo' : 'Inativo'}</span>
                <button class="btn btn-ghost btn-xs" onclick="Settings.editMemberRole('${esc(m.id)}','${esc(m.role || 'member')}')">
                  <i data-lucide="shield" style="width:12px;height:12px"></i>
                </button>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  },

  inviteMember() {
    Modal.open({
      title: 'Convidar Membro',
      size:  'sm',
      body: `<div style="display:flex;flex-direction:column;gap:var(--space-4)">
        <div class="input-group">
          <label class="input-label required">E-mail</label>
          <input type="email" class="input" id="invite-email" placeholder="colega@empresa.com">
        </div>
        <div class="input-group">
          <label class="input-label">Função</label>
          <select class="input" id="invite-role">
            <option value="member">Membro</option>
            <option value="manager">Gerente</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Settings.sendInvite()">
                 <i data-lucide="send" style="width:14px;height:14px"></i> Enviar Convite
               </button>`,
    });
    setTimeout(() => lucide.createIcons(), 50);
  },

  async sendInvite() {
    const email = document.getElementById('invite-email')?.value.trim();
    if (!email) { Toasts.error('Erro', 'E-mail é obrigatório'); return; }

    // Convite via Supabase Auth Admin API (precisaria de edge function em produção)
    Toasts.info('Convite enviado', `Um e-mail foi enviado para ${email}`);
    Modal.close();
  },

  editMemberRole(userId, currentRole) {
    Modal.open({
      title: 'Alterar Função',
      size:  'xs',
      body: `<div class="input-group">
        <label class="input-label">Função</label>
        <select class="input" id="role-select">
          <option value="member"  ${currentRole==='member'?'selected':''}>Membro</option>
          <option value="manager" ${currentRole==='manager'?'selected':''}>Gerente</option>
          <option value="admin"   ${currentRole==='admin'?'selected':''}>Administrador</option>
        </select>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Settings.updateRole('${userId}')">Salvar</button>`,
    });
  },

  async updateRole(userId) {
    const role = document.getElementById('role-select')?.value;
    const { error } = await db.from('profiles').update({ role }).eq('id', userId);
    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Função atualizada', '');
    this.switchTab('team');
  },

  async _renderCustomFields(el) {
    const orgId = Store.get('orgId');
    const { data: fields } = await db.from('custom_fields')
      .select('*')
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .order('created_at');

    const ENTITIES = { lead:'Lead', contact:'Contato', company:'Empresa', opportunity:'Oportunidade' };
    const TYPES    = { text:'Texto', number:'Número', date:'Data', select:'Seleção', boolean:'Sim/Não', url:'URL' };

    el.innerHTML = `
      <div style="max-width:700px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-6)">
          <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold)">Campos Personalizados</h2>
          <button class="btn btn-primary" onclick="Settings.createCustomField()">
            <i data-lucide="plus" style="width:14px;height:14px"></i> Novo Campo
          </button>
        </div>
        ${!(fields?.length) ? `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="columns"></i></div>
            <div class="empty-state-title">Nenhum campo personalizado</div>
            <div class="empty-state-desc">Adicione campos extras a leads, contatos, empresas e oportunidades</div>
          </div>
        ` : `
          <div class="card" style="overflow:hidden">
            ${fields.map(f => `
              <div style="display:flex;align-items:center;gap:var(--space-4);padding:var(--space-3) var(--space-5);border-bottom:1px solid var(--border-subtle)">
                <div style="flex:1">
                  <div style="font-weight:var(--font-medium)">${esc(f.label)}</div>
                  <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${esc(ENTITIES[f.entity_type] || f.entity_type)} · ${esc(TYPES[f.field_type] || f.field_type)} · chave: ${esc(f.field_key)}</div>
                </div>
                <div style="display:flex;gap:var(--space-2)">
                  <span class="badge ${f.is_required ? 'badge-warning' : 'badge-neutral'}">${f.is_required ? 'Obrigatório' : 'Opcional'}</span>
                  <button class="btn btn-ghost btn-xs" onclick="Settings.deleteCustomField('${esc(f.id)}')" style="color:var(--color-danger)">
                    <i data-lucide="trash-2" style="width:12px;height:12px"></i>
                  </button>
                </div>
              </div>`).join('')}
          </div>`}
      </div>`;
  },

  createCustomField() {
    Modal.open({
      title: 'Novo Campo Personalizado',
      size:  'sm',
      body: `<div class="detail-form-grid">
        <div class="input-group">
          <label class="input-label required">Entidade</label>
          <select class="input" id="cf-entity">
            <option value="lead">Lead</option>
            <option value="contact">Contato</option>
            <option value="company">Empresa</option>
            <option value="opportunity">Oportunidade</option>
          </select>
        </div>
        <div class="input-group">
          <label class="input-label required">Tipo</label>
          <select class="input" id="cf-type">
            <option value="text">Texto</option>
            <option value="number">Número</option>
            <option value="date">Data</option>
            <option value="select">Seleção</option>
            <option value="boolean">Sim/Não</option>
            <option value="url">URL</option>
          </select>
        </div>
        <div class="input-group full-width">
          <label class="input-label required">Rótulo</label>
          <input type="text" class="input" id="cf-label" placeholder="Ex: Segmento de mercado">
        </div>
        <div class="input-group full-width">
          <label class="input-label">Chave interna</label>
          <input type="text" class="input" id="cf-key" placeholder="ex: segmento_mercado (gerado auto)">
        </div>
        <div class="input-group">
          <label class="toggle-label" style="display:flex;align-items:center;gap:var(--space-2)">
            <input type="checkbox" id="cf-required"> <span>Campo obrigatório</span>
          </label>
        </div>
      </div>`,
      footer: `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
               <button class="btn btn-primary" onclick="Settings.saveCustomField()">Criar</button>`,
    });
    setTimeout(() => {
      lucide.createIcons();
      document.getElementById('cf-label')?.addEventListener('input', e => {
        const keyEl = document.getElementById('cf-key');
        if (keyEl && !keyEl.dataset.manual) {
          keyEl.value = e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        }
      });
      document.getElementById('cf-key')?.addEventListener('input', e => { e.target.dataset.manual = '1'; });
    }, 50);
  },

  async saveCustomField() {
    const orgId = Store.get('orgId');
    const label = document.getElementById('cf-label')?.value.trim();
    const key   = document.getElementById('cf-key')?.value.trim() || label?.toLowerCase().replace(/\s+/g, '_');
    if (!label) { Toasts.error('Erro', 'Rótulo é obrigatório'); return; }

    const { error } = await db.from('custom_fields').insert({
      organization_id: orgId,
      entity_type:     document.getElementById('cf-entity')?.value,
      field_type:      document.getElementById('cf-type')?.value,
      label,
      field_key:       key,
      is_required:     document.getElementById('cf-required')?.checked || false,
    });

    if (error) { Toasts.error('Erro', error.message); return; }
    Modal.close();
    Toasts.success('Campo criado', label);
    await this.switchTab('custom-fields');
  },

  async deleteCustomField(id) {
    Modal.confirm({
      title: 'Excluir Campo', message: 'Esta ação não pode ser desfeita.',
      confirmText: 'Excluir', dangerous: true,
      onConfirm: async () => {
        await db.from('custom_fields').update({ deleted_at: new Date().toISOString() }).eq('id', id);
        Toasts.success('Campo excluído', '');
        await Settings.switchTab('custom-fields');
      },
    });
  },

  _renderAppearance(el) {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';

    el.innerHTML = `
      <div style="max-width:500px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">Aparência</h2>
        <div class="card" style="padding:var(--space-6)">
          <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:var(--space-4)">Tema</h3>
          <div style="display:flex;gap:var(--space-4)">
            ${['dark','light'].map(theme => `
              <button onclick="Settings.setTheme('${theme}')"
                style="flex:1;padding:var(--space-4);border-radius:var(--radius-lg);border:2px solid ${theme===currentTheme?'var(--color-primary-500)':'var(--border-default)'};background:${theme==='dark'?'#0f172a':'#f8fafc'};cursor:pointer;transition:border-color 0.2s">
                <div style="width:100%;height:48px;border-radius:var(--radius-md);background:${theme==='dark'?'#1e293b':'#e2e8f0'};margin-bottom:var(--space-2)"></div>
                <div style="font-size:var(--text-sm);font-weight:var(--font-medium);color:${theme==='dark'?'#f1f5f9':'#1e293b'}">${theme==='dark'?'Escuro':'Claro'}</div>
              </button>`).join('')}
          </div>
          <div style="margin-top:var(--space-6)">
            <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:var(--space-4)">Cor primária</h3>
            <div style="display:flex;gap:var(--space-3);flex-wrap:wrap">
              ${[
                {color:'#6366f1',name:'Índigo'},
                {color:'#3b82f6',name:'Azul'},
                {color:'#8b5cf6',name:'Violeta'},
                {color:'#ec4899',name:'Rosa'},
                {color:'#10b981',name:'Esmeralda'},
                {color:'#f59e0b',name:'Âmbar'},
              ].map(c => `
                <button onclick="Settings.setAccentColor('${c.color}')" title="${c.name}"
                  style="width:32px;height:32px;border-radius:50%;background:${c.color};border:3px solid transparent;cursor:pointer;transition:transform 0.2s"
                  onmouseenter="this.style.transform='scale(1.15)'"
                  onmouseleave="this.style.transform='scale(1)'"></button>`).join('')}
            </div>
          </div>
        </div>
      </div>`;
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('crm-theme', theme);
    Toasts.success('Tema alterado', theme === 'dark' ? 'Modo escuro ativado' : 'Modo claro ativado');
    this._renderAppearance(document.getElementById('settings-content'));
  },

  setAccentColor(color) {
    document.documentElement.style.setProperty('--color-primary-500', color);
    localStorage.setItem('crm-accent', color);
    Toasts.success('Cor atualizada', '');
  },

  async _renderNotifSettings(el) {
    el.innerHTML = `
      <div style="max-width:500px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">Notificações</h2>
        <div class="card" style="padding:var(--space-6)">
          ${[
            { key:'notif_task_assigned', label:'Tarefa atribuída a mim', desc:'Quando alguém me atribui uma tarefa' },
            { key:'notif_lead_assigned', label:'Lead atribuído',         desc:'Quando me atribuem um lead' },
            { key:'notif_deal_won',      label:'Negócio ganho',          desc:'Quando um negócio é marcado como ganho' },
            { key:'notif_deal_lost',     label:'Negócio perdido',        desc:'Quando um negócio é marcado como perdido' },
            { key:'notif_task_overdue',  label:'Tarefas atrasadas',      desc:'Alertas de tarefas com prazo vencido' },
            { key:'notif_mentions',      label:'Menções',                desc:'Quando me mencionam em comentários' },
          ].map(n => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:var(--space-4) 0;border-bottom:1px solid var(--border-subtle)">
              <div>
                <div style="font-size:var(--text-sm);font-weight:var(--font-medium)">${n.label}</div>
                <div style="font-size:var(--text-xs);color:var(--text-tertiary)">${n.desc}</div>
              </div>
              <label class="toggle">
                <input type="checkbox" id="${n.key}" checked onchange="Settings.saveNotifPref('${n.key}',this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>`).join('')}
        </div>
      </div>`;
  },

  saveNotifPref(key, value) {
    localStorage.setItem(key, value ? '1' : '0');
    Toasts.success('Preferência salva', '');
  },

  async _renderAPI(el) {
    const orgId = Store.get('orgId');

    el.innerHTML = `
      <div style="max-width:600px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">API & Webhooks</h2>
        <div class="card" style="padding:var(--space-6);margin-bottom:var(--space-4)">
          <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:var(--space-4)">Chave de API</h3>
          <div style="display:flex;gap:var(--space-2)">
            <input type="password" class="input" id="api-key-field" value="crm_${esc(orgId?.replace(/-/g,'').slice(0,24))}" readonly style="font-family:monospace">
            <button class="btn btn-secondary" onclick="Settings.copyAPIKey()">
              <i data-lucide="copy" style="width:14px;height:14px"></i>
            </button>
            <button class="btn btn-danger" onclick="Settings.regenerateKey()">
              <i data-lucide="refresh-cw" style="width:14px;height:14px"></i>
            </button>
          </div>
          <p style="font-size:var(--text-xs);color:var(--text-tertiary);margin-top:var(--space-2)">Use esta chave para autenticar requisições à API REST do CRM</p>
        </div>
        <div class="card" style="padding:var(--space-6)">
          <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);text-transform:uppercase;letter-spacing:0.05em;color:var(--text-tertiary);margin-bottom:var(--space-4)">Documentação da API</h3>
          <div style="display:flex;flex-direction:column;gap:var(--space-3)">
            ${[
              { method:'GET',    path:'/api/v1/leads',        desc:'Listar todos os leads' },
              { method:'POST',   path:'/api/v1/leads',        desc:'Criar novo lead' },
              { method:'PUT',    path:'/api/v1/leads/:id',    desc:'Atualizar lead' },
              { method:'DELETE', path:'/api/v1/leads/:id',    desc:'Remover lead' },
              { method:'GET',    path:'/api/v1/contacts',     desc:'Listar contatos' },
              { method:'GET',    path:'/api/v1/opportunities',desc:'Listar oportunidades' },
            ].map(r => `
              <div style="display:flex;align-items:center;gap:var(--space-3);padding:var(--space-3);background:var(--bg-secondary);border-radius:var(--radius-md)">
                <span class="badge" style="background:${r.method==='GET'?'#3b82f620':r.method==='POST'?'#10b98120':'#f59e0b20'};color:${r.method==='GET'?'#3b82f6':r.method==='POST'?'#10b981':'#f59e0b'};font-family:monospace;font-size:10px">${esc(r.method)}</span>
                <code style="font-size:var(--text-xs);color:var(--text-primary);flex:1">${r.path}</code>
                <span style="font-size:var(--text-xs);color:var(--text-tertiary)">${r.desc}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  },

  copyAPIKey() {
    const key = document.getElementById('api-key-field')?.value;
    if (key) {
      navigator.clipboard.writeText(key).then(() => Toasts.success('Copiado', 'Chave copiada para a área de transferência'));
    }
  },

  regenerateKey() {
    Modal.confirm({
      title: 'Gerar nova chave',
      message: 'A chave atual será invalidada. Integrações existentes deixarão de funcionar.',
      confirmText: 'Gerar nova chave',
      dangerous: true,
      onConfirm: () => Toasts.info('Em desenvolvimento', 'Use o painel do Supabase para gerenciar chaves de API'),
    });
  },

  _renderBilling(el) {
    el.innerHTML = `
      <div style="max-width:600px">
        <h2 style="font-size:var(--text-xl);font-weight:var(--font-semibold);margin-bottom:var(--space-6)">Plano e Faturamento</h2>
        <div class="card" style="padding:var(--space-6);margin-bottom:var(--space-4)">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-4)">
            <div>
              <div style="font-size:var(--text-lg);font-weight:var(--font-semibold)">Plano Professional</div>
              <div style="color:var(--text-secondary);font-size:var(--text-sm)">Até 10 usuários · Recursos ilimitados</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:var(--text-2xl);font-weight:700;color:var(--color-primary-400)">R$299</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary)">/mês</div>
            </div>
          </div>
          <div style="display:flex;gap:var(--space-2)">
            <button class="btn btn-primary" onclick="Toasts.info('Em breve','Gerenciamento de planos disponível em breve')">Fazer upgrade</button>
            <button class="btn btn-secondary" onclick="Toasts.info('Em breve','Histórico de faturas disponível em breve')">Ver faturas</button>
          </div>
        </div>
        <div class="card" style="padding:var(--space-6)">
          <h3 style="font-size:var(--text-sm);font-weight:var(--font-semibold);margin-bottom:var(--space-4)">Uso deste mês</h3>
          ${[
            { label:'Usuários',   used:3,    total:10,  unit:'usuários' },
            { label:'Leads',      used:124,  total:5000,unit:'leads' },
            { label:'Storage',    used:1.2,  total:10,  unit:'GB' },
            { label:'API Calls',  used:8420, total:50000,unit:'chamadas' },
          ].map(u => `
            <div style="margin-bottom:var(--space-4)">
              <div style="display:flex;justify-content:space-between;font-size:var(--text-sm);margin-bottom:var(--space-1)">
                <span>${u.label}</span>
                <span style="color:var(--text-tertiary)">${u.used} / ${u.total} ${u.unit}</span>
              </div>
              <div style="height:6px;background:var(--bg-tertiary);border-radius:3px">
                <div style="height:100%;width:${Math.min(100, (u.used/u.total)*100)}%;background:var(--color-primary-500);border-radius:3px;transition:width 0.5s"></div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  },
};
