// === SUPABASE CLIENT ===
const _sb = window.supabase.createClient(
  'https://qiuugdcueuflrymxfsou.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpdXVnZGN1ZXVmbHJ5bXhmc291Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MjI1MjYsImV4cCI6MjA5MzI5ODUyNn0.Q_DgNBT-NmBuhQLU4ZPvzAsFJemoS5CAABTxeont9rE',
  { auth: { persistSession: true, autoRefreshToken: true } }
);

// === CAUTELA CRYPTO ===
// SHA-256 sem salt — usado apenas em payloads de webhook, nunca para autenticação
async function hashCPF(cpf) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(cpf));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function derivarHash(senha, salt) {
  if (!salt) throw new Error('derivarHash: salt obrigatório');
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMat, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// === WEBHOOK ===
const WEBHOOK_URL = 'https://webhook01.autchronos.site/webhook/1e8dfa5e-e446-4828-9532-570f9a11ff81';
async function dispararWebhook(payload) {
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, timestamp: new Date().toISOString() })
    });
  } catch (e) {
    console.warn('Webhook falhou:', e.message);
  }
}


// === IN-MEMORY CACHE ===
let _materiais = [], _categorias = [], _movimentacoes = [], _profiles = [], _equipamentos = [];
let _colaboradores = [], _ferramentas_cautela = [], _cautelas = [];

// Supabase snake_case → camelCase
const normMaterial = m => ({
  id: m.id, nome: m.nome, categoria: m.categoria,
  quantidade: +m.quantidade, unidade: m.unidade,
  estoqueMinimo: +m.estoque_minimo, valorUnitario: +m.valor_unitario,
  localizacao: m.localizacao || ''
});
const normMovimento = m => ({
  id: m.id, materialId: m.material_id, materialNome: m.material_nome,
  tipo: m.tipo, quantidade: +m.quantidade, data: m.data,
  registradoPor: m.registrado_por, retiradorPor: m.retirado_por || '',
  destino: m.destino || '', observacao: m.observacao || ''
});
const normProfile = p => ({ id: p.id, nomeCompleto: p.nome_completo, papel: p.papel });
const normEquipamento = e => ({
  id: e.id, nome: e.nome, identificacao: e.identificacao || '',
  categoria: e.categoria, numeroCertificado: e.numero_certificado || '',
  certificadoPath: e.certificado_path || '',
  dataUltimaCalibracao: e.data_ultima_calibracao,
  validadeMeses: +e.validade_meses,
  dataProximaCalibracao: e.data_proxima_calibracao,
  responsavel: e.responsavel || '',
  emCalibracao: !!e.em_calibracao
});

const normColaborador = c => ({
  id: c.id, nome: c.nome, cpf: c.cpf, setor: c.setor || '', createdAt: c.created_at
});
const normFerramentaCautela = f => ({
  id: f.id, nome: f.nome, codigo: f.codigo || '', categoria: f.categoria || '',
  quantidadeTotal: f.quantidade_total, quantidadeDisponivel: f.quantidade_disponivel,
  createdAt: f.created_at
});
const normCautela = c => ({
  id: c.id,
  colaboradorId: c.colaborador_id, colaboradorNome: c.colaborador_nome,
  ferramentaId: c.ferramenta_id, ferramentaNome: c.ferramenta_nome,
  ferramentaCodigo: c.ferramenta_codigo || '',
  setor: c.setor || '', quantidade: c.quantidade ?? 1, observacao: c.observacao || '',
  dataRetirada: c.data_retirada, dataDevolucao: c.data_devolucao || null,
  condicaoDevolucao: c.condicao_devolucao || null, alertaEnviado: !!c.alerta_enviado
});

// Getters síncronos (trabalham no cache)
const getMateriais = () => _materiais;
const getCategorias = () => _categorias;
const getUsuarios = () => _profiles;
const getMovimentacoes = () => _movimentacoes;
const getEquipamentos = () => _equipamentos;
const getColaboradores = () => _colaboradores;
const getFerramentasCautela = () => _ferramentas_cautela;
const getCautelas = () => _cautelas;

// Carrega todos os dados do Supabase para o cache
async function loadAllData() {
  const [mr, cr, movr, pr, er, colr, ferr, cautr] = await Promise.all([
    _sb.from('materiais').select('*').order('id'),
    _sb.from('categorias').select('nome').order('nome'),
    _sb.from('movimentacoes').select('*').order('data', { ascending: false }).limit(2000),
    _sb.from('profiles').select('*').order('nome_completo'),
    _sb.from('equipamentos_calibracao').select('*').order('data_proxima_calibracao'),
    _sb.from('colaboradores').select('id, nome, cpf, setor, created_at').order('nome'),
    _sb.from('ferramentas_cautela').select('*').order('nome'),
    _sb.from('cautelas').select('*').order('data_retirada', { ascending: false })
  ]);

  // Carrega o que conseguir; loga e exibe qual tabela falhou
  const tableResults = { materiais: mr, categorias: cr, movimentacoes: movr, profiles: pr,
    equipamentos_calibracao: er, colaboradores: colr, ferramentas_cautela: ferr, cautelas: cautr };
  const errs = Object.entries(tableResults).filter(([, r]) => r.error);
  if (errs.length) {
    errs.forEach(([t, r]) => console.error(`loadAllData [${t}]:`, r.error.message));
    showToast(`Erro ao carregar: ${errs.map(([t]) => t).join(', ')}`, 'error');
  }

  if (!mr.error)   _materiais           = mr.data.map(normMaterial);
  if (!cr.error)   _categorias          = cr.data.map(c => c.nome);
  if (!movr.error) _movimentacoes       = movr.data.map(normMovimento);
  if (!pr.error)   _profiles            = pr.data.map(normProfile);
  if (!er.error)   _equipamentos        = er.data.map(normEquipamento);
  if (!colr.error) _colaboradores       = colr.data.map(normColaborador);
  if (!ferr.error) _ferramentas_cautela = ferr.data.map(normFerramentaCautela);
  if (!cautr.error) _cautelas           = cautr.data.map(normCautela);
}

// === SESSION ===
async function getAppSession() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return null;
  const { data: profile } = await _sb.from('profiles')
    .select('nome_completo, papel')
    .eq('id', session.user.id)
    .single();
  if (!profile) return null;
  return {
    usuarioId: session.user.id,
    email: session.user.email,
    nomeCompleto: profile.nome_completo,
    papel: profile.papel
  };
}

// === HELPERS ===
function parseDecimal(str) {
  const s = String(str).trim();
  // pt-BR format (comma as decimal separator): strip thousand-separator dots first
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  return parseFloat(normalized) || 0;
}
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const formatBRL = v => brl.format(v);
const fmtBRL = v => `<span class="brl-wrap"><span class="brl-real">${formatBRL(v)}</span><span class="brl-mask">R$&nbsp;••••••</span></span>`;

function getSaldoIcon() {
  const oculto = document.body.classList.contains('saldo-oculto');
  return oculto
    ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
        <line x1="1" y1="1" x2="23" y2="23"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
       </svg>`;
}

function toggleSaldo() {
  document.body.classList.toggle('saldo-oculto');
  localStorage.setItem('saldoOculto', document.body.classList.contains('saldo-oculto') ? '1' : '0');
  const btn = document.getElementById('btn-saldo');
  if (btn) btn.innerHTML = getSaldoIcon();
}

function calcStatus(quantidade, estoqueMinimo) {
  if (quantidade >= estoqueMinimo) return 'OK';
  if (quantidade >= estoqueMinimo * 0.5) return 'Baixo';
  return 'Crítico';
}

function getInitials(nomeCompleto) {
  const words = (nomeCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '??';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// === HTML ESCAPE ===
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function guardAdmin() {
  return !!(currentSession && currentSession.papel === 'admin');
}

function showToast(msg, type = 'success') {
  let c = document.getElementById('toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'toast-container'; c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => {
    t.style.animation = 'toast-out 0.3s ease forwards';
    setTimeout(() => t.remove(), 300);
  }, 2800);
}

function toggleRowMenu(id) {
  document.querySelectorAll('.row-menu').forEach(m => { if (m.id !== 'rm-' + id) m.classList.remove('open'); });
  const menu = document.getElementById('rm-' + id);
  if (!menu) return;
  if (menu.classList.contains('open')) { menu.classList.remove('open'); return; }
  const trigger = menu.previousElementSibling;
  if (trigger) {
    const r = trigger.getBoundingClientRect();
    menu.style.top = (r.bottom + 3) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
  }
  menu.classList.add('open');
}

function updateTabIndicators() {
  const matCount = getMateriais().filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK').length;
  const calibCount = getEquipamentos().filter(e => !e.emCalibracao && calcCalibStatus(e.dataProximaCalibracao).days <= 30).length;
  const now = new Date();
  const cautelaCount = getCautelas().filter(c =>
    !c.dataDevolucao && (now - new Date(c.dataRetirada)) > 24 * 60 * 60 * 1000
  ).length;
  ['dot-dtab-materiais','dot-tab-materiais','dot-tab-alertas'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', matCount > 0);
  });
  ['dot-dtab-calibracoes','dot-tab-calibracoes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', calibCount > 0);
  });
  ['dot-dtab-cautela','dot-tab-cautela'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('visible', cautelaCount > 0);
  });
}

function updateReposicaoBadge() {
  const count = getMateriais().filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK').length;
  const btn = document.getElementById('btn-reposicao');
  if (!btn) return;
  if (count > 0) {
    btn.textContent = `⚠ Reposição (${count})`;
    btn.style.cssText = 'width:auto;background:var(--red-50);color:var(--red);border-color:var(--red)';
  } else {
    btn.textContent = '⚠ Reposição';
    btn.style.cssText = 'width:auto';
  }
}

async function recordMovimento(materialId, materialNome, qtdAnterior, qtdNova, registradoPor, observacao = '') {
  const diff = qtdNova - qtdAnterior;
  if (diff === 0) return;
  const { error } = await _sb.from('movimentacoes').insert({
    material_id: materialId,
    material_nome: materialNome,
    tipo: diff > 0 ? 'entrada' : 'saída',
    quantidade: Math.abs(diff),
    registrado_por: registradoPor,
    observacao: observacao || null
  });
  if (error) console.error('recordMovimento:', error.message);
}

// === TEMA ===
function getThemeIcon() {
  const dark = document.documentElement.dataset.theme === 'dark';
  // Sol: mostrado no dark mode para voltar ao claro
  // Lua: mostrada no light mode para ir ao escuro
  return dark
    ? `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/>
        <line x1="12" y1="1" x2="12" y2="4"/>
        <line x1="12" y1="20" x2="12" y2="23"/>
        <line x1="1" y1="12" x2="4" y2="12"/>
        <line x1="20" y1="12" x2="23" y2="12"/>
        <line x1="4.93" y1="4.93" x2="7.05" y2="7.05"/>
        <line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/>
        <line x1="4.93" y1="19.07" x2="7.05" y2="16.95"/>
        <line x1="16.95" y1="7.05" x2="19.07" y2="4.93"/>
       </svg>`
    : `<svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
       </svg>`;
}
function toggleTheme() {
  const isDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = isDark ? '' : 'dark';
  localStorage.setItem('theme', isDark ? 'light' : 'dark');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.innerHTML = getThemeIcon();
}
(function applyTheme() {
  if (localStorage.getItem('theme') === 'dark') document.documentElement.dataset.theme = 'dark';
  if (localStorage.getItem('saldoOculto') !== '0') document.body.classList.add('saldo-oculto');
})();

