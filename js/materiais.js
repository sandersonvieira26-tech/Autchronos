// === MOVIMENTAÇÃO ===
let movimentoMaterialId = null;

function updateMovTrackingFields() {
  const tipo = document.querySelector('input[name="mov-tipo"]:checked')?.value;
  const isSaida = tipo === 'saída';
  document.getElementById('mov-retirador-group').style.display = isSaida ? '' : 'none';
  document.getElementById('mov-destino-group').style.display = isSaida ? '' : 'none';
}

function openMovimentoModal(id, tipo = 'entrada') {
  movimentoMaterialId = id;
  const material = getMateriais().find(m => m.id === id);
  if (!material) return;

  document.getElementById('modal-mov-title').textContent =
    tipo === 'entrada' ? 'Registrar Entrada' : 'Registrar Saída';
  document.getElementById('mov-material-nome').textContent = material.nome;
  const qtdAtual = material.quantidade % 1 === 0 ? material.quantidade : material.quantidade.toFixed(2);
  document.getElementById('mov-estoque-valor').textContent = `${qtdAtual} ${esc(material.unidade)}`;
  document.querySelector(`input[name="mov-tipo"][value="${tipo}"]`).checked = true;
  document.getElementById('mov-qtd').value = '';
  document.getElementById('mov-retirado-por').value = '';
  document.getElementById('mov-destino').value = '';
  document.getElementById('mov-observacao').value = '';
  clearFieldError('err-mov-qtd');
  clearFieldError('err-mov-retirador');
  clearFieldError('err-mov-destino');
  updateMovTrackingFields();

  document.querySelectorAll('input[name="mov-tipo"]').forEach(r => {
    r.onchange = updateMovTrackingFields;
  });

  // Autocomplete destinos a partir de movimentações existentes
  const dl = document.getElementById('destinos-list');
  if (dl) {
    const destinos = [...new Set(getMovimentacoes().map(m => m.destino).filter(Boolean))].sort();
    dl.innerHTML = destinos.map(d => `<option value="${esc(d)}">`).join('');
  }

  const btnReg = document.querySelector('button[onclick="saveMovimento()"]');
  if (btnReg) { btnReg.disabled = false; btnReg.textContent = 'Registrar'; }

  document.getElementById('modal-movimento').style.display = 'flex';
  setTimeout(() => document.getElementById('mov-qtd').focus(), 50);
}

function closeMovimentoModal() {
  document.getElementById('modal-movimento').style.display = 'none';
  movimentoMaterialId = null;
}

async function saveMovimento() {
  const tipo = document.querySelector('input[name="mov-tipo"]:checked').value;
  const qtdRaw = document.getElementById('mov-qtd').value;
  clearFieldError('err-mov-qtd');

  const qtd = parseDecimal(qtdRaw);
  if (!qtdRaw.trim() || isNaN(qtd) || qtd <= 0) {
    showFieldError('err-mov-qtd', 'Informe uma quantidade válida maior que zero.');
    return;
  }

  const material = getMateriais().find(m => m.id === movimentoMaterialId);
  if (!material) return;

  const novaQtd = tipo === 'entrada' ? material.quantidade + qtd : material.quantidade - qtd;
  if (novaQtd < 0) {
    const atual = material.quantidade % 1 === 0 ? material.quantidade : material.quantidade.toFixed(2);
    showFieldError('err-mov-qtd', `Estoque insuficiente. Disponível: ${atual} ${material.unidade}.`);
    return;
  }

  clearFieldError('err-mov-retirador');
  clearFieldError('err-mov-destino');
  const retiradorPor = (document.getElementById('mov-retirado-por')?.value || '').trim();
  const destino = (document.getElementById('mov-destino')?.value || '').trim();
  if (tipo === 'saída') {
    let hasErr = false;
    if (!retiradorPor) { showFieldError('err-mov-retirador', 'Informe quem retirou o material.'); hasErr = true; }
    if (!destino) { showFieldError('err-mov-destino', 'Informe o destino ou local de uso.'); hasErr = true; }
    if (hasErr) return;
  }

  const btn = document.querySelector('button[onclick="saveMovimento()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando...'; }

  const observacao = (document.getElementById('mov-observacao')?.value || '').trim();
  const delta = tipo === 'entrada' ? qtd : -qtd;
  const { data: qtdFinal, error } = await _sb.rpc('registrar_movimentacao', {
    p_material_id:          material.id,
    p_delta:                delta,
    p_tipo:                 tipo,
    p_quantidade_movimento: qtd,
    p_registrado_por:       currentSession.nomeCompleto,
    p_retirado_por:         retiradorPor || null,
    p_destino:              destino || null,
    p_observacao:           observacao || null
  });
  if (error) { alert('Erro: ' + error.message); if (btn) { btn.disabled = false; btn.textContent = 'Registrar'; } return; }

  dispararWebhook({
    evento: 'movimentacao',
    tipo,
    material: material.nome,
    quantidade: qtd,
    unidade: material.unidade,
    retirado_por: retiradorPor || null,
    destino: destino || null,
    observacao: observacao || null,
    usuario: currentSession.nomeCompleto,
    data: new Date().toISOString()
  });
  const novoStatusMat = calcStatus(qtdFinal, material.estoqueMinimo);
  if (novoStatusMat !== 'OK') {
    dispararWebhook({
      evento: 'estoque_minimo',
      status: novoStatusMat,
      material: material.nome,
      quantidade: qtdFinal,
      estoque_minimo: material.estoqueMinimo,
      unidade: material.unidade,
      usuario: currentSession.nomeCompleto,
      data: new Date().toISOString()
    });
  }

  await loadAllData();
  closeMovimentoModal();
  refreshAllSections();
  showToast('Movimentação registrada!');
}

function getFilterWindow(period) {
  const now = new Date();
  if (period === 'hoje') {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { start, end };
  }
  if (period === 'custom') {
    const sv = document.getElementById('custom-start')?.value;
    const ev = document.getElementById('custom-end')?.value;
    const start = sv ? new Date(sv + 'T00:00:00') : new Date(0);
    const end   = ev ? new Date(ev + 'T23:59:59.999') : now;
    return { start, end };
  }
  const days = { '7d': 7, '14d': 14, '30d': 30 }[period];
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  start.setHours(0, 0, 0, 0);
  return { start, end: now };
}

function renderMovements() {
  updateMovCatFilter();

  const allMovs = getMovimentacoes();
  const matValMap = {};
  const catMap = {};
  getMateriais().forEach(m => { catMap[m.id] = m.categoria; matValMap[m.id] = m.valorUnitario || 0; });

  const movsByCat = currentMovCategory
    ? allMovs.filter(m => catMap[m.materialId] === currentMovCategory)
    : allMovs;

  const { start, end } = getFilterWindow(currentPeriod);
  let movs = movsByCat.filter(m => { const d = new Date(m.data); return d >= start && d <= end; });

  // Totalizador (antes dos filtros de busca/tipo)
  const movsEnt = movs.filter(m => m.tipo === 'entrada');
  const movsSai = movs.filter(m => m.tipo === 'saída');
  const totEntradas = movsEnt.reduce((s, m) => s + m.quantidade, 0);
  const totSaidas   = movsSai.reduce((s, m) => s + m.quantidade, 0);
  const totValEnt   = movsEnt.reduce((s, m) => s + m.quantidade * (matValMap[m.materialId] || 0), 0);
  const totValSai   = movsSai.reduce((s, m) => s + m.quantidade * (matValMap[m.materialId] || 0), 0);
  const saldo = totEntradas - totSaidas;
  const fmt = n => n % 1 === 0 ? n : n.toFixed(2);
  const summaryEl = document.getElementById('chart-summary');
  if (summaryEl) {
    summaryEl.innerHTML = movs.length === 0 ? '' :
      `<span>Entradas: <span class="chart-summary-entrada">${fmt(totEntradas)}</span>${totValEnt > 0 ? ` <span style="font-size:0.8125rem;color:var(--gray-600)">(${fmtBRL(totValEnt)})</span>` : ''}</span>
       <span>Saídas: <span class="chart-summary-saida">${fmt(totSaidas)}</span>${totValSai > 0 ? ` <span style="font-size:0.8125rem;color:var(--gray-600)">(${fmtBRL(totValSai)})</span>` : ''}</span>
       <span>Saldo: <strong style="color:${saldo >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(saldo)}</strong></span>`;
  }

  // Tracking dashboard (saídas do período antes dos filtros de busca/tipo)
  renderMovTrackingPanel(movsSai, matValMap, totValSai);

  // Chart
  renderChart(document.getElementById('chart-container'), movsByCat, currentPeriod);

  // Filtros de busca e tipo
  if (currentMovSearch) movs = movs.filter(m =>
    m.materialNome.toLowerCase().includes(currentMovSearch) ||
    (m.retiradorPor || '').toLowerCase().includes(currentMovSearch) ||
    (m.destino || '').toLowerCase().includes(currentMovSearch));
  if (currentMovTipo)   movs = movs.filter(m => m.tipo === currentMovTipo);
  movs = movs.sort((a, b) => new Date(b.data) - new Date(a.data));

  // Paginação
  const total = movs.length;
  const totalPages = Math.max(1, Math.ceil(total / MOV_PER_PAGE));
  if (currentMovPage > totalPages) currentMovPage = totalPages;
  const pageMovs = movs.slice((currentMovPage - 1) * MOV_PER_PAGE, currentMovPage * MOV_PER_PAGE);

  const tbody = document.getElementById('movements-tbody');
  if (total === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">Nenhuma movimentação encontrada neste período.</td></tr>';
    document.getElementById('mov-pagination').innerHTML = '';
    return;
  }

  tbody.innerHTML = pageMovs.map(m => {
    const d = new Date(m.data);
    const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tipoInfo = { entrada:['badge-entrada','Entrada'], saída:['badge-saida','Saída'], ajuste:['badge-ajuste','Ajuste'] };
    const [badgeClass, label] = tipoInfo[m.tipo] || ['badge-saida', m.tipo];
    return `<tr>
      <td>${dateStr}</td>
      <td>
        ${esc(m.materialNome)}
        ${m.observacao ? `<div style="font-size:0.75rem;color:var(--gray-600);font-style:italic;margin-top:0.125rem">${esc(m.observacao)}</div>` : ''}
      </td>
      <td><span class="badge ${badgeClass}">${label}</span></td>
      <td>${fmt(m.quantidade)}</td>
      <td>${m.retiradorPor ? esc(m.retiradorPor) : '<span style="color:var(--gray-500)">—</span>'}</td>
      <td>${m.destino ? esc(m.destino) : '<span style="color:var(--gray-500)">—</span>'}</td>
    </tr>`;
  }).join('');

  // Render pagination
  renderPaginationEl('mov-pagination', currentMovPage, totalPages, p => { currentMovPage = p; renderMovements(); }, total, MOV_PER_PAGE);
}

function renderMovTrackingPanel(saidas, matValMap, totValSai) {
  const panel = document.getElementById('mov-tracking-panel');
  if (!panel) return;
  if (saidas.length === 0) { panel.innerHTML = ''; return; }

  // Top retirado_por
  const retiradoresMap = {};
  saidas.forEach(m => { if (m.retiradorPor) retiradoresMap[m.retiradorPor] = (retiradoresMap[m.retiradorPor] || 0) + 1; });
  const topRet = Object.entries(retiradoresMap).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxRet = topRet[0]?.[1] || 1;

  // Top destinos
  const destinosMap = {};
  saidas.forEach(m => { if (m.destino) destinosMap[m.destino] = (destinosMap[m.destino] || 0) + 1; });
  const topDest = Object.entries(destinosMap).sort((a,b) => b[1]-a[1]).slice(0, 5);
  const maxDest = topDest[0]?.[1] || 1;

  const barRows = (items, max) => items.length === 0
    ? '<div style="color:var(--gray-500);font-size:0.8125rem;padding:0.25rem 0">Nenhum registro</div>'
    : items.map(([name, count]) => `
      <div class="track-row">
        <span class="track-name" title="${esc(name)}">${esc(name)}</span>
        <div class="track-bar-wrap"><div class="track-bar-fill" style="width:${Math.round(count/max*100)}%"></div></div>
        <span class="track-count">${count}</span>
      </div>`).join('');

  panel.innerHTML = `<div class="track-panel">
    <div class="track-card">
      <div class="track-card-title">Quem mais retirou</div>
      ${barRows(topRet, maxRet)}
    </div>
    <div class="track-card">
      <div class="track-card-title">Destinos frequentes</div>
      ${barRows(topDest, maxDest)}
    </div>
    ${totValSai > 0 ? `<div class="track-card" style="min-width:140px;flex:0 0 auto;text-align:center">
      <div class="track-card-title">Custo das saídas</div>
      <div class="track-cost-val">${fmtBRL(totValSai)}</div>
      <div class="track-cost-label">${saidas.length} saída${saidas.length !== 1 ? 's' : ''} no período</div>
    </div>` : ''}
  </div>`;
}

function renderPaginationEl(elId, page, totalPages, onPage, total, perPage) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = `<span class="pagination-info">${total} registro${total !== 1 ? 's' : ''}</span>`; return; }
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  let html = `<button class="pagination-btn" onclick="${onPage.toString().includes('=>') ? '' : ''}void(0)" id="${elId}-prev" ${page === 1 ? 'disabled' : ''}>&#8592;</button>`;
  const range = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) range.push(i);
    else if (range[range.length-1] !== '…') range.push('…');
  }
  range.forEach(r => {
    if (r === '…') html += `<span class="pagination-info">…</span>`;
    else html += `<button class="pagination-btn ${r === page ? 'pg-active' : ''}" data-pg="${r}">${r}</button>`;
  });
  html += `<button class="pagination-btn" id="${elId}-next" ${page === totalPages ? 'disabled' : ''}>&#8594;</button>`;
  html += `<span class="pagination-info">${from}–${to} de ${total}</span>`;
  el.innerHTML = html;
  el.querySelectorAll('[data-pg]').forEach(btn => btn.addEventListener('click', () => onPage(+btn.dataset.pg)));
  const prev = el.querySelector(`#${elId}-prev`); if (prev) prev.addEventListener('click', () => onPage(page - 1));
  const next = el.querySelector(`#${elId}-next`); if (next) next.addEventListener('click', () => onPage(page + 1));
}

function getBuckets(period) {
  const now = new Date();
  const buckets = [];
  const pad2 = n => String(n).padStart(2, '0');
  const fmtDay = d => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

  if (period === 'hoje') {
    for (let h = 0; h < 24; h++) {
      const start = new Date(now); start.setHours(h, 0, 0, 0);
      const end = new Date(now); end.setHours(h, 59, 59, 999);
      buckets.push({ label: `${pad2(h)}h`, start, end });
    }
  } else if (period === '7d' || period === '14d') {
    const days = period === '7d' ? 7 : 14;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      buckets.push({ label: fmtDay(d), start, end });
    }
  } else if (period === 'custom') {
    const { start: cs, end: ce } = getFilterWindow('custom');
    const diffDays = Math.max(1, Math.ceil((ce - cs) / 86400000));
    if (diffDays <= 1) {
      for (let h = 0; h < 24; h++) {
        const s = new Date(cs); s.setHours(h, 0, 0, 0);
        const e = new Date(cs); e.setHours(h, 59, 59, 999);
        buckets.push({ label: `${pad2(h)}h`, start: s, end: e });
      }
    } else if (diffDays <= 31) {
      for (let i = 0; i < diffDays; i++) {
        const d = new Date(cs.getTime() + i * 86400000);
        const s = new Date(d); s.setHours(0, 0, 0, 0);
        const e = new Date(d); e.setHours(23, 59, 59, 999);
        buckets.push({ label: fmtDay(d), start: s, end: e });
      }
    } else {
      const weeks = Math.ceil(diffDays / 7);
      for (let i = 0; i < weeks; i++) {
        const s = new Date(cs.getTime() + i * 7 * 86400000); s.setHours(0, 0, 0, 0);
        const eMs = Math.min(cs.getTime() + (i + 1) * 7 * 86400000 - 1, ce.getTime());
        const e = new Date(eMs); e.setHours(23, 59, 59, 999);
        buckets.push({ label: `${fmtDay(s)}–${fmtDay(e)}`, start: s, end: e });
      }
    }
  } else { // 30d — 5 blocks of 6 days, oldest first
    for (let i = 4; i >= 0; i--) {
      const endMs = now.getTime() - i * 6 * 86400000;
      const startMs = endMs - 5 * 86400000;
      const startD = new Date(startMs); startD.setHours(0, 0, 0, 0);
      const endD = new Date(endMs); endD.setHours(23, 59, 59, 999);
      buckets.push({ label: `${fmtDay(startD)}–${fmtDay(endD)}`, start: startD, end: endD });
    }
  }
  return buckets;
}

function renderChart(container, allMovs, period) {
  const buckets = getBuckets(period);
  const rangeStart = buckets[0].start;
  const rangeEnd = buckets[buckets.length - 1].end;
  const movs = allMovs.filter(m => { const d = new Date(m.data); return d >= rangeStart && d <= rangeEnd; });
  const data = buckets.map(b => {
    const inBucket = movs.filter(m => { const d = new Date(m.data); return d >= b.start && d <= b.end; });
    return {
      label: b.label,
      entradas: inBucket.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (Number(m.quantidade) || 0), 0),
      saidas: inBucket.filter(m => m.tipo === 'saída').reduce((s, m) => s + (Number(m.quantidade) || 0), 0)
    };
  });

  const hasData = data.some(d => d.entradas > 0 || d.saidas > 0);
  if (!hasData) {
    container.innerHTML = '<span class="chart-empty">Sem movimentações neste período.</span>';
    return;
  }

  const maxVal = Math.max(...data.flatMap(d => [d.entradas, d.saidas]), 1);
  const W = container.offsetWidth || 700;
  const H = 280;
  const PAD = { top: 28, right: 16, bottom: 56, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const groupW = chartW / data.length;
  const barW = Math.max(Math.min(groupW * 0.32, 22), 4);
  const gap = barW * 0.25;
  const fmtN = n => n % 1 === 0 ? n : n.toFixed(1);

  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto">`;
  svg += `<g transform="translate(${PAD.left},${PAD.top})">`;

  // Y gridlines (4 lines)
  for (let i = 1; i <= 4; i++) {
    const y = chartH - (i / 4) * chartH;
    const val = ((i / 4) * maxVal);
    svg += `<line x1="0" y1="${y}" x2="${chartW}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
    svg += `<text x="-4" y="${y + 4}" text-anchor="end" font-size="9" fill="#9ca3af">${fmtN(val)}</text>`;
  }

  data.forEach((d, i) => {
    const cx = i * groupW + groupW / 2;
    const xE = cx - barW - gap / 2;
    const xS = cx + gap / 2;
    const hE = (d.entradas / maxVal) * chartH;
    const hS = (d.saidas / maxVal) * chartH;

    if (hE > 0) {
      svg += `<rect x="${xE}" y="${chartH - hE}" width="${barW}" height="${hE}" fill="#f97316" rx="2"/>`;
      svg += `<text x="${xE + barW/2}" y="${chartH - hE - 3}" text-anchor="middle" font-size="9" fill="#111827">${fmtN(d.entradas)}</text>`;
    }
    if (hS > 0) {
      svg += `<rect x="${xS}" y="${chartH - hS}" width="${barW}" height="${hS}" fill="#6b7280" rx="2"/>`;
      svg += `<text x="${xS + barW/2}" y="${chartH - hS - 3}" text-anchor="middle" font-size="9" fill="#111827">${fmtN(d.saidas)}</text>`;
    }

    // X label — rotate long labels (30d)
    const labelY = chartH + 14;
    const rotate = period === '30d' ? ` transform="rotate(-25,${cx},${labelY})"` : '';
    svg += `<text x="${cx}" y="${labelY}" text-anchor="middle" font-size="9" fill="#6b7280"${rotate}>${d.label}</text>`;
  });

  // X axis
  svg += `<line x1="0" y1="${chartH}" x2="${chartW}" y2="${chartH}" stroke="#d1d5db" stroke-width="1"/>`;

  // Legend
  const ly = chartH + (period === '30d' ? 42 : 36);
  const lx = chartW / 2;
  svg += `<rect x="${lx - 80}" y="${ly}" width="10" height="10" fill="#f97316" rx="2"/>`;
  svg += `<text x="${lx - 67}" y="${ly + 9}" font-size="10" fill="#374151">Entradas</text>`;
  svg += `<rect x="${lx + 10}" y="${ly}" width="10" height="10" fill="#6b7280" rx="2"/>`;
  svg += `<text x="${lx + 23}" y="${ly + 9}" font-size="10" fill="#374151">Saídas</text>`;

  svg += `</g></svg>`;
  container.innerHTML = svg;
}

let editingMaterialId = null;

function openMaterialModal(id = null) {
  if (!guardAdmin()) return;
  editingMaterialId = id;
  const modal = document.getElementById('modal-material');
  const material = id ? getMateriais().find(m => m.id === id) : null;

  document.getElementById('modal-material-title').textContent = id ? 'Editar Material' : 'Adicionar Material';

  // Populate category dropdown
  const cats = getCategorias().slice().sort();
  document.getElementById('m-cat').innerHTML = '<option value="">Selecione...</option>' +
    cats.map(c => `<option value="${esc(c)}" ${material && material.categoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('');

  // Fill fields
  document.getElementById('m-nome').value = material ? material.nome : '';
  document.getElementById('m-unidade').value = material ? material.unidade : '';
  document.getElementById('m-qtd').value = material ? material.quantidade : '';
  document.getElementById('m-min').value = material ? material.estoqueMinimo : '';
  document.getElementById('m-valor').value = material ? material.valorUnitario.toFixed(2).replace('.', ',') : '';
  document.getElementById('m-local').value = material ? (material.localizacao || '') : '';

  // Clear errors
  ['err-m-nome','err-m-cat','err-m-unidade','err-m-qtd','err-m-min'].forEach(clearFieldError);

  modal.style.display = 'flex';
}

function closeMaterialModal() {
  document.getElementById('modal-material').style.display = 'none';
  editingMaterialId = null;
}

async function deleteMaterial(id) {
  if (!guardAdmin()) return;
  const material = getMateriais().find(m => m.id === id);
  if (!material) return;
  openConfirmDelete(
    'Excluir material',
    `Tem certeza que deseja excluir <span class="confirm-del-name">${esc(material.nome)}</span>? Todo o histórico de movimentações será perdido. Esta ação não pode ser desfeita.`,
    async () => {
      const { error } = await _sb.from('materiais').delete().eq('id', id);
      if (error) { alert('Erro ao excluir: ' + error.message); return; }
      dispararWebhook({
        evento: 'material_excluido',
        nome: material.nome,
        categoria: material.categoria,
        unidade: material.unidade,
        usuario: currentSession?.nomeCompleto || 'admin',
        data: new Date().toISOString()
      });
      await loadAllData();
      refreshAllSections();
      showToast('Material excluído.');
    }
  );
}

function validateDecimalField(value, id) {
  const raw = String(value).replace(/\./g, '').replace(',', '.');
  const num = parseFloat(raw);
  if (value.trim() === '' || isNaN(num) || num < 0) {
    showFieldError(id, 'Informe um número válido ≥ 0.');
    return null;
  }
  return num;
}

async function saveMaterial() {
  if (!guardAdmin()) return;
  const nome = document.getElementById('m-nome').value.trim();
  const cat = document.getElementById('m-cat').value;
  const unidade = document.getElementById('m-unidade').value.trim();
  const qtdRaw = document.getElementById('m-qtd').value;
  const minRaw = document.getElementById('m-min').value;
  const valorRaw = document.getElementById('m-valor').value;
  let valid = true;

  ['err-m-nome','err-m-cat','err-m-unidade','err-m-qtd','err-m-min','err-m-valor'].forEach(clearFieldError);

  if (!nome) { showFieldError('err-m-nome', 'Este campo é obrigatório.'); valid = false; }
  if (!cat) { showFieldError('err-m-cat', 'Selecione uma categoria.'); valid = false; }
  if (!unidade) { showFieldError('err-m-unidade', 'Este campo é obrigatório.'); valid = false; }

  const qtd = validateDecimalField(qtdRaw, 'err-m-qtd');
  if (qtd === null) valid = false;
  const min = validateDecimalField(minRaw, 'err-m-min');
  if (min === null) valid = false;

  const valorStr = valorRaw.trim();
  const valor = valorStr === '' ? 0 : parseDecimal(valorStr);
  if (!isFinite(valor)) {
    showFieldError('err-m-valor', 'Informe um valor numérico válido.');
    valid = false;
  }

  if (!valid) return;

  const localizacao = document.getElementById('m-local').value.trim() || null;
  const btn = document.querySelector('button[onclick="saveMaterial()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  if (editingMaterialId) {
    const old = getMateriais().find(m => m.id === editingMaterialId);
    if (!old) { alert('Material não encontrado.'); closeMaterialModal(); return; }

    const { error } = await _sb.from('materiais').update({
      nome, categoria: cat, quantidade: qtd, unidade,
      estoque_minimo: min, valor_unitario: valor, localizacao
    }).eq('id', editingMaterialId);
    if (error) { alert('Erro ao salvar: ' + error.message); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }

    await recordMovimento(old.id, old.nome, old.quantidade, qtd, currentSession.nomeCompleto);
  } else {
    const { error } = await _sb.from('materiais').insert({
      nome, categoria: cat, quantidade: qtd, unidade,
      estoque_minimo: min, valor_unitario: valor, localizacao
    });
    if (error) { alert('Erro ao salvar: ' + error.message); if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; } return; }
    dispararWebhook({
      evento: 'material_criado',
      nome, categoria: cat, quantidade: qtd, unidade,
      estoque_minimo: min, valor_unitario: valor,
      localizacao: localizacao || null,
      usuario: currentSession.nomeCompleto,
      data: new Date().toISOString()
    });
  }

  const wasEditing = !!editingMaterialId;
  await loadAllData();
  if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
  closeMaterialModal();
  refreshAllSections();
  showToast(wasEditing ? 'Material atualizado!' : 'Material adicionado!');
}
function openCategoryModal() {
  if (!guardAdmin()) return;
  document.getElementById('modal-categorias').style.display = 'flex';
  renderCategoryList();
}

function closeCategoryModal() {
  document.getElementById('modal-categorias').style.display = 'none';
  renderMaterialsTable();
}

function renderCategoryList() {
  const cats = getCategorias().slice().sort();
  const isLast = cats.length === 1;
  document.getElementById('cat-list').innerHTML = cats.map((c, i) => {
    const errId = 'cat-err-' + btoa(encodeURIComponent(c)).replace(/[^a-zA-Z0-9]/g, '_');
    return `
    <div class="cat-item">
      <input type="text" value="${esc(c)}" data-original="${esc(c)}" data-errid="${errId}"
        onblur="renameCategory(this)"
        onkeydown="if(event.key==='Enter')this.blur()">
      <button class="btn btn-danger btn-sm" onclick="deleteCategoryByIndex(${i})"
        ${isLast ? 'disabled title="É necessário manter ao menos uma categoria."' : ''}>
        Excluir
      </button>
    </div>
    <div class="cat-item-error" id="${errId}" style="display:none;color:var(--red);font-size:0.75rem"></div>`;
  }).join('');
  document.getElementById('cat-new-input').value = '';
}

function renameCategory(input) {
  if (!guardAdmin()) return;
  const oldName = input.dataset.original;
  const newName = input.value.trim();
  const errEl = input.dataset.errid ? document.getElementById(input.dataset.errid) : null;

  if (!newName) { input.value = oldName; return; }
  if (newName === oldName) return;

  if (getCategorias().some(c => c.toLowerCase() === newName.toLowerCase() && c !== oldName)) {
    input.value = oldName;
    if (errEl) { errEl.textContent = 'Esta categoria já existe.'; errEl.style.display = 'block'; setTimeout(() => { errEl.style.display = 'none'; }, 3000); }
    return;
  }

  _sb.from('categorias').update({ nome: newName }).eq('nome', oldName).then(async ({ error }) => {
    if (error) { input.value = oldName; alert('Erro ao renomear: ' + error.message); return; }
    const { error: errMat } = await _sb.from('materiais').update({ categoria: newName }).eq('categoria', oldName);
    if (errMat) { alert('Categoria renomeada, mas erro ao atualizar materiais: ' + errMat.message); }
    await loadAllData();
    renderCategoryList();
    renderMaterialsTable();
  });
}

function addCategory() {
  if (!guardAdmin()) return;
  const input = document.getElementById('cat-new-input');
  const name = input.value.trim();
  if (!name) return;

  if (getCategorias().some(c => c.toLowerCase() === name.toLowerCase())) {
    input.style.borderColor = 'var(--red)';
    setTimeout(() => { input.style.borderColor = ''; }, 2000);
    return;
  }

  _sb.from('categorias').insert({ nome: name }).then(async ({ error }) => {
    if (error) { alert('Erro ao adicionar categoria: ' + error.message); return; }
    await loadAllData();
    renderCategoryList();
  });
}

function deleteCategory(name) {
  if (!guardAdmin()) return;
  if (getCategorias().length <= 1) return;
  const count = getMateriais().filter(m => m.categoria === name).length;

  if (count > 0 && !confirm(`${count} material(is) usa(m) esta categoria. Deseja excluir mesmo assim?`)) return;

  _sb.from('categorias').delete().eq('nome', name).then(async ({ error }) => {
    if (error) { alert('Erro ao excluir categoria: ' + error.message); return; }
    await loadAllData();
    if (count > 0) { renderCards(); renderMaterialsTable(); }
    renderCategoryList();
  });
}
function deleteCategoryByIndex(idx) {
  const cats = getCategorias().slice().sort();
  if (idx >= 0 && idx < cats.length) deleteCategory(cats[idx]);
}

function setPeriod(p) {
  currentMovPage = 1;
  currentPeriod = p;
  ['hoje','7d','14d','30d','custom'].forEach(k => {
    const btn = document.getElementById('btn-' + k);
    if (btn) btn.classList.toggle('active', k === p);
  });
  const dr = document.getElementById('custom-date-range');
  if (dr) dr.classList.toggle('visible', p === 'custom');
  if (p !== 'custom') renderMovements();
}

function applyCustomPeriod() {
  renderMovements();
}

function setMovCategory(cat) {
  currentMovPage = 1;
  currentMovCategory = cat;
  renderMovements();
}

function setMovSearch(val) {
  currentMovPage = 1;
  currentMovSearch = val.toLowerCase();
  renderMovements();
}

function setMovTipo(val) {
  currentMovPage = 1;
  currentMovTipo = val;
  renderMovements();
}

// === ALERTAS ===
function renderAlertas() {
  const el = document.getElementById('alertas-section');
  const elMobile = document.getElementById('alertas-section-mobile');
  if (!el) return;
  const alertas = getMateriais()
    .filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK')
    .sort((a, b) => {
      const ord = { 'Crítico': 0, 'Baixo': 1 };
      return ord[calcStatus(a.quantidade, a.estoqueMinimo)] - ord[calcStatus(b.quantidade, b.estoqueMinimo)];
    });
  if (alertas.length === 0) {
    el.innerHTML = '';
    if (elMobile) elMobile.innerHTML = '<div style="text-align:center;color:var(--gray-600);padding:2rem">Nenhum alerta de estoque.</div>';
    return;
  }
  const ALERTA_VISIBLE = 4;
  const expanded = el.dataset.expanded === '1';
  const visiveis = expanded ? alertas : alertas.slice(0, ALERTA_VISIBLE);
  const html = `
    <div class="alertas-title" style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">
      &#9888; Alertas de Estoque
      <span style="font-size:0.875rem;font-weight:400;color:var(--gray-600)">(${alertas.length} item${alertas.length > 1 ? 's' : ''})</span>
      ${alertas.length > ALERTA_VISIBLE ? `<button class="btn btn-secondary btn-sm" style="margin-left:auto" onclick="toggleMatAlertas()">${expanded ? '&#9650; Recolher' : '&#9660; Ver todos (' + alertas.length + ')'}</button>` : ''}
    </div>
    <div class="alertas-grid">
      ${visiveis.map(m => {
        const status = calcStatus(m.quantidade, m.estoqueMinimo);
        const fmt = v => v % 1 === 0 ? v : v.toFixed(2);
        const pct = m.estoqueMinimo > 0 ? Math.min(100, Math.round((m.quantidade / m.estoqueMinimo) * 100)) : 100;
        const barColor = status === 'Crítico' ? 'var(--red)' : 'var(--amber)';
        return `<div class="alerta-card ${status === 'Crítico' ? 'critico' : ''}">
          <div class="alerta-nome">${esc(m.nome)}</div>
          <div class="alerta-detalhe">Estoque: <strong>${fmt(m.quantidade)} ${esc(m.unidade)}</strong> &nbsp;|&nbsp; Mín: <strong>${fmt(m.estoqueMinimo)}</strong></div>
          <span class="badge ${status === 'Crítico' ? 'badge-critico' : 'badge-baixo'}">${status}</span>
          <span style="font-size:0.8125rem;color:var(--gray-600);margin-left:0.375rem">${esc(m.categoria)}</span>
          <div class="alerta-progress"><div class="alerta-progress-fill" style="width:${pct}%;background:${barColor}"></div></div>
        </div>`;
      }).join('')}
    </div>`;
  el.innerHTML = html;
  if (elMobile) elMobile.innerHTML = html;
}

function toggleMatAlertas() {
  const el = document.getElementById('alertas-section');
  if (!el) return;
  el.dataset.expanded = el.dataset.expanded === '1' ? '0' : '1';
  renderAlertas();
}

// === HISTÓRICO POR MATERIAL ===
function openHistoricoModal(id) {
  _histMaterial = getMateriais().find(m => m.id === id) || null;
  document.getElementById('modal-historico-title').textContent =
    `Histórico — ${_histMaterial ? esc(_histMaterial.nome) : '#' + id}`;
  _histMovs = getMovimentacoes()
    .filter(m => m.materialId === id)
    .sort((a, b) => new Date(b.data) - new Date(a.data));
  histPage = 1;
  renderHistoricoPage();
  document.getElementById('modal-historico').style.display = 'flex';
}

function renderHistoricoPage() {
  const list = document.getElementById('historico-list');
  const fmt = n => n % 1 === 0 ? n : n.toFixed(2);
  const valorUnit = _histMaterial ? (_histMaterial.valorUnitario || 0) : 0;

  if (_histMovs.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--gray-600);padding:2rem 1rem">Nenhuma movimentação registrada.</p>';
    const pg = document.getElementById('historico-pagination');
    if (pg) pg.innerHTML = '';
    return;
  }

  const total = _histMovs.length;
  const totalPages = Math.max(1, Math.ceil(total / HIST_PER_PAGE));
  if (histPage > totalPages) histPage = totalPages;
  const paginated = _histMovs.slice((histPage - 1) * HIST_PER_PAGE, histPage * HIST_PER_PAGE);

  const custoTotalSaidas = _histMovs.filter(m => m.tipo === 'saída').reduce((s, m) => s + m.quantidade * valorUnit, 0);

  const cards = paginated.map(m => {
    const d = new Date(m.data);
    const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const tipoInfo = { entrada:['badge-entrada','Entrada'], saída:['badge-saida','Saída'], ajuste:['badge-ajuste','Ajuste'] };
    const [badgeClass, label] = tipoInfo[m.tipo] || ['badge-saida', m.tipo];
    const custo = valorUnit > 0 ? m.quantidade * valorUnit : 0;
    const custoStr = custo > 0
      ? `<div class="hist-entry-row"><span class="hist-entry-key">Valor</span><span class="hist-entry-val" style="color:${m.tipo === 'saída' ? 'var(--red)' : 'var(--green)'}">${m.tipo === 'saída' ? '−' : '+'} ${fmtBRL(custo)}</span></div>`
      : '';
    return `<div class="hist-entry">
      <div class="hist-entry-header">
        <span class="hist-entry-date">${dateStr}</span>
        <span class="badge ${badgeClass}">${label}</span>
      </div>
      <div class="hist-entry-row">
        <span class="hist-entry-key">Quantidade</span>
        <span class="hist-entry-val">${fmt(m.quantidade)}${_histMaterial ? ' ' + esc(_histMaterial.unidade) : ''}</span>
      </div>
      ${custoStr}
      ${m.retiradorPor ? `<div class="hist-entry-row"><span class="hist-entry-key">Retirado por</span><span class="hist-entry-val">${esc(m.retiradorPor)}</span></div>` : ''}
      ${m.destino ? `<div class="hist-entry-row"><span class="hist-entry-key">Destino</span><span class="hist-entry-val">${esc(m.destino)}</span></div>` : ''}
      ${m.observacao ? `<div class="hist-entry-row"><span class="hist-entry-key">Obs.</span><span class="hist-entry-val" style="color:var(--gray-600);font-style:italic;font-weight:400">${esc(m.observacao)}</span></div>` : ''}
    </div>`;
  }).join('');

  const totLine = custoTotalSaidas > 0
    ? `<div style="padding:0.75rem 1rem;background:var(--gray-100);border-top:1px solid var(--gray-200);font-size:0.875rem;display:flex;justify-content:space-between;align-items:center">
         <span style="color:var(--gray-600)">Total em saídas (tudo)</span>
         <strong style="color:var(--red)">${fmtBRL(custoTotalSaidas)}</strong>
       </div>` : '';
  list.innerHTML = cards + totLine;
  renderPaginationEl('historico-pagination', histPage, totalPages, p => { histPage = p; renderHistoricoPage(); }, total, HIST_PER_PAGE);
}

function closeHistoricoModal() {
  document.getElementById('modal-historico').style.display = 'none';
}

// === LISTA DE REPOSIÇÃO ===
function openReposicaoModal() {
  const itens = getMateriais()
    .filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK')
    .sort((a, b) => {
      const ord = { 'Crítico': 0, 'Baixo': 1 };
      return ord[calcStatus(a.quantidade, a.estoqueMinimo)] - ord[calcStatus(b.quantidade, b.estoqueMinimo)];
    });
  const fmt = v => v % 1 === 0 ? v : v.toFixed(2);
  const sumEl = document.getElementById('repos-summary');
  const listEl = document.getElementById('repos-list');
  if (itens.length === 0) {
    sumEl.textContent = 'Todos os materiais estão com estoque adequado.';
    listEl.innerHTML = '';
  } else {
    const criticos = itens.filter(m => calcStatus(m.quantidade, m.estoqueMinimo) === 'Crítico').length;
    const baixos   = itens.filter(m => calcStatus(m.quantidade, m.estoqueMinimo) === 'Baixo').length;
    sumEl.innerHTML = `${criticos > 0 ? `<span style="color:var(--red);font-weight:600">${criticos} Crítico${criticos>1?'s':''}</span>` : ''}${criticos && baixos ? ' &nbsp;·&nbsp; ' : ''}${baixos > 0 ? `<span style="color:var(--amber);font-weight:600">${baixos} Baixo${baixos>1?'s':''}</span>` : ''} — necessitam reposição`;
    listEl.innerHTML = itens.map(m => {
      const st = calcStatus(m.quantidade, m.estoqueMinimo);
      const badgeClass = st === 'Crítico' ? 'badge-critico' : 'badge-baixo';
      const falta = Math.max(0, m.estoqueMinimo - m.quantidade);
      return `<div class="repos-item">
        <span class="repos-badge badge ${badgeClass}">${st}</span>
        <div style="flex:1;min-width:0">
          <div class="repos-nome">${esc(m.nome)}</div>
          <div class="repos-cat">${esc(m.categoria)}${m.localizacao ? ' · ' + esc(m.localizacao) : ''}</div>
        </div>
        <div class="repos-qty">
          <div class="repos-qty-val" style="color:${st==='Crítico'?'var(--red)':'var(--amber)'}">${fmt(m.quantidade)} ${esc(m.unidade)}</div>
          <div class="repos-qty-min">mín: ${fmt(m.estoqueMinimo)} · falta: <strong>${fmt(falta)}</strong></div>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-reposicao').style.display = 'flex';
}

function closeReposicaoModal() {
  document.getElementById('modal-reposicao').style.display = 'none';
}

function exportReposicaoCSV() {
  const itens = getMateriais()
    .filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK')
    .sort((a, b) => {
      const ord = { 'Crítico': 0, 'Baixo': 1 };
      return ord[calcStatus(a.quantidade, a.estoqueMinimo)] - ord[calcStatus(b.quantidade, b.estoqueMinimo)];
    });
  const fmt = v => v % 1 === 0 ? v : v.toFixed(2);
  const header = ['Status', 'Nome', 'Categoria', 'Localização', 'Qtd. Atual', 'Unidade', 'Estoque Mínimo', 'Falta', 'Valor Unit.'];
  const rows = itens.map(m => {
    const falta = Math.max(0, m.estoqueMinimo - m.quantidade);
    return [calcStatus(m.quantidade, m.estoqueMinimo), m.nome, m.categoria, m.localizacao || '', fmt(m.quantidade), m.unidade, fmt(m.estoqueMinimo), fmt(falta), m.valorUnitario > 0 ? m.valorUnitario.toFixed(2).replace('.', ',') : '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `reposicao_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

function printReposicao() {
  const itens = getMateriais()
    .filter(m => calcStatus(m.quantidade, m.estoqueMinimo) !== 'OK')
    .sort((a, b) => {
      const ord = { 'Crítico': 0, 'Baixo': 1 };
      return ord[calcStatus(a.quantidade, a.estoqueMinimo)] - ord[calcStatus(b.quantidade, b.estoqueMinimo)];
    });
  const fmt = v => v % 1 === 0 ? v : v.toFixed(2);
  const rows = itens.map(m => {
    const st = calcStatus(m.quantidade, m.estoqueMinimo);
    const falta = Math.max(0, m.estoqueMinimo - m.quantidade);
    return `<tr>
      <td style="color:${st==='Crítico'?'#dc2626':'#d97706'};font-weight:600">${st}</td>
      <td>${esc(m.nome)}</td>
      <td>${esc(m.categoria)}</td>
      <td>${fmt(m.quantidade)} ${esc(m.unidade)}</td>
      <td>${fmt(m.estoqueMinimo)}</td>
      <td><strong>${fmt(falta)}</strong></td>
    </tr>`;
  }).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Lista de Reposição</title>
    <style>body{font-family:sans-serif;padding:1.5rem}h2{margin-bottom:0.5rem}p{color:#6b7280;margin-bottom:1rem}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #e5e7eb;padding:0.5rem 0.75rem;text-align:left}
    th{background:#f3f4f6;font-weight:600}@media print{button{display:none}}</style></head>
    <body><h2>Lista de Reposição — Autchronos</h2>
    <p>Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</p>
    <table><thead><tr><th>Status</th><th>Material</th><th>Categoria</th><th>Qtd. Atual</th><th>Mínimo</th><th>Falta</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <br><button onclick="window.print()">Imprimir</button></body></html>`);
  w.document.close();
}

// === EXPORTAR CSV ===
function exportCSV() {
  const catMap = {};
  getMateriais().forEach(m => { catMap[m.id] = m.categoria; });
  const allMovs = getMovimentacoes();
  const movsByCat = currentMovCategory
    ? allMovs.filter(m => catMap[m.materialId] === currentMovCategory)
    : allMovs;
  const { start, end } = getFilterWindow(currentPeriod);
  let movs = movsByCat.filter(m => { const d = new Date(m.data); return d >= start && d <= end; });
  if (currentMovSearch) movs = movs.filter(m => m.materialNome.toLowerCase().includes(currentMovSearch));
  if (currentMovTipo)   movs = movs.filter(m => m.tipo === currentMovTipo);
  movs = movs.sort((a, b) => new Date(b.data) - new Date(a.data));

  const header = ['Data/Hora', 'Material', 'Categoria', 'Tipo', 'Quantidade', 'Retirado por', 'Destino', 'Observação'];
  const rows = movs.map(m => {
    const d = new Date(m.data);
    const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return [dateStr, m.materialNome, catMap[m.materialId] || '—', m.tipo, m.quantidade, m.retiradorPor || '', m.destino || '', m.observacao || '']
      .map(v => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });

  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `movimentacoes_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function updateMovCatFilter() {
  const sel = document.getElementById('mov-cat-filter');
  if (!sel) return;
  const cats = getCategorias().slice().sort();
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${esc(c)}" ${c === currentMovCategory ? 'selected' : ''}>${esc(c)}</option>`).join('');
}

// === AJUSTE DE ESTOQUE ===
let ajusteMaterialId = null;
function openAjusteModal(id) {
  if (!guardAdmin()) return;
  ajusteMaterialId = id;
  const material = getMateriais().find(m => m.id === id);
  if (!material) return;
  document.getElementById('ajuste-material-nome').textContent = material.nome;
  const qa = material.quantidade % 1 === 0 ? material.quantidade : material.quantidade.toFixed(2);
  document.getElementById('ajuste-estoque-atual').textContent = `${qa} ${material.unidade}`;
  document.getElementById('ajuste-qtd').value = '';
  clearFieldError('err-ajuste-qtd');
  document.getElementById('modal-ajuste').style.display = 'flex';
  setTimeout(() => document.getElementById('ajuste-qtd').focus(), 50);
}
function closeAjusteModal() {
  document.getElementById('modal-ajuste').style.display = 'none';
  ajusteMaterialId = null;
}
async function saveAjuste() {
  const qtdRaw = document.getElementById('ajuste-qtd').value;
  clearFieldError('err-ajuste-qtd');
  const qtd = parseDecimal(qtdRaw);
  if (qtdRaw.trim() === '' || isNaN(qtd) || qtd < 0) {
    showFieldError('err-ajuste-qtd', 'Informe uma quantidade válida (≥ 0).');
    return;
  }
  const material = getMateriais().find(m => m.id === ajusteMaterialId);
  if (!material) return;
  if (qtd === material.quantidade) { closeAjusteModal(); return; }

  const btn = document.querySelector('button[onclick="saveAjuste()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Aplicando...'; }

  const { error } = await _sb.rpc('registrar_ajuste_estoque', {
    p_material_id:    material.id,
    p_nova_qtd:       qtd,
    p_registrado_por: currentSession.nomeCompleto
  });
  if (error) { alert('Erro: ' + error.message); if (btn) { btn.disabled = false; btn.textContent = 'Aplicar Ajuste'; } return; }

  await loadAllData();
  closeAjusteModal();
  refreshAllSections();
}
