// === SCREEN ROUTER ===
function showScreen(name) {
  document.getElementById('screen-login').style.display = name === 'login' ? 'flex' : 'none';
  document.getElementById('screen-register').style.display = name === 'register' ? 'flex' : 'none';
  document.getElementById('screen-dashboard').style.display = name === 'dashboard' ? 'block' : 'none';
}

// === LOGO SVG ===
function logoSVG(size = 32) {
  const scale = size / 34;
  const w = Math.round(268 * scale);
  return `<svg width="${w}" height="${size}" viewBox="0 0 268 34" xmlns="http://www.w3.org/2000/svg">
    <g stroke="#f97316" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="26" height="23" rx="3"/>
      <line x1="16" y1="5" x2="16" y2="2"/>
      <circle cx="16" cy="1" r="1.5" fill="#f97316"/>
      <rect x="5" y="10" width="7" height="6" rx="1"/>
      <circle cx="8.5" cy="13" r="1" fill="#f97316"/>
      <rect x="20" y="10" width="7" height="6" rx="1"/>
      <circle cx="23.5" cy="13" r="1" fill="#f97316"/>
      <rect x="6" y="21" width="20" height="4" rx="1"/>
      <line x1="11" y1="21" x2="11" y2="25"/>
      <line x1="16" y1="21" x2="16" y2="25"/>
      <line x1="21" y1="21" x2="21" y2="25"/>
      <line x1="3" y1="16" x2="1" y2="16"/>
      <line x1="29" y1="16" x2="31" y2="16"/>
    </g>
    <text x="40" y="27" font-family="Arial Black, sans-serif" font-weight="900" font-size="26" fill="#f97316">AUTCHRONOS</text>
  </svg>`;
}

// === REGISTER SCREEN ===
function renderRegister() {
  document.getElementById('screen-register').className = 'auth-screen';
  document.getElementById('screen-register').innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">${logoSVG(28)}</div>
      <div class="auth-title">Criar Conta</div>
      <div class="auth-subtitle">ESVJ - Gestão de Almoxarifado</div>
      <div class="auth-error" id="reg-error"></div>
      <div class="form-group">
        <label for="reg-nome">Nome completo</label>
        <input type="text" id="reg-nome" placeholder="Seu nome completo" autocomplete="name">
        <div class="form-error" id="err-nome"></div>
      </div>
      <div class="form-group">
        <label for="reg-email">E-mail</label>
        <input type="email" id="reg-email" autocomplete="email" placeholder="seu@email.com">
        <div class="form-error" id="err-email"></div>
      </div>
      <div class="form-group">
        <label for="reg-senha">Senha</label>
        <input type="password" id="reg-senha" autocomplete="new-password" placeholder="Mínimo 6 caracteres">
        <div class="form-error" id="err-senha"></div>
      </div>
      <div class="form-group">
        <label for="reg-confirma">Confirmar senha</label>
        <input type="password" id="reg-confirma" autocomplete="new-password">
        <div class="form-error" id="err-confirma"></div>
      </div>
      <button class="btn btn-primary" onclick="doRegister()">Criar conta</button>
      <div class="auth-links">
        Já tem conta? <a href="#" onclick="renderLogin();showScreen('login');return false">Entrar</a>
      </div>
    </div>
  `;
  document.getElementById('reg-confirma').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}
function clearFieldError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible');
}

async function doRegister() {
  const nome = document.getElementById('reg-nome').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const senha = document.getElementById('reg-senha').value;
  const confirma = document.getElementById('reg-confirma').value;
  let valid = true;

  ['err-nome', 'err-email', 'err-senha', 'err-confirma'].forEach(clearFieldError);
  const regErr = document.getElementById('reg-error');
  regErr.classList.remove('visible');

  if (!nome) { showFieldError('err-nome', 'Este campo é obrigatório.'); valid = false; }
  else if (nome.length > 100) { showFieldError('err-nome', 'Máximo de 100 caracteres.'); valid = false; }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showFieldError('err-email', 'Informe um e-mail válido.'); valid = false;
  }

  if (!senha) { showFieldError('err-senha', 'Este campo é obrigatório.'); valid = false; }
  else if (senha.length < 6) { showFieldError('err-senha', 'Mínimo de 6 caracteres.'); valid = false; }

  if (!confirma) { showFieldError('err-confirma', 'Este campo é obrigatório.'); valid = false; }
  else if (senha && senha !== confirma) { showFieldError('err-confirma', 'As senhas não coincidem.'); valid = false; }

  if (!valid) return;

  const btn = document.querySelector('button[onclick="doRegister()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando conta...'; }

  const { error } = await _sb.auth.signUp({
    email,
    password: senha,
    options: { data: { nome_completo: nome } }
  });

  if (error) {
    regErr.textContent = error.message.includes('already registered')
      ? 'Este e-mail já está cadastrado.'
      : error.message;
    regErr.classList.add('visible');
    if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; }
    return;
  }

  // Aguarda trigger criar o perfil
  await new Promise(r => setTimeout(r, 1000));

  const session = await getAppSession();
  if (!session) {
    regErr.textContent = 'Conta criada! Verifique seu e-mail para confirmar o cadastro.';
    regErr.style.background = '#dcfce7'; regErr.style.color = 'var(--green)';
    regErr.classList.add('visible');
    if (btn) { btn.disabled = false; btn.textContent = 'Criar conta'; }
    return;
  }

  dispararWebhook({
    evento: 'usuario_criado',
    nome: nome,
    data: new Date().toISOString()
  });

  await loadAllData();
  showLoadingScreen(session);
}

// === LOGIN SCREEN ===
function renderLogin() {
  document.getElementById('screen-login').className = 'auth-screen';
  document.getElementById('screen-login').innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">${logoSVG(28)}</div>
      <div class="auth-title">Acesso ao Sistema</div>
      <div class="auth-subtitle">ESVJ - Gestão de Almoxarifado</div>
      <div class="auth-error" id="login-error"></div>
      <div class="form-group">
        <label for="login-email">E-mail</label>
        <input type="email" id="login-email" autocomplete="email" placeholder="seu@email.com">
      </div>
      <div class="form-group">
        <label for="login-senha">Senha</label>
        <input type="password" id="login-senha" autocomplete="current-password" placeholder="Digite sua senha">
      </div>
      <button class="btn btn-primary" onclick="doLogin()">Entrar</button>
      <div class="auth-links" style="margin-top:0.75rem">
        <a href="#" onclick="doForgotPassword();return false">Esqueci minha senha</a>
      </div>
      <div class="auth-links">
        Não tem conta? <a href="#" onclick="renderRegister();showScreen('register');return false">Criar conta</a>
      </div>
    </div>
  `;
  document.getElementById('login-senha').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const err = document.getElementById('login-error');
  err.classList.remove('visible');

  const btn = document.querySelector('button[onclick="doLogin()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  const { error } = await _sb.auth.signInWithPassword({ email, password: senha });
  if (error) {
    err.textContent = 'E-mail ou senha incorretos.';
    err.classList.add('visible');
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    return;
  }

  const session = await getAppSession();
  if (!session) {
    err.textContent = 'Erro ao carregar perfil. Tente novamente.';
    err.classList.add('visible');
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
    return;
  }

  await loadAllData();
  showLoadingScreen(session);
}

async function doForgotPassword() {
  const email = document.getElementById('login-email')?.value.trim();
  if (!email) { alert('Informe seu e-mail no campo acima antes de clicar em "Esqueci minha senha".'); return; }
  const { error } = await _sb.auth.resetPasswordForEmail(email);
  if (error) { alert('Erro: ' + error.message); return; }
  alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
}

// === MENU ADMIN MOBILE ===
function toggleAdminMenu() {
  document.getElementById('admin-btns')?.classList.toggle('open');
}
function closeAdminMenu() {
  document.getElementById('admin-btns')?.classList.remove('open');
}
async function toggleEmCalibracao(id) {
  if (!guardAdmin()) return;
  const equip = getEquipamentos().find(e => e.id === id);
  if (!equip) return;
  const novoStatus = !equip.emCalibracao;
  const { error } = await _sb.from('equipamentos_calibracao').update({ em_calibracao: novoStatus }).eq('id', id);
  if (error) { showToast('Erro ao atualizar: ' + error.message, 'error'); return; }
  dispararWebhook({
    evento: 'calibracao_status',
    equipamento: equip.nome,
    identificacao: equip.identificacao || null,
    categoria: equip.categoria || null,
    responsavel: equip.responsavel || null,
    data_ultima_calibracao: equip.dataUltimaCalibracao || null,
    data_proxima_calibracao: equip.dataProximaCalibracao || null,
    status: novoStatus ? 'Em Calibração' : 'Retornou da Calibração',
    usuario: currentSession?.nomeCompleto || 'admin',
    data: new Date().toISOString()
  });
  await loadAllData();
  renderEquipamentos();
  renderCards();
  updateTabIndicators();
  showToast(novoStatus ? 'Equipamento marcado como em calibração.' : 'Equipamento retornou da calibração!');
}

function toggleMatFilters() {
  const el = document.getElementById('mat-filters');
  const btn = document.getElementById('btn-filter-toggle');
  if (!el) return;
  el.classList.toggle('open');
  if (btn) btn.textContent = el.classList.contains('open') ? 'Filtros ▴' : 'Filtros ▾';
}
document.addEventListener('click', e => {
  const menu = document.getElementById('admin-btns');
  const toggle = document.getElementById('btn-admin-toggle');
  if (menu && !menu.contains(e.target) && toggle && !toggle.contains(e.target)) {
    menu.classList.remove('open');
  }
  if (!e.target.closest('.row-menu-wrap')) {
    document.querySelectorAll('.row-menu.open').forEach(m => m.classList.remove('open'));
  }
});

