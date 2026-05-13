// === DASHBOARD ===
let currentSession = null;
let currentPeriod = 'hoje';
let currentMovCategory = '';
let currentMovSearch = '';
let currentMovTipo = '';
let currentCalibCat = '';
let currentCalibStatus = '';
let currentCalibPage = 1;
let currentCalibView = 'dashboard';
const CALIB_PER_PAGE = 15;
let currentMovPage = 1;
const MOV_PER_PAGE = 25;
let currentMatPage = 1;
const MAT_PER_PAGE = 15;
let currentCustomStart = '';
let currentCustomEnd = '';
let _realtimeChannel = null;
let _cautelaAlertInterval = null;
let _cautelaSubTab = 'painel';
let _histMovs = [];
let _histMaterial = null;
let histPage = 1;
const HIST_PER_PAGE = 20;

function renderDashboard(session) {
  currentSession = session;
  const isAdmin = session.papel === 'admin';

  document.getElementById('screen-dashboard').innerHTML = `
    <header class="dashboard-header">
      <div class="header-left"><div class="logo-brand">${logoSVG(22)}<div class="logo-tagline">ESVJ - Gestão de Almoxarifado</div></div></div>
      <div class="header-right">
        <div class="user-info">
          <div class="avatar">${esc(getInitials(session.nomeCompleto))}</div>
          <span class="user-name">${esc(session.nomeCompleto)}</span>
        </div>
        ${isAdmin ? `
        <div class="admin-btns" id="admin-btns">
          <button class="btn-logout" onclick="openUsuariosModal();closeAdminMenu()">Usuários</button>
          <button class="btn-logout" onclick="exportBackup();closeAdminMenu()">Backup</button>
          <label class="btn-logout" style="cursor:pointer">Restaurar<input type="file" accept=".json" style="display:none" onchange="importBackup(this)"></label>
        </div>
        <button class="btn-logout btn-admin-toggle" id="btn-admin-toggle" onclick="toggleAdminMenu()" title="Opções admin">⋮</button>
        ` : ''}
        <button class="btn-logout btn-theme" onclick="toggleSaldo()" id="btn-saldo" title="Mostrar/ocultar valores">${getSaldoIcon()}</button>
        <button class="btn-logout btn-theme" onclick="toggleTheme()" id="btn-theme" title="Alternar modo noturno">${getThemeIcon()}</button>
        <button class="btn-logout" onclick="doLogout()">Sair</button>
      </div>
    </header>
    <nav class="desktop-tabs">
      <button class="desktop-tab-btn active" id="dtab-materiais" onclick="setMobileTab('materiais')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
        Materiais<span class="tab-dot" id="dot-dtab-materiais"></span>
      </button>
      <button class="desktop-tab-btn" id="dtab-calibracoes" onclick="setMobileTab('calibracoes')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93A10 10 0 1 0 4.93 19.07"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>
        Calibrações<span class="tab-dot" id="dot-dtab-calibracoes"></span>
      </button>
      <button class="desktop-tab-btn" id="dtab-movimentacoes" onclick="setMobileTab('movimentacoes')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
        Movimentações
      </button>
      <button class="desktop-tab-btn" id="dtab-cautela" onclick="setMobileTab('cautela')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Cautela<span class="tab-dot" id="dot-dtab-cautela"></span>
      </button>
    </nav>
    <div class="dashboard-body">

      <!-- Resumo do dia -->
      <div id="day-summary" class="day-summary"></div>

      <!-- Seção: Materiais -->
      <div class="mobile-section active" id="section-materiais">
        <div id="cards-grid" class="cards-grid"></div>
        <div id="alertas-section"></div>
        <div class="table-section">
          <div class="table-toolbar">
            <div class="toolbar-main">
              <input class="search-input" type="text" id="filter-nome" placeholder="Buscar por nome..." oninput="currentMatPage=1;renderMaterialsTable()">
              <button class="btn btn-secondary btn-sm btn-filter-toggle" id="btn-filter-toggle" onclick="toggleMatFilters()">Filtros ▾</button>
            </div>
            <div class="toolbar-filters" id="mat-filters">
              <select id="filter-cat" onchange="currentMatPage=1;renderMaterialsTable()">
                <option value="">Todas as categorias</option>
              </select>
              <select id="filter-status" onchange="currentMatPage=1;renderMaterialsTable()">
                <option value="">Todos os status</option>
                <option value="OK">OK</option>
                <option value="Baixo">Baixo</option>
                <option value="Crítico">Crítico</option>
              </select>
            </div>
            <div class="table-actions" style="margin-left:auto">
              ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openCategoryModal()">Categorias</button>
              <button class="btn btn-primary btn-sm" style="width:auto" onclick="openMaterialModal()">+ Material</button>` : ''}
              <button class="btn btn-secondary btn-sm" style="width:auto" id="btn-reposicao" onclick="openReposicaoModal()" title="Lista de materiais em Baixo ou Crítico">&#9888; Reposição</button>
              <button class="btn btn-secondary btn-sm" style="width:auto" onclick="exportMateriaisCSV()" title="Exportar lista atual para Excel/CSV">&#8595; CSV</button>
            </div>
          </div>
          <div class="status-legend">
            <span>Status:</span>
            <span class="badge badge-ok has-tip" data-tip="Quantidade ≥ estoque mínimo">OK</span>
            <span class="badge badge-baixo has-tip" data-tip="Entre 50% e 100% do estoque mínimo">Baixo</span>
            <span class="badge badge-critico has-tip" data-tip="Abaixo de 50% do estoque mínimo">Crítico</span>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th><th>Nome</th><th>Categoria</th>
                  <th>Quantidade</th><th>Unidade</th><th>Est. Mínimo</th>
                  <th>Status</th><th>Ações</th>
                </tr>
              </thead>
              <tbody id="materials-tbody"></tbody>
            </table>
          </div>
          <div class="mat-cards" id="materials-cards"></div>
          <div id="mat-pagination" class="pagination"></div>
        </div>
      </div>

      <!-- Seção: Alertas (mobile) -->
      <div class="mobile-section" id="section-alertas">
        <div id="alertas-section-mobile" style="padding:0.75rem"></div>
      </div>

      <!-- Seção: Calibrações -->
      <div class="mobile-section" id="section-calibracoes">
        <div class="table-section" style="margin-bottom:2rem">
          <!-- Toolbar principal -->
          <div class="table-toolbar" style="flex-wrap:wrap;gap:0.5rem">
            <!-- Filtros: visíveis apenas na view lista -->
            <div id="calib-filters-group" style="display:none;gap:0.5rem;flex:1;flex-wrap:wrap;min-width:0;align-items:center">
              <input class="search-input" type="text" id="calib-filter-nome"
                placeholder="Buscar por nome, certificado ou ID..."
                oninput="renderEquipamentos()" style="flex:1;min-width:160px">
              <select id="calib-filter-cat" onchange="setCalibCat(this.value)"
                style="padding:0.5rem 0.75rem;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:0.875rem;background:var(--white);min-width:120px">
                <option value="">Todas as categorias</option>
              </select>
              <select id="calib-filter-status" onchange="setCalibStatus(this.value)"
                style="padding:0.5rem 0.75rem;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:0.875rem;background:var(--white);min-width:150px">
                <option value="">Todos os status</option>
                <option value="vencido">Vencidos</option>
                <option value="proximo30">Vence em até 30 dias</option>
                <option value="proximo90">Vence em até 3 meses</option>
                <option value="ok">OK</option>
                <option value="em_calibracao">Em Calibração</option>
              </select>
            </div>
            <!-- Ações: sempre visíveis -->
            <div style="display:flex;gap:0.5rem;flex-shrink:0;flex-wrap:wrap;align-items:center;margin-left:auto">
              <div class="view-toggle">
                <button class="view-toggle-btn active" data-view="dashboard" onclick="setCalibView('dashboard')">&#128200; Dashboard</button>
                <button class="view-toggle-btn" data-view="lista" onclick="setCalibView('lista')">&#9776; Lista</button>
              </div>
              ${isAdmin ? `<button class="btn btn-secondary btn-sm" style="width:auto" onclick="openImportCalibModal()">&#8679; Importar</button>
              <button class="btn btn-primary btn-sm" style="width:auto" onclick="openEquipamentoModal()">+ Equipamento</button>` : ''}
              <button class="btn btn-secondary btn-sm" style="width:auto" onclick="exportCalibCSV()" title="Exportar para Excel">&#8595; CSV</button>
            </div>
          </div>

          <!-- VIEW: Dashboard -->
          <div id="calib-dashboard" style="padding-bottom:1.25rem"></div>

          <!-- VIEW: Lista (oculto por padrão) -->
          <div id="calib-lista-content" style="display:none">
            <div class="status-legend">
              <span>Status:</span>
              <span class="badge badge-calib-ok has-tip" data-tip="Próxima calibração em mais de 30 dias">OK</span>
              <span class="badge badge-calib-proximo has-tip" data-tip="Calibração vence nos próximos 30 dias">Vence em breve</span>
              <span class="badge badge-calib-vencido has-tip" data-tip="Prazo de calibração ultrapassado">Vencido</span>
              <span class="badge badge-calib-em-calib has-tip" data-tip="Equipamento enviado para calibração">Em Calibração</span>
            </div>
            <div id="calib-alertas" style="padding:0 1.25rem"></div>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Equipamento</th><th>Identificação</th><th>Categoria</th>
                    <th>Certificado</th><th>Última Calib.</th><th>Próxima Calib.</th>
                    <th>Validade</th><th>Responsável</th><th>Status</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody id="calib-tbody"></tbody>
              </table>
            </div>
            <div class="calib-cards" id="calib-cards"></div>
            <div id="calib-pagination" class="pagination"></div>
          </div>
        </div>
      </div>

      <!-- Seção: Movimentações -->
      <div class="mobile-section" id="section-movimentacoes">
        <div class="movements-section">
          <div style="padding:1rem 1.25rem;border-bottom:1px solid var(--gray-200)">
            <div class="section-title" style="margin-bottom:0.75rem;padding-left:0.875rem;border-left:3px solid var(--orange)">Movimentações de Estoque</div>
            <div style="display:flex;flex-direction:column;gap:0.5rem">
              <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap">
                <div class="period-filter" style="padding:0;border:none;margin:0">
                  <button class="period-btn active" id="btn-hoje" onclick="setPeriod('hoje')">Hoje</button>
                  <button class="period-btn" id="btn-7d" onclick="setPeriod('7d')">7 dias</button>
                  <button class="period-btn" id="btn-14d" onclick="setPeriod('14d')">14 dias</button>
                  <button class="period-btn" id="btn-30d" onclick="setPeriod('30d')">30 dias</button>
                  <button class="period-btn" id="btn-custom" onclick="setPeriod('custom')">Personalizado</button>
                </div>
                <select id="mov-cat-filter" onchange="setMovCategory(this.value)"
                  style="padding:0.375rem 0.75rem;border:1px solid var(--gray-200);border-radius:var(--radius);font-size:0.875rem;background:var(--white);color:var(--gray-700)">
                  <option value="">Todas as categorias</option>
                </select>
              </div>
              <div class="date-range-row" id="custom-date-range">
                <input type="date" id="custom-start" onchange="applyCustomPeriod()">
                <span>até</span>
                <input type="date" id="custom-end" onchange="applyCustomPeriod()">
              </div>
            </div>
          </div>
          <div id="mov-tracking-panel"></div>
          <div class="chart-container" id="chart-container"></div>
          <div class="chart-summary" id="chart-summary"></div>
          <div class="mov-toolbar">
            <input class="search-input" type="text" id="mov-search" placeholder="Buscar por material..." oninput="setMovSearch(this.value)">
            <select id="mov-tipo-filter" onchange="setMovTipo(this.value)">
              <option value="">Entradas e Saídas</option>
              <option value="entrada">Só Entradas</option>
              <option value="saída">Só Saídas</option>
            </select>
            <button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="exportCSV()">&#8595; Exportar CSV</button>
          </div>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr><th>Data/Hora</th><th>Material</th><th>Tipo</th><th>Quantidade</th><th>Retirado por</th><th>Destino</th></tr>
              </thead>
              <tbody id="movements-tbody"></tbody>
            </table>
          </div>
          <div id="mov-pagination" class="pagination"></div>
        </div>
      </div>

      <!-- Seção: Cautela -->
      <div class="mobile-section" id="section-cautela">
        <!-- populated by renderCautela() -->
      </div>
    </div>

    <!-- Bottom Nav (mobile) -->
    <nav class="bottom-nav">
      <button class="bottom-nav-btn active" id="tab-materiais" onclick="setMobileTab('materiais')">
        <span class="tab-dot" id="dot-tab-materiais"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
        </svg>
        <span>Materiais</span>
      </button>
      <button class="bottom-nav-btn" id="tab-alertas" onclick="setMobileTab('alertas')">
        <span class="tab-dot" id="dot-tab-alertas"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span>Alertas</span>
      </button>
      <button class="bottom-nav-btn" id="tab-movimentacoes" onclick="setMobileTab('movimentacoes')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
        <span>Movimentos</span>
      </button>
      <button class="bottom-nav-btn" id="tab-calibracoes" onclick="setMobileTab('calibracoes')">
        <span class="tab-dot" id="dot-tab-calibracoes"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
        </svg>
        <span>Calibração</span>
      </button>
      <button class="bottom-nav-btn" id="tab-cautela" onclick="setMobileTab('cautela')">
        <span class="tab-dot" id="dot-tab-cautela"></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>Cautela</span>
      </button>
    </nav>

    <!-- FAB (mobile) -->
    <div class="fab-wrap" id="fab-wrap">
      <div class="fab-menu" id="fab-menu">
        ${isAdmin ? `<button class="fab-item" onclick="openEquipamentoModal();closeFab()">+ Equipamento</button>
        <button class="fab-item" onclick="openMaterialModal();closeFab()">+ Material</button>
        <button class="fab-item" onclick="openCategoryModal();closeFab()">Categorias</button>` : ''}
      </div>
      <button class="fab-btn" id="fab-btn" onclick="toggleFab()">+</button>
    </div>
  `;
  // refreshAllSections() is called by the caller AFTER showScreen() so the dashboard
  // is visible and chart container has a valid offsetWidth.
}

async function doLogout() {
  if (_realtimeChannel) { _sb.removeChannel(_realtimeChannel); _realtimeChannel = null; }
  if (_cautelaAlertInterval) { clearInterval(_cautelaAlertInterval); _cautelaAlertInterval = null; }
  await _sb.auth.signOut();
  currentSession = null;
  currentPeriod = 'hoje';
  currentMovCategory = '';
  currentMovSearch = '';
  currentMovTipo = '';
  currentMovPage = 1;
  currentCustomStart = '';
  currentCustomEnd = '';
  currentCalibCat = '';
  currentCalibStatus = '';
  renderLogin();
  showScreen('login');
}

// === CSV EXPORT ===
function downloadCSV(filename, headers, rows) {
  const csvEsc = v => {
    const s = String(v ?? '');
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + [headers, ...rows].map(r => r.map(csvEsc).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

function exportMateriaisCSV() {
  const filterNome = (document.getElementById('filter-nome')?.value || '').toLowerCase();
  const filterCat  = document.getElementById('filter-cat')?.value || '';
  const filterSt   = document.getElementById('filter-status')?.value || '';
  const filtered = getMateriais().filter(m => {
    const st = calcStatus(m.quantidade, m.estoqueMinimo);
    return (!filterNome || m.nome.toLowerCase().includes(filterNome)) &&
           (!filterCat  || m.categoria === filterCat) &&
           (!filterSt   || st === filterSt);
  });
  const headers = ['ID','Nome','Categoria','Quantidade','Unidade','Estoque Mínimo','Status','Valor Unit. (R$)','Valor Total (R$)','Localização'];
  const rows = filtered.map(m => {
    const st = calcStatus(m.quantidade, m.estoqueMinimo);
    return [m.id, m.nome, m.categoria, m.quantidade, m.unidade, m.estoqueMinimo, st,
            m.valorUnitario.toFixed(2), (m.quantidade * m.valorUnitario).toFixed(2), m.localizacao || ''];
  });
  downloadCSV('materiais_' + new Date().toISOString().slice(0,10) + '.csv', headers, rows);
}

function exportCalibCSV() {
  let filtered = getEquipamentos();
  if (currentCalibCat) filtered = filtered.filter(e => e.categoria === currentCalibCat);
  if (currentCalibStatus) {
    filtered = filtered.filter(e => {
      const { days } = calcCalibStatus(e.dataProximaCalibracao);
      if (currentCalibStatus === 'vencido')   return days < 0;
      if (currentCalibStatus === 'proximo30') return days >= 0 && days <= 30;
      if (currentCalibStatus === 'proximo90') return days >= 0 && days <= 90;
      if (currentCalibStatus === 'ok')        return days > 30;
      return true;
    });
  }
  const headers = ['Nome','Identificação','Categoria','Nº Certificado','Última Calibração','Próxima Calibração','Validade (meses)','Responsável','Status','Dias p/ vencimento'];
  const rows = filtered.map(e => {
    const { label, days } = calcCalibStatus(e.dataProximaCalibracao);
    return [e.nome, e.identificacao, e.categoria, e.numeroCertificado,
            fmtDate(e.dataUltimaCalibracao), fmtDate(e.dataProximaCalibracao),
            e.validadeMeses, e.responsavel, label, days];
  });
  downloadCSV('calibracoes_' + new Date().toISOString().slice(0,10) + '.csv', headers, rows);
}

// === STORAGE / CERTIFICADOS ===
async function uploadCertificado(equipamentoId, file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { alert('Arquivo muito grande. Máximo permitido: 5 MB.'); return null; }
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `${equipamentoId}/${Date.now()}.${ext}`;
  const { error } = await _sb.storage.from('certificados').upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
  if (error) { alert('Erro ao enviar arquivo: ' + error.message); return null; }
  return path;
}

async function viewCertificado(path) {
  const { data, error } = await _sb.storage.from('certificados').createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) { alert('Não foi possível abrir o certificado. Verifique se o bucket "certificados" foi criado no Supabase.'); return; }
  window.open(data.signedUrl, '_blank');
}

// === HISTÓRICO DE CALIBRAÇÕES ===
async function openHistoricoCalib(equipamentoId) {
  const equip = getEquipamentos().find(e => e.id === equipamentoId);
  const body  = document.getElementById('historico-calib-body');
  const modal = document.getElementById('modal-historico-calib');
  if (!body || !modal) return;
  document.getElementById('historico-calib-title').textContent = equip ? `Histórico — ${equip.nome}` : 'Histórico de Calibração';
  body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--gray-500)">Carregando...</div>';
  modal.style.display = 'flex';

  const { data, error } = await _sb
    .from('calibracoes_historico')
    .select('*')
    .eq('equipamento_id', equipamentoId)
    .order('data_calibracao', { ascending: false });

  if (error) { body.innerHTML = `<div style="color:var(--red);padding:1rem">Erro: ${esc(error.message)}</div>`; return; }

  if (!data || data.length === 0) {
    body.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--gray-500)">Nenhum registro de calibração encontrado.<br><small>O histórico é criado ao renovar a calibração ou ao adicionar um novo equipamento.</small></div>';
    return;
  }

  body.innerHTML = `<div class="hist-list">${data.map((h, i) => `
    <div class="hist-item">
      <div class="hist-dot-col">
        <div class="hist-dot" style="background:${i === 0 ? 'var(--orange)' : 'var(--gray-400)'}"></div>
        <div class="hist-line"></div>
      </div>
      <div class="hist-content">
        <div class="hist-date">
          ${fmtDate(h.data_calibracao)} &rarr; ${fmtDate(h.data_proxima)}
          ${i === 0 ? '<span class="badge badge-ok" style="font-size:0.7rem">Atual</span>' : ''}
        </div>
        <div class="hist-meta">
          ${h.numero_certificado ? `Cert.: <strong>${esc(h.numero_certificado)}</strong>&ensp;·&ensp;` : ''}
          ${h.responsavel ? `Resp.: <strong>${esc(h.responsavel)}</strong>&ensp;·&ensp;` : ''}
          Registrado por: <strong>${esc(h.registrado_por)}</strong>
          ${h.observacao ? `<br>Obs: ${esc(h.observacao)}` : ''}
        </div>
        ${h.certificado_path ? `<button class="cert-btn" onclick="viewCertificado('${h.certificado_path.replace(/'/g,"\\'")}')">&#128196; Ver certificado</button>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

function closeHistoricoCalib() {
  document.getElementById('modal-historico-calib').style.display = 'none';
}

function stockBadge(status) {
  const cls = { OK: 'badge-ok', Baixo: 'badge-baixo', Crítico: 'badge-critico' }[status] || 'badge-ok';
  const tip = { OK: 'Quantidade ≥ estoque mínimo', Baixo: 'Entre 50% e 100% do estoque mínimo', Crítico: 'Abaixo de 50% do estoque mínimo' }[status] || '';
  return `<span class="badge ${cls} has-tip" data-tip="${tip}">${status}</span>`;
}

function calibBadge(label, cls) {
  const tips = {
    'badge-calib-ok':      'Próxima calibração em mais de 30 dias',
    'badge-calib-proximo': 'Calibração vence nos próximos 30 dias',
    'badge-calib-vencido': 'Prazo de calibração ultrapassado'
  };
  return `<span class="badge ${cls} has-tip" data-tip="${tips[cls] || ''}">${label}</span>`;
}

function navigateToSection(sectionId) {
  setMobileTab(sectionId.replace('section-', ''));
}

function renderDaySummary() {
  const el = document.getElementById('day-summary');
  if (!el) return;

  const materiais  = getMateriais();
  const movs       = getMovimentacoes();
  const equips     = getEquipamentos();
  const today      = new Date();
  const todayStr   = today.toISOString().slice(0, 10);

  const criticos   = materiais.filter(m => calcStatus(m.quantidade, m.estoqueMinimo) === 'Crítico').length;
  const baixos     = materiais.filter(m => calcStatus(m.quantidade, m.estoqueMinimo) === 'Baixo').length;
  const calibVenc  = equips.filter(e => calcCalibStatus(e.dataProximaCalibracao).days < 0).length;
  const calibProx  = equips.filter(e => { const d = calcCalibStatus(e.dataProximaCalibracao).days; return d >= 0 && d <= 30; }).length;
  const movsHoje   = movs.filter(mv => (mv.data || '').slice(0, 10) === todayStr).length;

  const chips = [];

  if (criticos > 0) chips.push(`<span class="ds-chip ds-chip-crit clickable" onclick="navigateToSection('section-materiais')" title="Ir para Materiais">&#9888; ${criticos} crítico${criticos > 1 ? 's' : ''}</span>`);
  if (baixos   > 0) chips.push(`<span class="ds-chip ds-chip-warn clickable" onclick="navigateToSection('section-materiais')" title="Ir para Materiais">&#9660; ${baixos} baixo${baixos > 1 ? 's' : ''}</span>`);
  if (calibVenc > 0) chips.push(`<span class="ds-chip ds-chip-crit clickable" onclick="navigateToSection('section-calibracoes')" title="Ir para Calibrações">&#128197; ${calibVenc} calibração${calibVenc > 1 ? 'ões' : ''} vencida${calibVenc > 1 ? 's' : ''}</span>`);
  if (calibProx > 0) chips.push(`<span class="ds-chip ds-chip-warn clickable" onclick="navigateToSection('section-calibracoes')" title="Ir para Calibrações">&#8987; ${calibProx} calibração${calibProx > 1 ? 'ões' : ''} próxima${calibProx > 1 ? 's' : ''}</span>`);

  const movChip = movsHoje > 0
    ? `<span class="ds-chip ds-chip-neu">&#8645; ${movsHoje} mov. hoje</span>`
    : `<span class="ds-chip ds-chip-neu">Sem movimentações hoje</span>`;

  if (chips.length === 0 && movsHoje === 0) {
    el.innerHTML = `<span class="ds-label">Resumo do dia:</span><span class="ds-chip ds-chip-ok">&#10003; Tudo em ordem</span>${movChip}`;
  } else {
    el.innerHTML = `<span class="ds-label">Resumo do dia:</span>${chips.join('')}${movChip}`;
  }
}

function refreshAllSections() {
  renderDaySummary();
  renderCards();
  renderAlertas();
  renderMaterialsTable();
  renderMovements();
  renderEquipamentos();
  renderCautela();
  updateReposicaoBadge();
  updateTabIndicators();
}

function renderCautela() {
  const sec = document.getElementById('section-cautela');
  if (!sec) return;
  sec.innerHTML = `
    <div style="padding:1rem">
      <div class="cautela-subnav">
        <button class="cautela-subnav-btn ${_cautelaSubTab==='painel'?'active':''}" onclick="setCautelaTab('painel')">Painel</button>
        <button class="cautela-subnav-btn ${_cautelaSubTab==='ferramentas'?'active':''}" onclick="setCautelaTab('ferramentas')">Ferramentas</button>
        <button class="cautela-subnav-btn ${_cautelaSubTab==='colaboradores'?'active':''}" onclick="setCautelaTab('colaboradores')">Colaboradores</button>
      </div>
      <div id="cautela-sub-content"></div>
    </div>`;
  renderCautelaSubTab();
}

function setCautelaTab(tab) {
  _cautelaSubTab = tab;
  document.querySelectorAll('.cautela-subnav-btn').forEach(btn => {
    const btnTab = btn.getAttribute('onclick')?.match(/setCautelaTab\('(\w+)'\)/)?.[1];
    btn.classList.toggle('active', btnTab === tab);
  });
  renderCautelaSubTab();
}

function renderCautelaSubTab() {
  if (_cautelaSubTab === 'painel')              renderCautelaPanel();
  else if (_cautelaSubTab === 'ferramentas')    renderFerramentasTab();
  else if (_cautelaSubTab === 'colaboradores')  renderColaboradoresTab();
}

function renderCautelaPanel() {
  const el = document.getElementById('cautela-sub-content');
  if (!el) return;
  const isAdmin = !!(currentSession && currentSession.papel === 'admin');
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);

  const abertas = getCautelas().filter(c => !c.dataDevolucao);
  const devolvidasHoje = getCautelas().filter(c =>
    c.dataDevolucao && new Date(c.dataDevolucao).toISOString().slice(0, 10) === todayISO
  );
  const atrasadas = abertas.filter(c =>
    (now - new Date(c.dataRetirada)) > 24 * 60 * 60 * 1000
  );
  const totalFerramentas = getFerramentasCautela().length;

  const bannerHtml = atrasadas.length
    ? `<div class="cautela-banner visible">&#128308; ${atrasadas.length} ferramenta${atrasadas.length > 1 ? 's' : ''} com atraso superior a 24h</div>`
    : `<div class="cautela-banner"></div>`;

  const actionsBtns = isAdmin
    ? `<div style="display:flex;gap:0.5rem;margin-bottom:1rem">
        <button class="btn btn-primary btn-sm" style="width:auto" onclick="openNovaRetiradaModal()">+ Nova Retirada</button>
        <button class="btn btn-secondary btn-sm" style="width:auto" onclick="openDevolucaoModal()">Registrar Devolução</button>
       </div>`
    : '';

  const abertasHtml = abertas.length === 0
    ? '<div style="text-align:center;color:var(--gray-600);padding:2rem">Nenhuma cautela em aberto.</div>'
    : `<div class="cautela-open-list">${abertas
        .sort((a,b) => new Date(a.dataRetirada) - new Date(b.dataRetirada))
        .map(c => {
          const diff = now - new Date(c.dataRetirada);
          const horas = Math.floor(diff / 3_600_000);
          const mins  = Math.floor((diff % 3_600_000) / 60000);
          const overdue = diff > 24 * 60 * 60 * 1000;
          const tempo = horas > 0 ? `${horas}h ${mins}min` : `${mins}min`;
          return `<div class="cautela-item${overdue?' overdue':''}">
            <div class="cautela-item-header">
              <span class="cautela-item-name">${esc(c.colaboradorNome)}</span>
              <span class="cautela-item-time">${tempo} em aberto</span>
            </div>
            <div class="cautela-item-meta">
              ${esc(c.ferramentaNome)}${c.ferramentaCodigo?' · '+esc(c.ferramentaCodigo):''} · Setor: ${esc(c.setor)} · Qtd: ${c.quantidade}
            </div>
          </div>`;
        }).join('')}</div>`;

  el.innerHTML = `
    ${bannerHtml}
    <div class="cautela-cards">
      <div class="cautela-card">
        <div class="cautela-card-label">Em aberto</div>
        <div class="cautela-card-val" style="color:${abertas.length?'var(--amber)':'var(--green)'}">${abertas.length}</div>
      </div>
      <div class="cautela-card">
        <div class="cautela-card-label">Devolvidas hoje</div>
        <div class="cautela-card-val">${devolvidasHoje.length}</div>
      </div>
      <div class="cautela-card">
        <div class="cautela-card-label">Ferramentas</div>
        <div class="cautela-card-val">${totalFerramentas}</div>
      </div>
    </div>
    ${actionsBtns}
    <div style="font-weight:600;margin-bottom:0.5rem">Cautelas em aberto</div>
    ${abertasHtml}`;
}

function renderFerramentasTab() {
  const el = document.getElementById('cautela-sub-content');
  if (!el) return;
  const isAdmin = !!(currentSession && currentSession.papel === 'admin');
  const addBtn = isAdmin
    ? `<button class="btn btn-primary btn-sm" style="width:auto" onclick="openFerramentaModal()">+ Nova Ferramenta</button>`
    : '';

  el.innerHTML = `
    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;align-items:center">
      <input class="search-input" id="ferramentas-search" type="text" placeholder="Buscar por nome ou código..."
        oninput="renderFerramentasFiltered(this.value)" style="flex:1">
      ${addBtn}
    </div>
    <div class="table-wrapper">
      <table class="ferramentas-table">
        <thead><tr><th>Nome</th><th>Código</th><th>Categoria</th><th>Disponível</th>${isAdmin?'<th></th>':''}</tr></thead>
        <tbody id="ferramentas-tbody"></tbody>
      </table>
    </div>`;
  renderFerramentasFiltered('');
}

function renderFerramentasFiltered(q) {
  const tbody = document.getElementById('ferramentas-tbody');
  if (!tbody) return;
  const isAdmin = !!(currentSession && currentSession.papel === 'admin');
  const lower = q.toLowerCase();
  const list = getFerramentasCautela().filter(f =>
    !lower || f.nome.toLowerCase().includes(lower) || f.codigo.toLowerCase().includes(lower)
  );
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin?5:4}" style="text-align:center;color:var(--gray-600);padding:1.5rem">Nenhuma ferramenta encontrada.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(f => {
    const disp = f.quantidadeDisponivel;
    const total = f.quantidadeTotal;
    const cls = disp === 0 ? 'disp-zero' : 'disp-ok';
    const adminCell = isAdmin
      ? `<td><button class="btn btn-secondary btn-sm" onclick="excluirFerramenta('${f.id}','${esc(f.nome)}')">Excluir</button></td>`
      : '';
    return `<tr>
      <td>${esc(f.nome)}</td>
      <td>${esc(f.codigo)||'—'}</td>
      <td>${esc(f.categoria)}</td>
      <td><span class="disp-badge ${cls}">${disp}/${total}</span></td>
      ${adminCell}
    </tr>`;
  }).join('');
}

function openFerramentaModal() {
  if (!guardAdmin()) return;
  document.getElementById('modal-ferramenta-cautela').style.display = 'flex';
  document.getElementById('fc-nome').value = '';
  document.getElementById('fc-codigo').value = '';
  document.getElementById('fc-categoria').value = '';
  document.getElementById('fc-quantidade').value = '1';
}

function closeFerramentaModal() {
  document.getElementById('modal-ferramenta-cautela').style.display = 'none';
}

async function salvarFerramenta() {
  const nome = document.getElementById('fc-nome').value.trim();
  const codigo = document.getElementById('fc-codigo').value.trim();
  const categoria = document.getElementById('fc-categoria').value.trim();
  const qtd = parseInt(document.getElementById('fc-quantidade').value, 10);
  if (!nome || !categoria || isNaN(qtd) || qtd < 1) {
    showToast('Preencha nome, categoria e quantidade.', 'error'); return;
  }
  const { error } = await _sb.from('ferramentas_cautela').insert({
    nome, codigo: codigo || null, categoria,
    quantidade_total: qtd, quantidade_disponivel: qtd
  });
  if (error) { showToast('Erro ao salvar ferramenta.', 'error'); return; }
  closeFerramentaModal();
  await loadAllData();
  refreshAllSections();
  showToast('Ferramenta cadastrada!');
}

async function excluirFerramenta(id, nome) {
  if (!guardAdmin()) return;
  if (!confirm(`Excluir "${nome}"? Não é possível excluir se houver cautelas em aberto.`)) return;
  const { error } = await _sb.from('ferramentas_cautela').delete().eq('id', id);
  if (error) {
    if (error.message.includes('violates foreign key')) {
      showToast('Esta ferramenta possui cautela em aberto e não pode ser excluída.', 'error');
    } else {
      showToast('Erro ao excluir.', 'error');
    }
    return;
  }
  await loadAllData(); refreshAllSections();
  showToast('Ferramenta excluída.');
}
function mascaraCPF(cpf) {
  return cpf ? '***.***.***-' + String(cpf).slice(-2) : '—';
}

function renderColaboradoresTab() {
  const el = document.getElementById('cautela-sub-content');
  if (!el) return;
  const isAdmin = !!(currentSession && currentSession.papel === 'admin');
  const importBtn = isAdmin
    ? `<button class="btn btn-secondary btn-sm" style="width:auto" onclick="openImportColaboradoresModal()">&#8593; Importar CSV/XLSX</button>`
    : '';

  el.innerHTML = `
    <div style="display:flex;gap:0.5rem;margin-bottom:0.75rem;align-items:center">
      <input class="search-input" id="colab-search" type="text" placeholder="Buscar por nome ou CPF..."
        oninput="renderColaboradoresFiltered(this.value)" style="flex:1">
      ${importBtn}
    </div>
    <div class="colab-list" id="colab-list-container"></div>`;
  renderColaboradoresFiltered('');
}

function renderColaboradoresFiltered(q) {
  const container = document.getElementById('colab-list-container');
  if (!container) return;
  const isAdmin = !!(currentSession && currentSession.papel === 'admin');
  const lower = q.toLowerCase();
  const list = getColaboradores().filter(c =>
    !lower ||
    c.nome.toLowerCase().includes(lower) ||
    c.cpf.includes(lower)
  );
  if (list.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--gray-600);padding:2rem">Nenhum colaborador encontrado.</div>';
    return;
  }
  container.innerHTML = list.map(c => {
    const resetBtn = isAdmin
      ? `<button class="btn btn-secondary btn-sm" onclick="resetarAssinaturaColaborador('${c.id}','${esc(c.nome)}')">Redefinir assinatura</button>`
      : '';
    const excluirBtn = isAdmin
      ? `<button class="btn btn-secondary btn-sm" onclick="excluirColaborador('${c.id}','${esc(c.nome)}')">Excluir</button>`
      : '';
    return `<div class="colab-item">
      <div class="colab-item-info">
        <div class="colab-item-nome">${esc(c.nome)}</div>
        <div class="colab-item-cpf">CPF: ${mascaraCPF(c.cpf)}${c.setor?' · '+esc(c.setor):''}</div>
      </div>
      <div class="colab-actions">${resetBtn}${excluirBtn}</div>
    </div>`;
  }).join('');
}

async function resetarAssinaturaColaborador(id, nome) {
  if (!guardAdmin()) return;
  if (!confirm(`Redefinir assinatura de "${nome}"? Ele criará nova senha na próxima retirada.`)) return;
  const { error } = await _sb.rpc('resetar_senha_colaborador', { p_id: id });
  if (error) {
    const msg = error.message.includes('colaborador_nao_encontrado')
      ? 'Colaborador não encontrado.' : 'Erro ao redefinir assinatura.';
    showToast(msg, 'error'); return;
  }
  showToast('Assinatura redefinida. O colaborador criará nova senha na próxima retirada.');
}

async function excluirColaborador(id, nome) {
  if (!guardAdmin()) return;
  if (!confirm(`Excluir colaborador "${nome}"?`)) return;
  const { error } = await _sb.from('colaboradores').delete().eq('id', id);
  if (error) {
    if (error.message.includes('violates foreign key')) {
      showToast('Este colaborador possui cautela em aberto e não pode ser excluído.', 'error');
    } else {
      showToast('Erro ao excluir.', 'error');
    }
    return;
  }
  await loadAllData(); refreshAllSections();
  showToast('Colaborador excluído.');
}

let _xlsxLoaded = false;
async function carregarSheetJS() {
  if (_xlsxLoaded || window.XLSX) { _xlsxLoaded = true; return true; }
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = () => { _xlsxLoaded = true; resolve(true); };
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}

function openImportColaboradoresModal() {
  if (!guardAdmin()) return;
  document.getElementById('modal-import-colab').style.display = 'flex';
  document.getElementById('import-colab-file').value = '';
  document.getElementById('import-colab-status').textContent = '';
}

function closeImportColaboradoresModal() {
  document.getElementById('modal-import-colab').style.display = 'none';
}

async function processarImportColaboradores() {
  const fileInput = document.getElementById('import-colab-file');
  const statusEl = document.getElementById('import-colab-status');
  const file = fileInput.files[0];
  if (!file) { showToast('Selecione um arquivo.', 'error'); return; }

  const ext = file.name.split('.').pop().toLowerCase();
  let rows = [];

  if (ext === 'csv') {
    const text = await file.text();
    const parseCSVLine = line => {
      const cols = []; let cur = ''; let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cols.push(cur.trim());
      return cols;
    };
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
    const iNome = header.indexOf('nome');
    const iCpf  = header.indexOf('cpf');
    const iSetor = header.indexOf('setor');
    if (iNome < 0 || iCpf < 0) {
      showToast('CSV deve ter colunas "nome" e "cpf".', 'error'); return;
    }
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      if (!cols[iNome] || !cols[iCpf]) continue;
      rows.push({ nome: cols[iNome], cpf: cols[iCpf].replace(/\D/g,''), setor: iSetor >= 0 ? cols[iSetor] || null : null });
    }
  } else if (ext === 'xlsx' || ext === 'xls') {
    statusEl.textContent = 'Carregando parser...';
    const ok = await carregarSheetJS();
    if (!ok) { showToast('Não foi possível carregar o parser. Tente importar como CSV.', 'error'); return; }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { defval: '' });
    for (const row of data) {
      const nome = (row['nome'] || row['Nome'] || '').toString().trim();
      const cpf  = (row['cpf']  || row['CPF']  || '').toString().replace(/\D/g,'');
      const setor = (row['setor'] || row['Setor'] || '').toString().trim() || null;
      if (!nome || !cpf) continue;
      rows.push({ nome, cpf, setor });
    }
  } else {
    showToast('Formato não suportado. Use CSV ou XLSX.', 'error'); return;
  }

  if (rows.length === 0) { showToast('Nenhum dado encontrado no arquivo.', 'error'); return; }

  statusEl.textContent = `Importando ${rows.length} registros...`;
  const cpfsExistentes = new Set(getColaboradores().map(c => c.cpf));
  const novos = rows.filter(r => !cpfsExistentes.has(r.cpf));
  const ignorados = rows.length - novos.length;

  let importados = 0;
  if (novos.length > 0) {
    const { data, error } = await _sb.from('colaboradores').insert(
      novos.map(r => ({ nome: r.nome, cpf: r.cpf, setor: r.setor }))
    ).select('id');
    if (error) {
      showToast('Erro ao importar colaboradores. Verifique o arquivo e tente novamente.', 'error');
      closeImportColaboradoresModal();
      return;
    }
    importados = data ? data.length : novos.length;
  }

  closeImportColaboradoresModal();
  await loadAllData(); refreshAllSections();
  showToast(`${importados} importado${importados!==1?'s':''}, ${ignorados} ignorado${ignorados!==1?'s':''} (já existiam).`);
}

let _nrColaborador = null;
let _nrStep = 1;

function openNovaRetiradaModal() {
  if (!guardAdmin()) return;
  _nrColaborador = null;
  _nrStep = 1;
  document.getElementById('modal-nova-retirada').style.display = 'flex';
  renderNrStep();
}

function closeNovaRetiradaModal() {
  document.getElementById('modal-nova-retirada').style.display = 'none';
}

function renderNrStep() {
  const title  = document.getElementById('nr-title');
  const body   = document.getElementById('nr-body');
  const footer = document.getElementById('nr-footer');
  title.textContent = `Nova Retirada — Passo ${_nrStep} de 3`;

  if (_nrStep === 1) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <label>CPF ou nome do colaborador
          <input class="form-input" id="nr-busca" type="text" placeholder="Digite CPF completo ou nome">
        </label>
        <div id="nr-busca-result" style="font-size:0.875rem;color:var(--red)"></div>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="closeNovaRetiradaModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="nrBuscarColaborador()">Próximo</button>`;
    const inp = document.getElementById('nr-busca');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') nrBuscarColaborador(); });

  } else if (_nrStep === 2) {
    const ferramentas = getFerramentasCautela().filter(f => f.quantidadeDisponivel > 0);
    const opts = ferramentas.length === 0
      ? '<option value="">Nenhuma disponível</option>'
      : ferramentas.map(f =>
          `<option value="${f.id}" data-max="${f.quantidadeDisponivel}">${esc(f.nome)}${f.codigo?' ('+esc(f.codigo)+')':''} — ${f.quantidadeDisponivel} disp.</option>`
        ).join('');
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <div style="font-size:0.875rem;color:var(--gray-600)">Colaborador: <strong>${esc(_nrColaborador.nome)}</strong></div>
        <label>Ferramenta *
          <select class="form-input" id="nr-ferramenta" onchange="nrUpdateMaxQtd()">${opts}</select>
        </label>
        <label>Quantidade *
          <input class="form-input" id="nr-quantidade" type="number" min="1" value="1">
        </label>
        <label>Setor *
          <input class="form-input" id="nr-setor" type="text" value="${esc(_nrColaborador.setor||'')}">
        </label>
        <label>Observação
          <input class="form-input" id="nr-obs" type="text" placeholder="Opcional">
        </label>
        <div id="nr-step2-err" style="font-size:0.875rem;color:var(--red)"></div>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="_nrStep=1;renderNrStep()">Voltar</button>
      <button class="btn btn-primary" onclick="nrValidarStep2()">Próximo</button>`;
    nrUpdateMaxQtd();

  } else if (_nrStep === 3) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <div style="font-size:0.875rem;color:var(--gray-600)">Colaborador: <strong>${esc(_nrColaborador.nome)}</strong></div>
        <div id="nr-senha-fields"></div>
        <div id="nr-step3-err" style="font-size:0.875rem;color:var(--red)"></div>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="_nrStep=2;renderNrStep()">Voltar</button>
      <button class="btn btn-primary" id="nr-confirmar-btn" onclick="nrConfirmar()">Confirmar Retirada</button>`;
    nrCarregarSenhaFields();
  }
}

function nrUpdateMaxQtd() {
  const sel = document.getElementById('nr-ferramenta');
  const qtdInput = document.getElementById('nr-quantidade');
  if (!sel || !qtdInput) return;
  const opt = sel.options[sel.selectedIndex];
  const max = opt ? parseInt(opt.dataset.max, 10) : 1;
  qtdInput.max = max;
  if (parseInt(qtdInput.value, 10) > max) qtdInput.value = max;
}

function nrBuscarColaborador() {
  const q = document.getElementById('nr-busca')?.value.trim() || '';
  const errEl = document.getElementById('nr-busca-result');
  const cpfDigits = q.replace(/\D/g, '');
  const lower = q.toLowerCase();
  const col = getColaboradores().find(c =>
    (cpfDigits.length === 11 && c.cpf === cpfDigits) ||
    c.nome.toLowerCase() === lower
  );
  if (!col) { if (errEl) errEl.textContent = 'Colaborador não cadastrado.'; return; }
  _nrColaborador = { ...col };
  _nrStep = 2;
  renderNrStep();
}

function nrValidarStep2() {
  const sel = document.getElementById('nr-ferramenta');
  const qtdInput = document.getElementById('nr-quantidade');
  const setor = document.getElementById('nr-setor')?.value.trim() || '';
  const errEl = document.getElementById('nr-step2-err');
  if (!sel || !sel.value) { if (errEl) errEl.textContent = 'Selecione uma ferramenta.'; return; }
  const qtd = parseInt(qtdInput?.value, 10);
  const max = parseInt(sel.options[sel.selectedIndex].dataset.max, 10);
  if (isNaN(qtd) || qtd < 1 || qtd > max) {
    if (errEl) errEl.textContent = `Quantidade deve ser entre 1 e ${max}.`; return;
  }
  if (!setor) { if (errEl) errEl.textContent = 'Informe o setor.'; return; }
  _nrStep = 3;
  renderNrStep();
}

async function nrCarregarSenhaFields() {
  const container = document.getElementById('nr-senha-fields');
  if (!container) return;
  const { data: salt, error: saltErr } = await _sb.rpc('buscar_salt_colaborador', { p_id: _nrColaborador.id });
  if (saltErr) {
    container.innerHTML = '<p style="color:var(--red)">Erro ao carregar. Tente novamente.</p>';
    return;
  }
  _nrColaborador._salt = salt || null;
  if (!salt) {
    container.innerHTML = `
      <p style="font-size:0.875rem">Primeiro acesso. Crie sua senha de retirada:</p>
      <label>Senha * <input class="form-input" id="nr-senha1" type="password" placeholder="Mínimo 4 caracteres"></label>
      <label>Confirme a senha * <input class="form-input" id="nr-senha2" type="password"></label>`;
  } else {
    container.innerHTML = `
      <label>Senha de retirada * <input class="form-input" id="nr-senha1" type="password" placeholder="Sua senha"></label>`;
  }
}

async function nrConfirmar() {
  const btn = document.getElementById('nr-confirmar-btn');
  const errEl = document.getElementById('nr-step3-err');
  const sel = document.getElementById('nr-ferramenta');
  const qtd = parseInt(document.getElementById('nr-quantidade')?.value, 10);
  const setor = document.getElementById('nr-setor')?.value.trim() || '';
  const obs = document.getElementById('nr-obs')?.value.trim() || null;
  const senha1 = document.getElementById('nr-senha1')?.value || '';

  if (!senha1) { if (errEl) errEl.textContent = 'Informe a senha.'; return; }

  const ferramenta = getFerramentasCautela().find(f => f.id === sel?.value);
  if (!ferramenta) { if (errEl) errEl.textContent = 'Ferramenta inválida.'; return; }

  if (btn) { btn.disabled = true; btn.textContent = 'Aguarde...'; }

  try {
    const salt = _nrColaborador._salt;
    if (!salt) {
      if (senha1.length < 4) { if (errEl) errEl.textContent = 'Senha deve ter ao menos 4 caracteres.'; return; }
      const senha2 = document.getElementById('nr-senha2')?.value || '';
      if (senha1 !== senha2) { if (errEl) errEl.textContent = 'Senhas não conferem.'; return; }
      const newSalt = crypto.randomUUID();
      const hash = await derivarHash(senha1, newSalt);
      const { data: ok, error: defErr } = await _sb.rpc('definir_senha_colaborador', { p_id: _nrColaborador.id, p_hash: hash, p_salt: newSalt });
      if (defErr || !ok) { if (errEl) errEl.textContent = 'Erro ao definir senha. Tente novamente.'; return; }
    } else {
      const hash = await derivarHash(senha1, salt);
      const { data: ok } = await _sb.rpc('verificar_senha_colaborador', { p_id: _nrColaborador.id, p_hash: hash });
      if (!ok) { if (errEl) errEl.textContent = 'Senha incorreta.'; return; }
    }

    const cpfHash = await hashCPF(_nrColaborador.cpf);
    const { data: cautelaId, error: rErr } = await _sb.rpc('registrar_retirada', {
      p_colaborador_id: _nrColaborador.id,
      p_ferramenta_id: ferramenta.id,
      p_quantidade: qtd,
      p_setor: setor,
      p_observacao: obs,
      p_colaborador_nome: _nrColaborador.nome,
      p_ferramenta_nome: ferramenta.nome,
      p_ferramenta_codigo: ferramenta.codigo
    });

    if (rErr) {
      const msgs = {
        quantidade_insuficiente: 'Quantidade insuficiente. Outro colaborador pode ter retirado ao mesmo tempo.',
        ferramenta_nao_encontrada: 'Ferramenta não encontrada.',
        quantidade_invalida: 'Quantidade inválida.',
        colaborador_nao_encontrado: 'Colaborador não encontrado.'
      };
      if (errEl) errEl.textContent = msgs[rErr.message] || 'Erro inesperado. Tente novamente.';
      return;
    }

    dispararWebhook({
      evento: 'cautela_retirada',
      colaborador: _nrColaborador.nome,
      cpf_hash: cpfHash,
      ferramenta: ferramenta.nome,
      codigo: ferramenta.codigo || null,
      setor,
      quantidade: qtd,
      observacao: obs,
      data_retirada: new Date().toISOString()
    });

    closeNovaRetiradaModal();
    await loadAllData();
    refreshAllSections();
    showToast('Retirada registrada!');
  } finally {
    const b = document.getElementById('nr-confirmar-btn');
    if (b) { b.disabled = false; b.textContent = 'Confirmar Retirada'; }
  }
}
let _devCautelas = [];
let _devColaborador = null;
let _devStep = 1;
let _devCautelaId = null;

function openDevolucaoModal() {
  if (!guardAdmin()) return;
  _devCautelas = [];
  _devColaborador = null;
  _devStep = 1;
  _devCautelaId = null;
  document.getElementById('modal-devolucao').style.display = 'flex';
  renderDevStep();
}
function closeDevolucaoModal() {
  document.getElementById('modal-devolucao').style.display = 'none';
}

function renderDevStep() {
  const body = document.getElementById('dev-body');
  const footer = document.getElementById('dev-footer');
  document.getElementById('dev-title').textContent = `Registrar Devolução — Passo ${_devStep} de 2`;

  if (_devStep === 1) {
    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <label>CPF ou nome do colaborador
          <input class="form-input" id="dev-busca" type="text" placeholder="Digite CPF completo ou nome">
        </label>
        <div id="dev-cautelas-list"></div>
        <div id="dev-step1-err" style="font-size:0.875rem;color:var(--red)"></div>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="closeDevolucaoModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="devBuscar()">Buscar</button>`;
    document.getElementById('dev-busca').addEventListener('keydown', e => { if(e.key==='Enter') devBuscar(); });

  } else if (_devStep === 2) {
    const now = new Date();
    const cautela = _devCautelas.find(c => c.id === _devCautelaId);
    if (!cautela) { closeDevolucaoModal(); return; }
    const diff = now - new Date(cautela.dataRetirada);
    const horas = Math.floor(diff / 3_600_000);
    const mins  = Math.floor((diff % 3_600_000) / 60000);
    const overdue = diff > 24 * 60 * 60 * 1000;

    body.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem">
        <div class="cautela-item${overdue?' overdue':''}" style="margin-bottom:0.5rem">
          <div class="cautela-item-header">
            <span class="cautela-item-name">${esc(cautela.ferramentaNome)}</span>
            <span class="cautela-item-time">${horas}h ${mins}min em aberto</span>
          </div>
          <div class="cautela-item-meta">
            ${cautela.ferramentaCodigo?esc(cautela.ferramentaCodigo)+' · ':''}Qtd: ${cautela.quantidade} · Setor: ${esc(cautela.setor)}
          </div>
        </div>
        <label>Condição de devolução *
          <select class="form-input" id="dev-condicao">
            <option value="Boa">Boa</option>
            <option value="Com defeito">Com defeito</option>
            <option value="Danificada">Danificada</option>
          </select>
        </label>
        <label>Senha de retirada *
          <input class="form-input" id="dev-senha" type="password" placeholder="Sua senha">
        </label>
        <div id="dev-step2-err" style="font-size:0.875rem;color:var(--red)"></div>
      </div>`;
    footer.innerHTML = `
      <button class="btn btn-secondary" onclick="_devStep=1;renderDevStep()">Voltar</button>
      <button class="btn btn-primary" id="dev-confirmar-btn" onclick="devConfirmar()">Confirmar Devolução</button>`;
  }
}

function devBuscar() {
  const q = document.getElementById('dev-busca')?.value.trim() || '';
  const errEl = document.getElementById('dev-step1-err');
  const listEl = document.getElementById('dev-cautelas-list');
  const lower = q.toLowerCase();
  const col = getColaboradores().find(c =>
    c.cpf === q.replace(/\D/g,'') || c.nome.toLowerCase() === lower
  );
  if (!col) { errEl.textContent = 'Digite o CPF completo ou o nome exato do colaborador.'; listEl.innerHTML = ''; return; }
  _devCautelaId = null;
  _devColaborador = { ...col };
  _devCautelas = getCautelas().filter(c => c.colaboradorId === col.id && !c.dataDevolucao);
  if (_devCautelas.length === 0) {
    errEl.textContent = ''; listEl.innerHTML = '';
    showToast('Nenhuma cautela em aberto para este colaborador.'); return;
  }
  if (_devCautelas.length === 1) {
    _devCautelaId = _devCautelas[0].id;
    _devStep = 2; renderDevStep(); return;
  }
  errEl.textContent = '';
  const now = new Date();
  listEl.innerHTML = `<div style="font-size:0.875rem;margin-bottom:0.25rem">Selecione a cautela:</div>` +
    _devCautelas.map(c => {
      const h = Math.floor((now - new Date(c.dataRetirada)) / 3_600_000);
      return `<label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer">
        <input type="radio" name="dev-caute" value="${c.id}" ${_devCautelaId===c.id?'checked':''}>
        <span>${esc(c.ferramentaNome)} — ${h}h em aberto</span>
      </label>`;
    }).join('') +
    `<button class="btn btn-primary btn-sm" style="width:auto;margin-top:0.5rem" onclick="devSelecionarCautela()">Próximo</button>`;
}

function devSelecionarCautela() {
  const sel = document.querySelector('input[name="dev-caute"]:checked');
  if (!sel) { showToast('Selecione uma cautela.', 'error'); return; }
  _devCautelaId = sel.value;
  _devStep = 2; renderDevStep();
}

async function devConfirmar() {
  if (_devStep !== 2 || !_devCautelaId) return;
  const btn = document.getElementById('dev-confirmar-btn');
  const errEl = document.getElementById('dev-step2-err');
  const condicao = document.getElementById('dev-condicao').value;
  const senha = document.getElementById('dev-senha').value;
  if (!senha) { errEl.textContent = 'Informe a senha.'; return; }

  btn.disabled = true; btn.textContent = 'Aguarde...';

  try {
    const { data: salt, error: saltErr } = await _sb.rpc('buscar_salt_colaborador', { p_id: _devColaborador.id });
    if (saltErr) { errEl.textContent = 'Erro ao carregar. Tente novamente.'; return; }
    if (!salt) { errEl.textContent = 'Colaborador sem senha definida. Realize uma nova retirada primeiro.'; return; }
    const hash = await derivarHash(senha, salt);
    const { data: ok } = await _sb.rpc('verificar_senha_colaborador', { p_id: _devColaborador.id, p_hash: hash });
    if (!ok) { errEl.textContent = 'Senha incorreta.'; return; }

    const { error: dErr } = await _sb.rpc('registrar_devolucao', { p_cautela_id: _devCautelaId, p_condicao: condicao });
    if (dErr) {
      const msgs = {
        cautela_nao_encontrada: 'Cautela não encontrada ou já devolvida.',
        condicao_invalida: 'Condição de devolução inválida.',
      };
      errEl.textContent = msgs[dErr.message] || 'Erro inesperado. Tente novamente.';
      return;
    }

    await loadAllData();
    const cautelaFinal = getCautelas().find(c => c.id === _devCautelaId);
    const cpfHash = await hashCPF(_devColaborador.cpf);
    const horas = cautelaFinal
      ? Math.floor((new Date(cautelaFinal.dataDevolucao) - new Date(cautelaFinal.dataRetirada)) / 3_600_000)
      : 0;

    dispararWebhook({
      evento: 'cautela_devolvida',
      colaborador: _devColaborador.nome, cpf_hash: cpfHash,
      ferramenta: cautelaFinal?.ferramentaNome || '', codigo: cautelaFinal?.ferramentaCodigo || null,
      condicao_devolucao: condicao, quantidade: cautelaFinal?.quantidade || 1,
      horas_em_posse: horas,
      data_retirada: cautelaFinal?.dataRetirada || null,
      data_devolucao: cautelaFinal?.dataDevolucao || null
    });

    closeDevolucaoModal();
    refreshAllSections();
    showToast('Devolução registrada!');
  } finally {
    const b = document.getElementById('dev-confirmar-btn');
    if (b) { b.disabled = false; b.textContent = 'Confirmar Devolução'; }
  }
}

async function verificarAtrasosCautela() {
  const now = new Date();
  const atrasadas = getCautelas().filter(c =>
    !c.dataDevolucao && !c.alertaEnviado &&
    (now - new Date(c.dataRetirada)) > 24 * 60 * 60 * 1000
  );

  for (const c of atrasadas) {
    try {
      const horas = Math.floor((now - new Date(c.dataRetirada)) / 3_600_000);
      const { data } = await _sb
        .from('cautelas')
        .update({ alerta_enviado: true })
        .eq('id', c.id)
        .eq('alerta_enviado', false)
        .select('id');
      if (data && data.length > 0) {
        const col = getColaboradores().find(col => col.id === c.colaboradorId);
        const cpfHash = col?.cpf ? await hashCPF(col.cpf) : '';
        dispararWebhook({
          evento: 'cautela_atraso',
          colaborador: c.colaboradorNome, cpf_hash: cpfHash,
          ferramenta: c.ferramentaNome, codigo: c.ferramentaCodigo || null,
          setor: c.setor, quantidade: c.quantidade, horas_em_aberto: horas,
          data_retirada: c.dataRetirada
        });
      }
    } catch (err) {
      console.warn('verificarAtrasosCautela: falha em cautela', c.id, err);
    }
  }

  try { await loadAllData(); } catch (err) { console.warn('verificarAtrasosCautela: loadAllData falhou', err); }
  updateTabIndicators();
  renderCautelaPanel();
}

function renderCards() {
  const materiais = getMateriais();
  const movs = getMovimentacoes();
  const now = new Date();
  const mesStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mesEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

  const totalItens = materiais.length;
  const baixoEstoque = materiais.filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK').length;
  const valorTotal = materiais.reduce((s, m) => s + m.quantidade * m.valorUnitario, 0);
  const entradasMes = movs
    .filter(m => m.tipo === 'entrada' && new Date(m.data) >= mesStart && new Date(m.data) <= mesEnd)
    .reduce((s, m) => s + m.quantidade, 0);

  const equips = getEquipamentos();
  const emCalibCount = equips.filter(e => e.emCalibracao).length;
  const calibVencidos = equips.filter(e => !e.emCalibracao && calcCalibStatus(e.dataProximaCalibracao).days < 0).length;
  const calibProximos = equips.filter(e => { if (e.emCalibracao) return false; const d = calcCalibStatus(e.dataProximaCalibracao).days; return d >= 0 && d <= 30; }).length;
  const calibUrgentes = calibVencidos + calibProximos;
  const calibCls = calibVencidos > 0 ? 'red' : calibProximos > 0 ? 'amber' : '';
  const calibSub = calibVencidos > 0
    ? `${calibVencidos} vencido${calibVencidos > 1 ? 's' : ''}${emCalibCount > 0 ? ` · ${emCalibCount} em calib.` : ''}`
    : calibProximos > 0
      ? `${calibProximos} vence${calibProximos > 1 ? 'm' : ''} em breve`
      : emCalibCount > 0 ? `${emCalibCount} em calibração` : 'Tudo em dia';

  const meses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const baixoColor = baixoEstoque > 0 ? 'var(--red)' : 'var(--green)';
  const baixoBg = baixoEstoque > 0 ? '#fee2e2' : '#dcfce7';
  const calibColor = calibVencidos > 0 ? 'var(--red)' : calibProximos > 0 ? 'var(--amber)' : 'var(--green)';
  const calibBg = calibVencidos > 0 ? '#fee2e2' : calibProximos > 0 ? '#fef3c7' : '#dcfce7';

  document.getElementById('cards-grid').innerHTML = `
    <div class="card" style="border-top-color:#3b82f6">
      <div class="card-icon" style="background:#eff6ff;color:#3b82f6">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
      </div>
      <div class="card-label">Total de Itens</div>
      <div class="card-value">${totalItens}</div>
      <div class="card-sub">${totalItens === 1 ? '1 material cadastrado' : totalItens + ' materiais cadastrados'}</div>
    </div>
    <div class="card" style="border-top-color:${baixoColor}">
      <div class="card-icon" style="background:${baixoBg};color:${baixoColor}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      </div>
      <div class="card-label">Baixo Estoque</div>
      <div class="card-value ${baixoEstoque > 0 ? 'red' : ''}">${baixoEstoque}</div>
      <div class="card-sub">${baixoEstoque === 0 ? 'Todos os itens em dia' : 'Itens precisam de reposição'}</div>
    </div>
    <div class="card" style="border-top-color:var(--orange)">
      <div class="card-icon" style="background:#fff7ed;color:var(--orange)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      </div>
      <div class="card-label">Valor do Estoque</div>
      <div class="card-value orange" style="font-size:1.35rem">${fmtBRL(valorTotal)}</div>
      <div class="card-sub">Total em produtos</div>
    </div>
    <div class="card" style="border-top-color:var(--green)">
      <div class="card-icon" style="background:#dcfce7;color:var(--green)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
      </div>
      <div class="card-label">Entradas do Mês</div>
      <div class="card-value">${entradasMes % 1 === 0 ? entradasMes : entradasMes.toFixed(2)}</div>
      <div class="card-sub">Unidades em ${meses[now.getMonth()]}</div>
    </div>
    <div class="card" style="cursor:${calibUrgentes > 0 ? 'pointer' : 'default'};border-top-color:${calibColor}" onclick="${calibUrgentes > 0 ? "setMobileTab('calibracoes')" : ''}">
      <div class="card-icon" style="background:${calibBg};color:${calibColor}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="card-label">Calibrações</div>
      <div class="card-value ${calibCls}">${calibUrgentes > 0 ? calibUrgentes : '✓'}</div>
      <div class="card-sub">${calibSub}</div>
    </div>
  `;
}
function renderMaterialsTable() {
  const materiais = getMateriais();
  const categorias = getCategorias();
  const isAdmin = currentSession && currentSession.papel === 'admin';

  // Update category dropdown — include any orphaned category names from deleted categories
  const catSelect = document.getElementById('filter-cat');
  if (catSelect) {
    const current = catSelect.value;
    const knownSet = new Set(categorias);
    const orphaned = [...new Set(materiais.map(m => m.categoria).filter(c => c && !knownSet.has(c)))].sort();
    catSelect.innerHTML = '<option value="">Todas as categorias</option>' +
      categorias.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('') +
      (orphaned.length ? '<optgroup label="Categorias removidas">' +
        orphaned.map(c => `<option value="${esc(c)}" ${c === current ? 'selected' : ''}>${esc(c)}</option>`).join('') +
        '</optgroup>' : '');
  }

  const filterNome = (document.getElementById('filter-nome')?.value || '').toLowerCase();
  const filterCat = document.getElementById('filter-cat')?.value || '';
  const filterStatus = document.getElementById('filter-status')?.value || '';

  const filtered = materiais.filter(m => {
    const status = calcStatus(m.quantidade, m.estoqueMinimo);
    return (
      (!filterNome || m.nome.toLowerCase().includes(filterNome)) &&
      (!filterCat || m.categoria === filterCat) &&
      (!filterStatus || status === filterStatus)
    );
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / MAT_PER_PAGE));
  if (currentMatPage > totalPages) currentMatPage = totalPages;
  const paginated = filtered.slice((currentMatPage - 1) * MAT_PER_PAGE, currentMatPage * MAT_PER_PAGE);

  const tbody = document.getElementById('materials-tbody');

  if (total === 0) {
    const hasFilters = !!(filterNome || filterCat || filterStatus);
    tbody.innerHTML = `<tr class="empty-row"><td colspan="8">
      <div style="display:flex;flex-direction:column;align-items:center;gap:0.375rem;padding:1.25rem 0">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--gray-600)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.5">${hasFilters ? '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>' : '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'}</svg>
        <span style="font-weight:600;color:var(--gray-700)">${hasFilters ? 'Nenhum resultado para os filtros' : 'Nenhum material cadastrado'}</span>
        <span style="font-size:0.8125rem;color:var(--gray-600)">${hasFilters ? 'Tente outros termos ou limpe os filtros.' : 'Clique em + Material para adicionar o primeiro.'}</span>
      </div>
    </td></tr>`;
    renderMaterialCards([]);
    renderPaginationEl('mat-pagination', 1, 1, () => {}, 0, MAT_PER_PAGE);
    return;
  }

  tbody.innerHTML = paginated.map(m => {
    const status = calcStatus(m.quantidade, m.estoqueMinimo);
    return `<tr>
      <td>${m.id}</td>
      <td>
        <span class="mat-name-link" onclick="openHistoricoModal(${m.id})" title="Ver histórico">${esc(m.nome)}</span>
        ${m.localizacao ? `<div style="font-size:0.75rem;color:var(--gray-600);margin-top:0.125rem">${esc(m.localizacao)}</div>` : ''}
      </td>
      <td>${esc(m.categoria)}</td>
      <td>${m.quantidade % 1 === 0 ? m.quantidade : m.quantidade.toFixed(2)}</td>
      <td>${esc(m.unidade)}</td>
      <td>${m.estoqueMinimo % 1 === 0 ? m.estoqueMinimo : m.estoqueMinimo.toFixed(2)}</td>
      <td>${stockBadge(status)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-secondary btn-sm" onclick="openMovimentoModal(${m.id},'entrada')">+ Entrada</button>
          <button class="btn btn-secondary btn-sm" onclick="openMovimentoModal(${m.id},'saída')">− Saída</button>
          <div class="row-menu-wrap">
            <button class="btn btn-secondary btn-sm" onclick="toggleRowMenu(${m.id})" title="Mais ações">⋮</button>
            <div class="row-menu" id="rm-${m.id}">
              <button class="row-menu-item" onclick="openHistoricoModal(${m.id});toggleRowMenu(${m.id})">Histórico</button>
              ${isAdmin ? `
              <button class="row-menu-item" onclick="openAjusteModal(${m.id});toggleRowMenu(${m.id})">Ajustar</button>
              <button class="row-menu-item" onclick="openMaterialModal(${m.id});toggleRowMenu(${m.id})">Editar</button>
              <button class="row-menu-item danger" onclick="deleteMaterial(${m.id});toggleRowMenu(${m.id})">Excluir</button>` : ''}
            </div>
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');
  renderMaterialCards(paginated);
  renderPaginationEl('mat-pagination', currentMatPage, totalPages, p => { currentMatPage = p; renderMaterialsTable(); }, total, MAT_PER_PAGE);
}
