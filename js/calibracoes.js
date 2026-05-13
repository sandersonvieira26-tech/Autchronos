// === LOADING SCREEN ===
function showLoadingScreen(session) {
  const el = document.getElementById('screen-loading');
  el.querySelector('.loading-logo').innerHTML = logoSVG(48);
  // reset bar animation
  const fill = el.querySelector('.loading-bar-fill');
  fill.style.animation = 'none';
  fill.offsetHeight; // reflow
  fill.style.animation = '';

  el.classList.remove('fade-out');
  el.style.display = 'flex';

  renderDashboard(session);
  showScreen('dashboard');

  if (!sessionStorage.getItem('wh_calib_checked')) {
    sessionStorage.setItem('wh_calib_checked', '1');
    getEquipamentos().filter(e => {
      const st = calcCalibStatus(e.dataProximaCalibracao, e.emCalibracao);
      return st.days < 0;
    }).forEach(e => dispararWebhook({
      evento: 'calibracao_vencida',
      equipamento: e.nome,
      identificacao: e.identificacao || null,
      categoria: e.categoria || null,
      responsavel: e.responsavel || null,
      data_ultima_calibracao: e.dataUltimaCalibracao || null,
      data_vencimento: e.dataProximaCalibracao,
      usuario: session.nomeCompleto,
      data: new Date().toISOString()
    }));
  }

  setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => { el.style.display = 'none'; refreshAllSections(); setupRealtime(); }, 500);
  }, 1400);
}

// === CALIBRAÇÃO DE EQUIPAMENTOS ===
function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function addMonthsToDate(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function calcCalibStatus(dataProxima, emCalibracao = false) {
  if (emCalibracao) return { label: 'Em Calibração', cls: 'badge-calib-em-calib', days: Infinity };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const next = new Date(dataProxima + 'T00:00:00');
  const diffDays = Math.round((next - today) / 86400000);
  if (diffDays < 0)   return { label: 'Vencido', cls: 'badge-calib-vencido', days: diffDays };
  if (diffDays <= 30) return { label: `Vence em ${diffDays}d`, cls: 'badge-calib-proximo', days: diffDays };
  return { label: 'OK', cls: 'badge-calib-ok', days: diffDays };
}

function updateProximaCalib() {
  const ultima = document.getElementById('eq-ultima')?.value;
  const meses = parseInt(document.getElementById('eq-validade')?.value) || 0;
  const el = document.getElementById('eq-proxima-display');
  if (!el) return;
  if (ultima && meses > 0) {
    const proxima = addMonthsToDate(ultima, meses);
    const { label, cls } = calcCalibStatus(proxima);
    el.innerHTML = `<strong>${fmtDate(proxima)}</strong> <span class="badge ${cls}" style="margin-left:0.5rem">${label}</span>`;
    el.dataset.value = proxima;
  } else {
    el.textContent = '—';
    el.dataset.value = '';
  }
}

function setCalibCat(val) { currentCalibCat = val; currentCalibPage = 1; renderEquipamentos(); }
function setCalibStatus(val) { currentCalibStatus = val; currentCalibPage = 1; renderEquipamentos(); }
function setCalibPage(page) { currentCalibPage = page; renderEquipamentos(); }

function setCalibView(view) {
  currentCalibView = view;
  const dash  = document.getElementById('calib-dashboard');
  const lista = document.getElementById('calib-lista-content');
  const fg    = document.getElementById('calib-filters-group');
  if (dash)  dash.style.display  = view === 'dashboard' ? 'block' : 'none';
  if (lista) lista.style.display = view === 'lista'     ? 'block' : 'none';
  if (fg)    fg.style.display    = view === 'lista'     ? 'flex'  : 'none';
  document.querySelectorAll('.view-toggle-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));
  if (view === 'dashboard') renderCalibDashboard();
  else renderEquipamentos();
}

function renderEquipamentos() {
  renderCalibDashboard();
  const alertEl = document.getElementById('calib-alertas');
  const tbody   = document.getElementById('calib-tbody');
  if (!tbody) return;

  const equips  = getEquipamentos();
  const isAdmin = currentSession && currentSession.papel === 'admin';

  // Populate category filter dropdown
  const catSel = document.getElementById('calib-filter-cat');
  if (catSel) {
    const usedCats = [...new Set(equips.map(e => e.categoria))].sort();
    catSel.innerHTML = '<option value="">Todas as categorias</option>' +
      usedCats.map(c => `<option value="${esc(c)}" ${c === currentCalibCat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
  const statusSel = document.getElementById('calib-filter-status');
  if (statusSel) statusSel.value = currentCalibStatus;

  // Alert panel: collapsed by default when > 5, with expand toggle
  if (alertEl) {
    const urgentes = equips
      .filter(e => calcCalibStatus(e.dataProximaCalibracao).days <= 30)
      .sort((a, b) => new Date(a.dataProximaCalibracao) - new Date(b.dataProximaCalibracao));
    if (urgentes.length === 0) {
      alertEl.innerHTML = '';
    } else {
      const ALERTA_VISIBLE = 4;
      const mostrar = urgentes.slice(0, ALERTA_VISIBLE);
      const restante = urgentes.length - ALERTA_VISIBLE;
      const expanded = alertEl.dataset.expanded === '1';
      const visiveis = expanded ? urgentes : mostrar;
      alertEl.innerHTML = `
        <div class="alertas-title" style="margin-top:1rem;display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
          &#9888; Calibrações que precisam de atenção
          <span style="font-size:0.875rem;font-weight:400;color:var(--gray-600)">(${urgentes.length} equipamento${urgentes.length > 1 ? 's' : ''})</span>
          ${urgentes.length > ALERTA_VISIBLE ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="toggleCalibAlertas()">${expanded ? '&#9650; Recolher' : '&#9660; Ver todos (' + urgentes.length + ')'}</button>` : ''}
        </div>
        <div class="alertas-grid" style="margin-bottom:1rem">
          ${visiveis.map(e => {
            const { cls, days } = calcCalibStatus(e.dataProximaCalibracao);
            return `<div class="alerta-card ${days < 0 ? 'critico' : ''}">
              <div class="alerta-nome">${esc(e.nome)}</div>
              <div class="alerta-detalhe">Próxima: <strong>${fmtDate(e.dataProximaCalibracao)}</strong>
                ${days < 0 ? ` (${Math.abs(days)} dia${Math.abs(days)>1?'s':''} atrás)` : ` (em ${days} dia${days>1?'s':''})`}
              </div>
              ${e.identificacao ? `<div class="alerta-detalhe">ID: ${esc(e.identificacao)}</div>` : ''}
              ${calibBadge(days < 0 ? 'Vencido' : 'Vence em breve', cls)}
              <span style="font-size:0.8125rem;color:var(--gray-600);margin-left:0.375rem">${esc(e.categoria)}</span>
            </div>`;
          }).join('')}
        </div>`;
    }
  }

  // Apply filters
  const filterNome = (document.getElementById('calib-filter-nome')?.value || '').toLowerCase();
  let filtered = equips;
  if (filterNome) {
    filtered = filtered.filter(e =>
      e.nome.toLowerCase().includes(filterNome) ||
      e.numeroCertificado.toLowerCase().includes(filterNome) ||
      e.identificacao.toLowerCase().includes(filterNome)
    );
  }
  if (currentCalibCat) filtered = filtered.filter(e => e.categoria === currentCalibCat);
  if (currentCalibStatus) {
    filtered = filtered.filter(e => {
      if (currentCalibStatus === 'em_calibracao') return !!e.emCalibracao;
      if (e.emCalibracao) return false;
      const { days } = calcCalibStatus(e.dataProximaCalibracao);
      if (currentCalibStatus === 'vencido')   return days < 0;
      if (currentCalibStatus === 'proximo30') return days >= 0 && days <= 30;
      if (currentCalibStatus === 'proximo90') return days >= 0 && days <= 90;
      if (currentCalibStatus === 'ok')        return days > 30;
      return true;
    });
  }

  const pgEl = document.getElementById('calib-pagination');

  if (filtered.length === 0) {
    const msg = equips.length === 0 ? 'Nenhum equipamento cadastrado.' : 'Nenhum equipamento encontrado.';
    tbody.innerHTML = `<tr class="empty-row"><td colspan="10">${msg}</td></tr>`;
    renderCalibCards([]);
    if (pgEl) pgEl.innerHTML = '';
    return;
  }

  // Pagination
  const totalPages = Math.ceil(filtered.length / CALIB_PER_PAGE);
  if (currentCalibPage > totalPages) currentCalibPage = totalPages;
  const pageStart = (currentCalibPage - 1) * CALIB_PER_PAGE;
  const paginated = filtered.slice(pageStart, pageStart + CALIB_PER_PAGE);

  // Desktop table
  tbody.innerHTML = paginated.map(e => {
    const { label, cls } = calcCalibStatus(e.dataProximaCalibracao, e.emCalibracao);
    const calibToggleBtn = isAdmin ? (e.emCalibracao
      ? `<button class="btn btn-sm" style="background:#dcfce7;color:var(--green);margin-top:0.25rem;font-size:0.72rem;padding:0.2rem 0.5rem" onclick="toggleEmCalibracao(${e.id})">&#10003; Retornou</button>`
      : `<button class="btn btn-sm" style="background:#dbeafe;color:#1d4ed8;margin-top:0.25rem;font-size:0.72rem;padding:0.2rem 0.5rem" onclick="toggleEmCalibracao(${e.id})">&#128640; Em Calibração</button>`)
      : '';
    return `<tr>
      <td><strong>${esc(e.nome)}</strong></td>
      <td>${esc(e.identificacao) || '—'}</td>
      <td>${esc(e.categoria)}</td>
      <td>${esc(e.numeroCertificado) || '—'}</td>
      <td>${fmtDate(e.dataUltimaCalibracao)}</td>
      <td><strong>${fmtDate(e.dataProximaCalibracao)}</strong></td>
      <td>${e.validadeMeses} mês${e.validadeMeses > 1 ? 'es' : ''}</td>
      <td>${esc(e.responsavel) || '—'}</td>
      <td>
        ${calibBadge(label, cls)}
        ${e.certificadoPath ? `<br><button class="cert-btn" onclick="viewCertificado('${e.certificadoPath.replace(/'/g,"\\'")}')">&#128196; Certificado</button>` : ''}
        ${calibToggleBtn ? `<br>${calibToggleBtn}` : ''}
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openHistoricoCalib(${e.id})">&#128203; Hist.</button>
        ${isAdmin ? `
        <button class="btn btn-primary btn-sm" onclick="openRenovarCalibModal(${e.id})">&#8635; Renovar</button>
        <button class="btn btn-secondary btn-sm" onclick="openEquipamentoModal(${e.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEquipamento(${e.id})">Excluir</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  // Mobile cards
  renderCalibCards(paginated, isAdmin);

  // Pagination
  if (!pgEl) return;
  if (totalPages <= 1) { pgEl.innerHTML = ''; return; }
  const pages = [];
  pages.push(`<button class="pagination-btn" onclick="setCalibPage(${currentCalibPage - 1})" ${currentCalibPage === 1 ? 'disabled' : ''}>&#8592;</button>`);
  for (let p = 1; p <= totalPages; p++) {
    if (totalPages > 7 && p > 2 && p < totalPages - 1 && Math.abs(p - currentCalibPage) > 1) {
      if (p === 3 || p === totalPages - 2) pages.push(`<span class="pagination-info">…</span>`);
      continue;
    }
    pages.push(`<button class="pagination-btn ${p === currentCalibPage ? 'pg-active' : ''}" onclick="setCalibPage(${p})">${p}</button>`);
  }
  pages.push(`<button class="pagination-btn" onclick="setCalibPage(${currentCalibPage + 1})" ${currentCalibPage === totalPages ? 'disabled' : ''}>&#8594;</button>`);
  pages.push(`<span class="pagination-info">${pageStart + 1}–${Math.min(pageStart + CALIB_PER_PAGE, filtered.length)} de ${filtered.length}</span>`);
  pgEl.innerHTML = pages.join('');
}

function renderCalibDashboard() {
  const el = document.getElementById('calib-dashboard');
  if (!el) return;

  const equips = getEquipamentos();

  if (equips.length === 0) {
    el.innerHTML = `<div style="text-align:center;padding:3rem;color:var(--gray-400)">
      <div style="font-size:2rem;margin-bottom:0.5rem">&#9881;</div>
      Nenhum equipamento cadastrado ainda.
    </div>`;
    return;
  }

  // ── Contadores de status ──────────────────────────────────────────────
  let ok = 0, prox30 = 0, prox90 = 0, venc = 0, emCalib = 0;
  equips.forEach(e => {
    if (e.emCalibracao) { emCalib++; return; }
    const d = calcCalibStatus(e.dataProximaCalibracao).days;
    if (d < 0) venc++;
    else if (d <= 30) prox30++;
    else if (d <= 90) prox90++;
    else ok++;
  });
  const total = equips.length;

  // ── Por categoria ─────────────────────────────────────────────────────
  const catMap = {};
  equips.forEach(e => {
    if (!catMap[e.categoria]) catMap[e.categoria] = { ok:0, prox:0, venc:0 };
    const d = calcCalibStatus(e.dataProximaCalibracao).days;
    if (d < 0) catMap[e.categoria].venc++;
    else if (d <= 30) catMap[e.categoria].prox++;
    else catMap[e.categoria].ok++;
  });
  const catList = Object.entries(catMap)
    .map(([nome, v]) => ({ nome, total: v.ok+v.prox+v.venc, worst: v.venc>0?'red':v.prox>0?'amber':'green', ...v }))
    .sort((a,b) => b.venc - a.venc || b.prox - a.prox || b.total - a.total);
  const maxCat = Math.max(...catList.map(c => c.total), 1);

  // ── Próximos 12 meses ─────────────────────────────────────────────────
  const now = new Date();
  const months = Array.from({length: 12}, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    return { label: d.toLocaleString('pt-BR', {month:'short'}), count:0 };
  });
  equips.forEach(e => {
    const d = new Date(e.dataProximaCalibracao + 'T00:00:00');
    const idx = (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
    if (idx >= 0 && idx < 12) months[idx].count++;
  });
  const maxMonth = Math.max(...months.map(m => m.count), 1);

  // ── Agenda (próximos 60 dias + vencidos) ─────────────────────────────
  const agendaAll = equips
    .filter(e => calcCalibStatus(e.dataProximaCalibracao).days <= 60)
    .sort((a, b) => new Date(a.dataProximaCalibracao) - new Date(b.dataProximaCalibracao));

  // ── Donut SVG ─────────────────────────────────────────────────────────
  const C = 2 * Math.PI * 36;
  const segs = [
    { count: venc,           color: 'var(--red)' },
    { count: prox30,         color: 'var(--amber)' },
    { count: prox90,         color: 'var(--orange)' },
    { count: ok,             color: 'var(--green)' },
  ];
  let dashOffset = 0;
  const donutCircles = segs.map(s => {
    if (s.count <= 0) return '';
    const pct  = s.count / total;
    const dash = pct * C;
    const svg  = `<circle r="36" cx="50" cy="50" fill="none" stroke="${s.color}" stroke-width="13"
      stroke-dasharray="${dash} ${C - dash}" stroke-dashoffset="${-dashOffset}"
      transform="rotate(-90 50 50)"/>`;
    dashOffset += dash;
    return svg;
  }).join('');

  const donutSVG = `<svg viewBox="0 0 100 100" width="110" height="110" style="flex-shrink:0">
    <circle r="36" cx="50" cy="50" fill="none" stroke="var(--gray-100)" stroke-width="13"/>
    ${donutCircles}
    <text x="50" y="47" text-anchor="middle" font-size="18" font-weight="800" fill="var(--gray-900)">${total}</text>
    <text x="50" y="58" text-anchor="middle" font-size="7" fill="var(--gray-500)">equipamentos</text>
  </svg>`;

  // ── Helpers ───────────────────────────────────────────────────────────
  const barColor = w => w === 'red' ? 'var(--red)' : w === 'amber' ? 'var(--amber)' : 'var(--green)';
  const noop = total === 0;

  el.innerHTML = `
    <div class="cdash-cards">
      <div class="cdash-card cdash-total">
        <div class="cdash-val" style="color:var(--gray-800)">${total}</div>
        <div class="cdash-label">Total</div>
      </div>
      <div class="cdash-card cdash-ok">
        <div class="cdash-val">${ok}</div>
        <div class="cdash-label">OK &gt; 30 dias</div>
      </div>
      <div class="cdash-card cdash-orange ${prox90>0?'clickable':''}" onclick="${prox90>0?"setCalibView('lista');setCalibStatus('proximo90')":""}">
        <div class="cdash-val">${prox90}</div>
        <div class="cdash-label">Vencem em 90 dias</div>
      </div>
      <div class="cdash-card cdash-warn ${prox30>0?'clickable':''}" onclick="${prox30>0?"setCalibView('lista');setCalibStatus('proximo30')":""}">
        <div class="cdash-val">${prox30}</div>
        <div class="cdash-label">Vencem em 30 dias</div>
      </div>
      <div class="cdash-card cdash-red ${venc>0?'clickable':''}" onclick="${venc>0?"setCalibView('lista');setCalibStatus('vencido')":""}">
        <div class="cdash-val">${venc}</div>
        <div class="cdash-label">Vencidas</div>
      </div>
      <div class="cdash-card cdash-blue ${emCalib>0?'clickable':''}" onclick="${emCalib>0?"setCalibView('lista');setCalibStatus('em_calibracao')":""}">
        <div class="cdash-val">${emCalib}</div>
        <div class="cdash-label">Em Calibração</div>
      </div>
    </div>

    <div class="cdash-row">
      <div class="cdash-panel">
        <div class="cdash-panel-title">Distribuição por status</div>
        <div class="donut-wrap">
          ${donutSVG}
          <div class="donut-legend">
            <div class="donut-leg-item"><div class="donut-dot" style="background:var(--red)"></div><span class="donut-leg-label">Vencidas</span><span class="donut-leg-count">${venc}</span></div>
            <div class="donut-leg-item"><div class="donut-dot" style="background:var(--amber)"></div><span class="donut-leg-label">Vencem em 30d</span><span class="donut-leg-count">${prox30}</span></div>
            <div class="donut-leg-item"><div class="donut-dot" style="background:var(--orange)"></div><span class="donut-leg-label">Vencem em 31–90d</span><span class="donut-leg-count">${prox90}</span></div>
            <div class="donut-leg-item"><div class="donut-dot" style="background:var(--green)"></div><span class="donut-leg-label">OK</span><span class="donut-leg-count">${ok}</span></div>
          </div>
        </div>
      </div>
      <div class="cdash-panel">
        <div class="cdash-panel-title">Por categoria</div>
        ${catList.length === 0
          ? '<div style="color:var(--gray-400);font-size:0.875rem">Sem dados</div>'
          : catList.map(c => `<div class="hbar">
              <span class="hbar-label" title="${esc(c.nome)}">${esc(c.nome)}</span>
              <div class="hbar-track"><div class="hbar-fill" style="width:${Math.round(c.total/maxCat*100)}%;background:${barColor(c.worst)}"></div></div>
              <span class="hbar-count">${c.total}</span>
            </div>`).join('')}
      </div>
    </div>

    <div class="cdash-row">
      <div class="cdash-panel">
        <div class="cdash-panel-title">Vencimentos — próximos 12 meses</div>
        <div class="mbar-chart">
          ${months.map((m, i) => {
            const h = Math.max(Math.round(m.count / maxMonth * 72), m.count > 0 ? 4 : 3);
            const isCurrentMonth = i === 0;
            const color = isCurrentMonth && m.count > 0 ? 'var(--red)' : m.count > 0 ? 'var(--orange)' : 'var(--gray-200)';
            return `<div class="mbar-col">
              <div class="mbar-count">${m.count > 0 ? m.count : ''}</div>
              <div class="mbar-bar" style="height:${h}px;background:${color}"></div>
              <div class="mbar-month" style="${isCurrentMonth?'font-weight:700;color:var(--orange)':''}">${m.label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="cdash-panel">
        <div class="cdash-panel-title" style="display:flex;justify-content:space-between;align-items:center">
          <span>Agenda de atenção</span>
          ${agendaAll.length > 6 ? `<button class="btn btn-secondary btn-sm" style="width:auto;font-size:0.72rem" onclick="setCalibView('lista');setCalibStatus('proximo90')">Ver todas</button>` : ''}
        </div>
        ${agendaAll.length === 0
          ? `<div style="text-align:center;padding:1.5rem;color:var(--gray-400);font-size:0.875rem">&#10003; Nenhuma calibração urgente</div>`
          : `<div class="agenda-list">
              ${agendaAll.slice(0, 7).map(e => {
                const { days } = calcCalibStatus(e.dataProximaCalibracao);
                const cls = days < 0 ? 'vencido' : days <= 30 ? 'proximo' : 'ok';
                const dLabel = days < 0 ? `${Math.abs(days)}d atrás` : days === 0 ? 'Hoje' : `em ${days}d`;
                return `<div class="agenda-item ${cls}">
                  <span class="agenda-nome" title="${esc(e.nome)}">${esc(e.nome)}</span>
                  <span class="agenda-date">${fmtDate(e.dataProximaCalibracao)}</span>
                  <span class="agenda-days">${dLabel}</span>
                </div>`;
              }).join('')}
            </div>`}
      </div>
    </div>`;
}

function toggleCalibAlertas() {
  const alertEl = document.getElementById('calib-alertas');
  if (!alertEl) return;
  alertEl.dataset.expanded = alertEl.dataset.expanded === '1' ? '0' : '1';
  renderEquipamentos();
}

function renderCalibCards(items, isAdmin) {
  const container = document.getElementById('calib-cards');
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = items.map(e => {
    const { label, cls, days } = calcCalibStatus(e.dataProximaCalibracao, e.emCalibracao);
    const clsSimple = e.emCalibracao ? 'em-calib' : cls === 'badge-calib-ok' ? 'ok' : cls === 'badge-calib-proximo' ? 'proximo' : 'vencido';
    const daysLabel = e.emCalibracao ? 'Enviado para calibração'
      : days < 0 ? `Vencido há ${Math.abs(days)} dia${Math.abs(days) > 1 ? 's' : ''}`
      : days === 0 ? 'Vence hoje!'
      : `Vence em ${days} dia${days > 1 ? 's' : ''}`;

    return `<div class="calib-card">
      <div class="calib-card-header">
        <div>
          <div class="calib-card-nome">${esc(e.nome)}</div>
          ${e.identificacao ? `<div class="calib-card-sub">ID: ${esc(e.identificacao)}</div>` : ''}
        </div>
        <span class="badge ${cls}">${label}</span>
      </div>

      <div class="calib-card-dates ${clsSimple}" style="${e.emCalibracao ? 'background:#dbeafe;color:#1d4ed8' : ''}">
        &#128197; Próxima: ${fmtDate(e.dataProximaCalibracao)} &nbsp;·&nbsp; ${daysLabel}
      </div>

      <div class="calib-card-info">
        <span class="calib-card-info-label">Categoria</span>
        <span class="calib-card-info-val">${esc(e.categoria)}</span>
        <span class="calib-card-info-label">Última calib.</span>
        <span class="calib-card-info-val">${fmtDate(e.dataUltimaCalibracao)}</span>
        <span class="calib-card-info-label">Validade</span>
        <span class="calib-card-info-val">${e.validadeMeses} mês${e.validadeMeses > 1 ? 'es' : ''}</span>
        ${e.responsavel ? `<span class="calib-card-info-label">Responsável</span>
        <span class="calib-card-info-val">${esc(e.responsavel)}</span>` : ''}
        ${e.numeroCertificado ? `<span class="calib-card-info-label">Certificado</span>
        <span class="calib-card-info-val">${esc(e.numeroCertificado)}</span>` : ''}
      </div>

      <div class="calib-card-actions">
        <button class="btn btn-secondary btn-sm" onclick="openHistoricoCalib(${e.id})">&#128203; Histórico</button>
        ${e.certificadoPath ? `<button class="cert-btn" style="flex:1;justify-content:center" onclick="viewCertificado('${e.certificadoPath.replace(/'/g,"\\'")}')">&#128196; Certificado</button>` : ''}
        ${isAdmin ? `
        ${e.emCalibracao
          ? `<button class="btn btn-sm" style="background:#dcfce7;color:var(--green);flex:1" onclick="toggleEmCalibracao(${e.id})">&#10003; Retornou</button>`
          : `<button class="btn btn-sm" style="background:#dbeafe;color:#1d4ed8;flex:1" onclick="toggleEmCalibracao(${e.id})">&#128640; Em Calibração</button>`
        }
        <button class="btn btn-primary btn-sm" onclick="openRenovarCalibModal(${e.id})">&#8635; Renovar</button>
        <button class="btn btn-secondary btn-sm" onclick="openEquipamentoModal(${e.id})">Editar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteEquipamento(${e.id})">Excluir</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

let renovarCalibId = null;

function openRenovarCalibModal(id) {
  const equip = getEquipamentos().find(e => e.id === id);
  if (!equip) return;
  renovarCalibId = id;

  document.getElementById('renovar-equip-nome').textContent = equip.nome;
  document.getElementById('renovar-validade-info').textContent =
    `${equip.validadeMeses} mês${equip.validadeMeses > 1 ? 'es' : ''}`;
  document.getElementById('renovar-data').value = '';
  document.getElementById('renovar-cert').value = equip.numeroCertificado || '';
  document.getElementById('renovar-proxima-display').textContent = '—';
  const fi = document.getElementById('renovar-cert-file'); if (fi) fi.value = '';
  clearFieldError('err-renovar-data');

  const btn = document.querySelector('button[onclick="saveRenovarCalib()"]');
  if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Renovação'; }

  document.getElementById('modal-renovar-calib').style.display = 'flex';
  setTimeout(() => document.getElementById('renovar-data').focus(), 50);
}

function closeRenovarCalibModal() {
  document.getElementById('modal-renovar-calib').style.display = 'none';
  renovarCalibId = null;
}

function updateRenovarProxima() {
  const equip = renovarCalibId ? getEquipamentos().find(e => e.id === renovarCalibId) : null;
  if (!equip) return;
  const data = document.getElementById('renovar-data').value;
  const el = document.getElementById('renovar-proxima-display');
  if (data) {
    const proxima = addMonthsToDate(data, equip.validadeMeses);
    const { label, cls } = calcCalibStatus(proxima);
    el.innerHTML = `<strong>${fmtDate(proxima)}</strong> <span class="badge ${cls}" style="margin-left:0.5rem">${label}</span>`;
  } else {
    el.textContent = '—';
  }
}

async function saveRenovarCalib() {
  const dataCal = document.getElementById('renovar-data').value;
  clearFieldError('err-renovar-data');
  if (!dataCal) { showFieldError('err-renovar-data', 'Informe a nova data de calibração.'); return; }

  const equip = getEquipamentos().find(e => e.id === renovarCalibId);
  if (!equip) return;

  const dataProxima = addMonthsToDate(dataCal, equip.validadeMeses);
  const certInput = document.getElementById('renovar-cert').value.trim();
  const cert = certInput || equip.numeroCertificado || null;
  const certFile = document.getElementById('renovar-cert-file')?.files[0];

  const btn = document.querySelector('button[onclick="saveRenovarCalib()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  // Upload new certificate file if provided
  let certPath = equip.certificadoPath || null;
  if (certFile) {
    const uploaded = await uploadCertificado(renovarCalibId, certFile);
    if (uploaded) certPath = uploaded;
    else { if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Renovação'; } return; }
  }

  const { error } = await _sb.from('equipamentos_calibracao').update({
    data_ultima_calibracao: dataCal,
    data_proxima_calibracao: dataProxima,
    numero_certificado: cert,
    certificado_path: certPath
  }).eq('id', renovarCalibId);

  if (error) {
    alert('Erro ao renovar: ' + error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Renovação'; }
    return;
  }

  // Registrar no histórico
  await _sb.from('calibracoes_historico').insert({
    equipamento_id: renovarCalibId,
    equipamento_nome: equip.nome,
    data_calibracao: dataCal,
    data_proxima: dataProxima,
    numero_certificado: cert,
    certificado_path: certPath,
    responsavel: equip.responsavel || null,
    registrado_por: currentSession?.nomeCompleto || 'Sistema'
  });

  await loadAllData();
  closeRenovarCalibModal();
  renderEquipamentos();
  renderCards();
  renderDaySummary();
  showToast('Calibração renovada!');
}

let editingEquipamentoId = null;

function openEquipamentoModal(id = null) {
  if (!guardAdmin()) return;
  editingEquipamentoId = id;
  const equip = id ? getEquipamentos().find(e => e.id === id) : null;

  document.getElementById('modal-equip-title').textContent = id ? 'Editar Equipamento' : 'Adicionar Equipamento';

  const cats = getCategorias().slice().sort();
  document.getElementById('eq-cat').innerHTML = '<option value="">Selecione...</option>' +
    cats.map(c => `<option value="${esc(c)}" ${equip && equip.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  document.getElementById('eq-nome').value = equip ? equip.nome : '';
  document.getElementById('eq-id').value = equip ? equip.identificacao : '';
  document.getElementById('eq-cert').value = equip ? equip.numeroCertificado : '';
  document.getElementById('eq-ultima').value = equip ? equip.dataUltimaCalibracao : '';
  document.getElementById('eq-validade').value = equip ? equip.validadeMeses : '';
  document.getElementById('eq-resp').value = equip ? equip.responsavel : '';
  const eqFi = document.getElementById('eq-cert-file'); if (eqFi) eqFi.value = '';

  ['err-eq-nome', 'err-eq-cat', 'err-eq-ultima', 'err-eq-validade'].forEach(clearFieldError);

  const btn = document.querySelector('button[onclick="saveEquipamento()"]');
  if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }

  updateProximaCalib();
  document.getElementById('modal-equipamento').style.display = 'flex';
}

function closeEquipamentoModal() {
  document.getElementById('modal-equipamento').style.display = 'none';
  editingEquipamentoId = null;
}

async function saveEquipamento() {
  if (!guardAdmin()) return;
  const nome = document.getElementById('eq-nome').value.trim();
  const cat = document.getElementById('eq-cat').value;
  const ultimaRaw = document.getElementById('eq-ultima').value;
  const validadeRaw = document.getElementById('eq-validade').value;
  let valid = true;

  ['err-eq-nome', 'err-eq-cat', 'err-eq-ultima', 'err-eq-validade'].forEach(clearFieldError);

  if (!nome) { showFieldError('err-eq-nome', 'Este campo é obrigatório.'); valid = false; }
  if (!cat) { showFieldError('err-eq-cat', 'Selecione uma categoria.'); valid = false; }
  if (!ultimaRaw) { showFieldError('err-eq-ultima', 'Informe a data da última calibração.'); valid = false; }
  const validade = parseInt(validadeRaw);
  if (!validadeRaw || isNaN(validade) || validade < 1) {
    showFieldError('err-eq-validade', 'Informe um número de meses válido (≥ 1).');
    valid = false;
  }
  if (!valid) return;

  const dataProxima = addMonthsToDate(ultimaRaw, validade);
  const identificacao = document.getElementById('eq-id').value.trim() || null;
  const numeroCertificado = document.getElementById('eq-cert').value.trim() || null;
  const responsavel = document.getElementById('eq-resp').value.trim() || null;
  const certFile = document.getElementById('eq-cert-file')?.files[0];

  const btn = document.querySelector('button[onclick="saveEquipamento()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  const payload = {
    nome, categoria: cat, identificacao,
    numero_certificado: numeroCertificado,
    data_ultima_calibracao: ultimaRaw,
    validade_meses: validade,
    data_proxima_calibracao: dataProxima,
    responsavel
  };

  let error, savedId;
  if (editingEquipamentoId) {
    ({ error } = await _sb.from('equipamentos_calibracao').update(payload).eq('id', editingEquipamentoId));
    savedId = editingEquipamentoId;
  } else {
    const { data: inserted, error: e } = await _sb.from('equipamentos_calibracao').insert(payload).select('id').single();
    error = e;
    savedId = inserted?.id;
  }

  if (error) {
    alert('Erro ao salvar: ' + error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    return;
  }

  // Upload certificado se fornecido
  let certPath = editingEquipamentoId ? (getEquipamentos().find(e => e.id === editingEquipamentoId)?.certificadoPath || null) : null;
  if (certFile && savedId) {
    const uploaded = await uploadCertificado(savedId, certFile);
    if (uploaded) {
      certPath = uploaded;
      await _sb.from('equipamentos_calibracao').update({ certificado_path: certPath }).eq('id', savedId);
    }
  }

  // Registrar histórico inicial ao criar equipamento
  if (!editingEquipamentoId && savedId) {
    await _sb.from('calibracoes_historico').insert({
      equipamento_id: savedId,
      equipamento_nome: nome,
      data_calibracao: ultimaRaw,
      data_proxima: dataProxima,
      numero_certificado: numeroCertificado,
      certificado_path: certPath,
      responsavel,
      registrado_por: currentSession?.nomeCompleto || 'Sistema',
      observacao: 'Registro inicial'
    });
  }

  const wasEditingEq = !!editingEquipamentoId;
  if (!wasEditingEq) {
    dispararWebhook({
      evento: 'equipamento_criado',
      equipamento: nome,
      identificacao: identificacao || null,
      categoria: cat,
      responsavel: responsavel || null,
      data_ultima_calibracao: ultimaRaw || null,
      data_proxima_calibracao: dataProxima || null,
      usuario: currentSession?.nomeCompleto || 'admin',
      data: new Date().toISOString()
    });
  }
  await loadAllData();
  if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  closeEquipamentoModal();
  renderEquipamentos();
  showToast(wasEditingEq ? 'Equipamento atualizado!' : 'Equipamento adicionado!');
}

async function deleteEquipamento(id) {
  if (!guardAdmin()) return;
  const equip = getEquipamentos().find(e => e.id === id);
  if (!equip) return;
  openConfirmDelete(
    'Excluir equipamento',
    `Tem certeza que deseja excluir <span class="confirm-del-name">${esc(equip.nome)}</span>? O histórico de calibrações será perdido. Esta ação não pode ser desfeita.`,
    async () => {
      const { error } = await _sb.from('equipamentos_calibracao').delete().eq('id', id);
      if (error) { alert('Erro ao excluir: ' + error.message); return; }
      dispararWebhook({
        evento: 'equipamento_excluido',
        equipamento: equip.nome,
        identificacao: equip.identificacao || null,
        categoria: equip.categoria || null,
        responsavel: equip.responsavel || null,
        usuario: currentSession?.nomeCompleto || 'admin',
        data: new Date().toISOString()
      });
      await loadAllData();
      renderEquipamentos();
      showToast('Equipamento excluído.');
    }
  );
}

// === IMPORTAR CSV DE CALIBRAÇÕES ===
let importCalibRows = [];

function openImportCalibModal() {
  if (!guardAdmin()) return;
  importCalibRows = [];
  const fi = document.getElementById('import-calib-file');
  if (fi) fi.value = '';
  document.getElementById('import-calib-preview').style.display = 'none';
  document.getElementById('btn-confirm-import-calib').style.display = 'none';
  clearFieldError('err-import-calib');
  document.getElementById('modal-import-calib').style.display = 'flex';
}

function closeImportCalibModal() {
  document.getElementById('modal-import-calib').style.display = 'none';
  importCalibRows = [];
}

function _detectDelimiter(line) {
  const sc = (line.match(/;/g) || []).length;
  const co = (line.match(/,/g) || []).length;
  return sc > co ? ';' : ',';
}

function _parseCSVLine(line, delim) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      result.push(cur.trim()); cur = '';
    } else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function _normalizeHeader(h) {
  return h.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

const _CALIB_ALIASES = {
  nome:                  ['nome','name','equipamento','descricao','description','item'],
  identificacao:         ['identificacao','id','patrimonio','serie','num_serie','numero_serie','tag','codigo','cod'],
  categoria:             ['categoria','category','tipo','setor','area'],
  numero_certificado:    ['numero_certificado','certificado','cert','num_cert','num_certificado','certificate','n_cert'],
  data_ultima_calibracao:['data_ultima_calibracao','ultima_calibracao','data_calibracao','data','calibracao','ultimo_calibracao','dt_calibracao'],
  validade_meses:        ['validade_meses','validade','meses','months','periodicidade','intervalo','freq_meses'],
  responsavel:           ['responsavel','responsible','tecnico','laboratorio','lab','executor']
};

function _mapHeaders(rawHeaders) {
  const norm = rawHeaders.map(_normalizeHeader);
  const map = {};
  for (const [field, aliases] of Object.entries(_CALIB_ALIASES)) {
    const idx = norm.findIndex(h => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function _parseDateBR(str) {
  if (!str) return null;
  str = str.trim().replace(/\s+/g,'');
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  const m2 = str.match(/^(\d{4})[\/\-](\d{2})[\/\-](\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  // Excel serial number (days since 1900-01-01)
  const serial = parseInt(str);
  if (!isNaN(serial) && serial > 40000 && serial < 60000) {
    const d = new Date((serial - 25569) * 86400000);
    return d.toISOString().split('T')[0];
  }
  return null;
}

function previewImportCalib(input) {
  const file = input.files[0];
  if (!file) return;
  clearFieldError('err-import-calib');
  importCalibRows = [];
  document.getElementById('import-calib-preview').style.display = 'none';
  document.getElementById('btn-confirm-import-calib').style.display = 'none';

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const text = ev.target.result.replace(/^﻿/, ''); // strip BOM
      const lines = text.split(/\r?\n/);
      const nonEmpty = lines.filter(l => l.trim());
      if (nonEmpty.length < 2) {
        showFieldError('err-import-calib', 'Arquivo vazio ou sem dados além do cabeçalho.');
        return;
      }

      const delim = _detectDelimiter(nonEmpty[0]);
      const headers = _parseCSVLine(nonEmpty[0], delim);
      const colMap  = _mapHeaders(headers);

      const required = ['nome','categoria','data_ultima_calibracao','validade_meses'];
      const missing  = required.filter(f => colMap[f] === undefined);
      if (missing.length) {
        showFieldError('err-import-calib',
          `Coluna(s) obrigatória(s) não encontrada(s): ${missing.join(', ')}. ` +
          `Cabeçalho detectado: ${headers.join(', ')}`);
        return;
      }

      const rows = [], erros = [];
      for (let i = 1; i < nonEmpty.length; i++) {
        const cols = _parseCSVLine(nonEmpty[i], delim);
        if (cols.every(c => !c.trim())) continue;
        const get = f => colMap[f] !== undefined ? (cols[colMap[f]] || '').trim() : '';

        const nome       = get('nome');
        const categoria  = get('categoria');
        const dataRaw    = get('data_ultima_calibracao');
        const validRaw   = get('validade_meses');

        if (!nome)      { erros.push(`Linha ${i+1}: nome vazio`); continue; }
        if (!categoria) { erros.push(`Linha ${i+1}: categoria vazia`); continue; }
        const dataUltima = _parseDateBR(dataRaw);
        if (!dataUltima){ erros.push(`Linha ${i+1}: data inválida "${dataRaw}"`); continue; }
        const validade = parseInt(validRaw);
        if (isNaN(validade) || validade < 1) {
          erros.push(`Linha ${i+1}: validade inválida "${validRaw}"`); continue;
        }

        rows.push({
          nome, categoria,
          identificacao:          get('identificacao') || null,
          numero_certificado:     get('numero_certificado') || null,
          data_ultima_calibracao: dataUltima,
          validade_meses:         validade,
          data_proxima_calibracao: addMonthsToDate(dataUltima, validade),
          responsavel:            get('responsavel') || null
        });
      }

      importCalibRows = rows;

      // Summary
      const summaryEl = document.getElementById('import-calib-summary');
      const okPart = `<span style="color:var(--green)"><strong>${rows.length}</strong> equipamento${rows.length !== 1 ? 's' : ''} pronto${rows.length !== 1 ? 's' : ''} para importar</span>`;
      const errPart = erros.length
        ? ` &nbsp;|&nbsp; <span style="color:var(--amber)"><strong>${erros.length}</strong> linha${erros.length > 1 ? 's' : ''} ignorada${erros.length > 1 ? 's' : ''}</span>` +
          `<div style="font-size:0.775rem;color:var(--gray-600);margin-top:0.25rem">${erros.slice(0,4).map(esc).join(' · ')}${erros.length > 4 ? ` · ...` : ''}</div>`
        : '';
      summaryEl.innerHTML = okPart + errPart;

      // Preview table (first 8 rows)
      document.getElementById('import-calib-thead').innerHTML =
        '<th>Nome</th><th>Categoria</th><th>Identificação</th><th>Última Calib.</th><th>Próxima Calib.</th><th>Validade</th>';
      document.getElementById('import-calib-tbody').innerHTML =
        rows.slice(0, 8).map(r => `<tr>
          <td>${esc(r.nome)}</td>
          <td>${esc(r.categoria)}</td>
          <td>${esc(r.identificacao || '—')}</td>
          <td>${fmtDate(r.data_ultima_calibracao)}</td>
          <td>${fmtDate(r.data_proxima_calibracao)}</td>
          <td>${r.validade_meses}m</td>
        </tr>`).join('') +
        (rows.length > 8 ? `<tr class="empty-row"><td colspan="6">... e mais ${rows.length - 8} equipamento${rows.length - 8 > 1 ? 's' : ''}</td></tr>` : '');

      document.getElementById('import-calib-preview').style.display = 'block';
      if (rows.length > 0) {
        const btn = document.getElementById('btn-confirm-import-calib');
        btn.style.display = 'inline-flex';
        btn.disabled = false;
        btn.textContent = `↓ Importar ${rows.length} equipamento${rows.length !== 1 ? 's' : ''}`;
      }
    } catch(err) {
      showFieldError('err-import-calib', 'Erro ao ler arquivo: ' + err.message);
    }
  };
  reader.readAsText(file, 'UTF-8');
}

async function confirmImportCalib() {
  if (!importCalibRows.length) return;
  const btn = document.getElementById('btn-confirm-import-calib');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < importCalibRows.length; i += BATCH) {
    const { error } = await _sb.from('equipamentos_calibracao').insert(importCalibRows.slice(i, i + BATCH));
    if (error) {
      alert(`Erro ao importar (lote ${Math.floor(i/BATCH)+1}): ${error.message}`);
      if (btn) { btn.disabled = false; btn.textContent = 'Importar'; }
      return;
    }
    inserted += Math.min(BATCH, importCalibRows.length - i);
  }

  await loadAllData();
  closeImportCalibModal();
  renderEquipamentos();
  renderCards();
  alert(`${inserted} equipamento${inserted !== 1 ? 's' : ''} importado${inserted !== 1 ? 's' : ''} com sucesso!`);
}
