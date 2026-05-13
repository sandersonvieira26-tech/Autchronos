// === MOBILE TABS & FAB ===
let currentMobileTab = 'materiais';

const TAB_TITLES = {
  materiais: 'Materiais', alertas: 'Alertas',
  movimentacoes: 'Movimentações', calibracoes: 'Calibrações', cautela: 'Cautela'
};

function setMobileTab(tab) {
  currentMobileTab = tab;
  document.title = (TAB_TITLES[tab] || tab) + ' — Autchronos';
  ['materiais', 'alertas', 'movimentacoes', 'calibracoes', 'cautela'].forEach(t => {
    document.getElementById('section-' + t)?.classList.toggle('active', t === tab);
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
    document.getElementById('dtab-' + t)?.classList.toggle('active', t === tab);
  });
  if (tab === 'cautela') {
    if (!_cautelaAlertInterval && typeof verificarAtrasosCautela === 'function') {
      verificarAtrasosCautela();
      _cautelaAlertInterval = setInterval(verificarAtrasosCautela, 30 * 60 * 1000);
    }
  } else {
    if (_cautelaAlertInterval) { clearInterval(_cautelaAlertInterval); _cautelaAlertInterval = null; }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeFab();
}

function toggleFab() {
  document.getElementById('fab-btn')?.classList.toggle('open');
  document.getElementById('fab-menu')?.classList.toggle('open');
}

function closeFab() {
  document.getElementById('fab-btn')?.classList.remove('open');
  document.getElementById('fab-menu')?.classList.remove('open');
}

// Fecha qualquer modal ao clicar no backdrop (exceto confirm-del que exige escolha explícita)
(function() {
  const BACKDROP_CLOSE = {
    'modal-material':           () => closeMaterialModal(),
    'modal-usuarios':           () => closeUsuariosModal(),
    'modal-ajuste':             () => closeAjusteModal(),
    'modal-reposicao':          () => closeReposicaoModal(),
    'modal-historico':          () => closeHistoricoModal(),
    'modal-movimento':          () => closeMovimentoModal(),
    'modal-categorias':         () => closeCategoryModal(),
    'modal-import-calib':       () => closeImportCalibModal(),
    'modal-renovar-calib':      () => closeRenovarCalibModal(),
    'modal-equipamento':        () => closeEquipamentoModal(),
    'modal-historico-calib':    () => closeHistoricoCalib(),
    'modal-ferramenta-cautela': () => closeFerramentaModal(),
    'modal-import-colab':       () => closeImportColaboradoresModal(),
    'modal-nova-retirada':      () => closeNovaRetiradaModal(),
    'modal-devolucao':          () => closeDevolucaoModal(),
  };
  document.addEventListener('click', e => {
    if (!e.target.classList.contains('modal-overlay')) return;
    const fn = BACKDROP_CLOSE[e.target.id];
    if (fn) fn();
  });
})();

function renderMaterialCards(filtered) {
  const container = document.getElementById('materials-cards');
  if (!container) return;
  const isAdmin = currentSession && currentSession.papel === 'admin';
  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center;color:var(--gray-600);padding:2rem">Nenhum material encontrado.</div>';
    return;
  }
  container.innerHTML = filtered.map(m => {
    const status = calcStatus(m.quantidade, m.estoqueMinimo);
    const qty = m.quantidade % 1 === 0 ? m.quantidade : m.quantidade.toFixed(2);
    const minQ = m.estoqueMinimo % 1 === 0 ? m.estoqueMinimo : m.estoqueMinimo.toFixed(2);
    return `<div class="mat-card" id="matcard-${m.id}">
      <div class="mat-card-swipe-bg">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        Excluir
      </div>
      <div class="mat-card-body" id="matcard-body-${m.id}">
        <div class="mat-card-row1" onclick="openHistoricoModal(${m.id})" style="cursor:pointer" title="Ver histórico">
          <div>
            <div class="mat-card-name">${esc(m.nome)}</div>
            ${m.localizacao ? `<div class="mat-card-loc">${esc(m.localizacao)}</div>` : ''}
          </div>
          ${stockBadge(status)}
        </div>
        <div class="mat-card-tags">
          <span class="badge badge-saida">${esc(m.categoria)}</span>
        </div>
        <div class="mat-card-qty">
          <span class="mat-card-qty-val">${qty}</span>
          <span class="mat-card-qty-unit">${esc(m.unidade)}</span>
          <span class="mat-card-qty-min">mín: ${minQ}</span>
        </div>
        <div class="mat-card-actions">
          <button class="btn btn-secondary btn-sm" onclick="openMovimentoModal(${m.id},'entrada')">+ Entrada</button>
          <button class="btn btn-secondary btn-sm" onclick="openMovimentoModal(${m.id},'saída')">− Saída</button>
          <button class="btn btn-secondary btn-sm" onclick="openHistoricoModal(${m.id})">Histórico</button>
          ${isAdmin ? `<button class="btn btn-secondary btn-sm" onclick="openMaterialModal(${m.id})">Editar</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  if (isAdmin) {
    filtered.forEach(m => {
      const body = document.getElementById('matcard-body-' + m.id);
      if (body) addSwipe(body, () => deleteMaterial(m.id));
    });
  }
}

function addSwipe(el, onDelete) {
  let startX = 0, currentX = 0, dragging = false;
  const MAX = 82;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    currentX = 0;
    dragging = true;
    el.style.transition = 'none';
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - startX;
    currentX = Math.max(-MAX, Math.min(0, dx));
    el.style.transform = `translateX(${currentX}px)`;
  }, { passive: true });
  el.addEventListener('touchend', () => {
    dragging = false;
    el.style.transition = 'transform 0.18s ease';
    if (currentX < -MAX * 0.55) {
      el.style.transform = `translateX(-${MAX}px)`;
      const bg = el.parentElement?.querySelector('.mat-card-swipe-bg');
      if (bg) bg.onclick = () => { el.style.transform = 'translateX(0)'; currentX = 0; onDelete(); };
    } else {
      el.style.transform = 'translateX(0)';
      currentX = 0;
    }
  });
}

// === INIT ===
window.addEventListener('DOMContentLoaded', async () => {
  const session = await getAppSession();
  if (session) {
    await loadAllData();
    showLoadingScreen(session);
  } else {
    renderLogin();
    showScreen('login');
  }
});
