# Offline Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add IndexedDB-backed offline support so field users can read all data and write materials/equipment/tools offline, with automatic sync on reconnection.

**Architecture:** Outbox Pattern — two IndexedDB stores: `cache` (latest server snapshot per table) and `outbox` (pending writes). `loadAllData()` saves to cache on success and falls back to cache when offline. Each write function gets an offline guard that enqueues the operation instead of hitting Supabase. `syncOutbox()` replays the queue in order on reconnection.

**Tech Stack:** Vanilla JS, IndexedDB API (native browser), Supabase JS v2

---

## File Map

| File | Changes |
|------|---------|
| `index.html` line 1226 | Add IDB module IIFE |
| `index.html` CSS block | Add `.offline-banner` + `.sync-badge` styles |
| `index.html` line 1827 | Add `#offline-banner` div + `#sync-badge` to header |
| `index.html` line 1322 | Modify `loadAllData()` — cache save/load |
| `index.html` after `loadAllData` | Add `setOfflineMode()`, `updateSyncBadge()`, `syncOutbox()` |
| `index.html` line 2470 | `salvarFerramenta()` — offline path |
| `index.html` line 2489 | `excluirFerramenta()` — offline path |
| `index.html` line 2569 | `excluirColaborador()` — offline path |
| `index.html` line 2608 | `processarImportColaboradores()` — block offline |
| `index.html` line 2826 | `nrConfirmar()` — block offline (password auth requires network) |
| `index.html` line 3017 | `devConfirmar()` — block offline |
| `index.html` line 3322 | `saveMovimento()` — queue RPC offline |
| `index.html` line 3741 | `deleteMaterial()` — offline path |
| `index.html` line 3776 | `saveMaterial()` — offline path |
| `index.html` line 4253 | `saveAjuste()` — queue RPC offline |
| `index.html` line 5129 | `saveRenovarCalib()` — offline path |
| `index.html` line 5221 | `saveEquipamento()` — offline path |
| `index.html` line 5321 | `deleteEquipamento()` — offline path |
| `index.html` line 5701 | `DOMContentLoaded` — add IDB.open() + event listeners |

---

## Task 1: Módulo IDB

**Files:**
- Modify: `index.html` — insert after line 1226 (after Supabase client block, before `normMaterial`)

- [ ] **Step 1: Inserir o bloco IDB no index.html**

Inserir o seguinte bloco **após** a linha que fecha o bloco do cliente Supabase (`  { auth: { persistSession: true, autoRefreshToken: true } }`), ou seja, após a linha 1226:

```js
// === INDEXEDDB — OFFLINE CACHE + OUTBOX ===
const IDB = (() => {
  const DB_NAME = 'autchronos-db';
  const DB_VERSION = 1;
  let _db = null;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('cache'))
          db.createObjectStore('cache');
        if (!db.objectStoreNames.contains('outbox'))
          db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess  = e => { _db = e.target.result; resolve(); };
      req.onerror    = e => reject(e.target.error);
    });
  }

  const _tx   = (store, mode) => _db.transaction(store, mode).objectStore(store);
  const _get  = (store, key)  => new Promise((res, rej) => { const r = _tx(store,'readonly').get(key); r.onsuccess = e => res(e.target.result ?? null); r.onerror = e => rej(e.target.error); });
  const _put  = (store, val, key) => new Promise((res, rej) => { const r = key !== undefined ? _tx(store,'readwrite').put(val, key) : _tx(store,'readwrite').put(val); r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });
  const _del  = (store, key)  => new Promise((res, rej) => { const r = _tx(store,'readwrite').delete(key); r.onsuccess = () => res(); r.onerror = e => rej(e.target.error); });
  const _all  = (store)       => new Promise((res, rej) => { const r = _tx(store,'readonly').getAll(); r.onsuccess = e => res(e.target.result); r.onerror = e => rej(e.target.error); });

  return {
    open,
    setCache:     (table, rows) => _put('cache', rows, table),
    getCache:     (table)       => _get('cache', table),
    enqueue:      (op)          => _put('outbox', { ...op, status: 'pending' }),
    dequeue:      (id)          => _del('outbox', id),
    getPending:   async ()      => (await _all('outbox')).filter(o => o.status === 'pending').sort((a,b) => a.createdAt - b.createdAt),
    countPending: async ()      => (await _all('outbox')).filter(o => o.status === 'pending').length,
    markFailed: (id, msg) => new Promise((res, rej) => {
      const s = _tx('outbox', 'readwrite');
      const r = s.get(id);
      r.onsuccess = e => {
        const op = e.target.result;
        if (!op) { res(); return; }
        op.status = 'failed'; op.errorMessage = msg;
        const u = s.put(op);
        u.onsuccess = () => res();
        u.onerror   = e => rej(e.target.error);
      };
      r.onerror = e => rej(e.target.error);
    }),
  };
})();
```

- [ ] **Step 2: Verificar sem erros de sintaxe**

Abra `http://127.0.0.1:8989` no browser e abra o console (F12). Deve aparecer sem nenhum erro vermelho relacionado a `IDB`. Digite `IDB` no console — deve retornar o objeto com os métodos.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat(offline): add IDB module — cache + outbox IndexedDB layer"
```

---

## Task 2: UI — Banner offline + Badge de sync

**Files:**
- Modify: `index.html` — CSS block + HTML da tela de dashboard + funções JS

- [ ] **Step 1: Adicionar CSS ao bloco de estilos**

Localizar o final do bloco de CSS (antes da tag `</style>`) e adicionar:

```css
/* === OFFLINE SYNC UI === */
#offline-banner {
  display: none;
  width: 100%;
  background: #f59e0b;
  color: #1c1917;
  text-align: center;
  padding: 0.35rem 1rem;
  font-size: 0.8125rem;
  font-weight: 500;
  position: relative;
  z-index: 200;
  letter-spacing: 0.01em;
}
[data-theme="dark"] #offline-banner { background: #b45309; color: #fef3c7; }
#sync-badge {
  display: none;
  background: #f97316;
  color: #fff;
  border-radius: 9999px;
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  min-width: 1.2rem;
  text-align: center;
  cursor: pointer;
  line-height: 1.4;
}
```

- [ ] **Step 2: Adicionar o banner offline ao HTML do dashboard**

No HTML gerado por `showLoadingScreen`, localizar a linha:
```js
    <header class="dashboard-header">
```
(linha ~1827 dentro da template literal de `showLoadingScreen`)

Inserir **antes** dessa linha:
```js
    <div id="offline-banner">Sem conexão — exibindo dados do último acesso</div>
```

- [ ] **Step 3: Adicionar o badge de sync ao header**

Na mesma template literal, localizar:
```js
        <button class="btn-logout" onclick="toggleSaldo()"
```

Inserir **antes** desse botão:
```js
        <span id="sync-badge" onclick="showSyncStatus()" title="Operações pendentes de sincronização"></span>
```

- [ ] **Step 4: Adicionar as funções JS setOfflineMode, updateSyncBadge, showSyncStatus**

Inserir após a função `loadAllData()` (após a linha que fecha o bloco `}`):

```js
function setOfflineMode(isOffline) {
  const banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = isOffline ? 'block' : 'none';
}

async function updateSyncBadge() {
  const badge = document.getElementById('sync-badge');
  if (!badge) return;
  const count = await IDB.countPending();
  if (count > 0) {
    badge.textContent = count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

async function showSyncStatus() {
  const pending = await IDB.getPending();
  if (pending.length === 0) { showToast('Nenhuma operação pendente.'); return; }
  const lines = pending.map(op =>
    op.type === 'rpc'
      ? `• ${op.rpcName} (${new Date(op.createdAt).toLocaleTimeString()})`
      : `• ${op.op} ${op.table} (${new Date(op.createdAt).toLocaleTimeString()})`
  ).join('\n');
  showToast(`${pending.length} pendente${pending.length>1?'s':''}:\n${lines}`, 'info', 6000);
}
```

- [ ] **Step 5: Verificar**

Recarregue o app. No console, execute `setOfflineMode(true)` — o banner âmbar deve aparecer no topo da tela. Execute `setOfflineMode(false)` — some.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(offline): add offline banner and sync badge UI"
```

---

## Task 3: loadAllData com cache + syncOutbox + init

**Files:**
- Modify: `index.html` — `loadAllData()`, após `loadAllData`, `DOMContentLoaded`

- [ ] **Step 1: Substituir loadAllData() pela versão com cache**

Localizar a função `loadAllData()` (linha ~1322) e substituir pelo seguinte:

```js
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

  const tableResults = { materiais: mr, categorias: cr, movimentacoes: movr, profiles: pr,
    equipamentos_calibracao: er, colaboradores: colr, ferramentas_cautela: ferr, cautelas: cautr };
  const errs = Object.entries(tableResults).filter(([, r]) => r.error);
  if (errs.length) {
    errs.forEach(([t, r]) => console.error(`loadAllData [${t}]:`, r.error.message));
    if (navigator.onLine) showToast(`Erro ao carregar: ${errs.map(([t]) => t).join(', ')}`, 'error');
  }

  async function resolve(result, cacheKey) {
    if (!result.error) { await IDB.setCache(cacheKey, result.data); return result.data; }
    return (await IDB.getCache(cacheKey)) || [];
  }

  const [matRows, catRows, movRows, profRows, eqRows, colRows, ferrRows, cauRows] = await Promise.all([
    resolve(mr, 'materiais'), resolve(cr, 'categorias'), resolve(movr, 'movimentacoes'),
    resolve(pr, 'profiles'), resolve(er, 'equipamentos_calibracao'),
    resolve(colr, 'colaboradores'), resolve(ferr, 'ferramentas_cautela'), resolve(cautr, 'cautelas'),
  ]);

  _materiais           = matRows.map(normMaterial);
  _categorias          = catRows.map(c => c.nome);
  _movimentacoes       = movRows.map(normMovimento);
  _profiles            = profRows.map(normProfile);
  _equipamentos        = eqRows.map(normEquipamento);
  _colaboradores       = colRows.map(normColaborador);
  _ferramentas_cautela = ferrRows.map(normFerramentaCautela);
  _cautelas            = cauRows.map(normCautela);

  setOfflineMode(!navigator.onLine);
  await updateSyncBadge();
}
```

- [ ] **Step 2: Adicionar a função syncOutbox após loadAllData**

Inserir logo após o fechamento de `loadAllData`:

```js
async function syncOutbox() {
  if (!navigator.onLine) return;
  const pending = await IDB.getPending();
  if (pending.length === 0) { setOfflineMode(false); return; }

  showToast('Conexão restaurada — sincronizando...');
  let synced = 0;

  for (const op of pending) {
    try {
      let error;
      if (op.type === 'rpc') {
        ({ error } = await _sb.rpc(op.rpcName, op.payload));
      } else if (op.op === 'insert') {
        ({ error } = await _sb.from(op.table).insert(op.payload));
      } else if (op.op === 'update') {
        ({ error } = await _sb.from(op.table).update(op.payload).eq(op.matchKey, op.matchValue));
      } else if (op.op === 'delete') {
        ({ error } = await _sb.from(op.table).delete().eq(op.matchKey, op.matchValue));
      }
      if (error) {
        await IDB.markFailed(op.id, error.message);
        showToast(`Erro ao sincronizar ${op.table || op.rpcName}: ${error.message}`, 'error');
      } else {
        await IDB.dequeue(op.id);
        synced++;
      }
    } catch (err) {
      await IDB.markFailed(op.id, err.message);
      showToast(`Erro inesperado ao sincronizar: ${err.message}`, 'error');
    }
  }

  if (synced > 0) showToast(`✓ ${synced} operaç${synced > 1 ? 'ões sincronizadas' : 'ão sincronizada'}`);

  await loadAllData();
  refreshAllSections();
  await updateSyncBadge();
  setOfflineMode(false);
}
```

- [ ] **Step 3: Modificar DOMContentLoaded**

Localizar (linha ~5701):
```js
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
```

Substituir por:
```js
window.addEventListener('DOMContentLoaded', async () => {
  await IDB.open();
  window.addEventListener('online',  syncOutbox);
  window.addEventListener('offline', () => setOfflineMode(true));

  const session = await getAppSession();
  if (session) {
    await loadAllData();
    showLoadingScreen(session);
  } else {
    renderLogin();
    showScreen('login');
  }
});
```

- [ ] **Step 4: Verificar**

Abra o browser. Abra DevTools → Application → Storage → IndexedDB. Após login, deve aparecer `autchronos-db` com os stores `cache` e `outbox`. No store `cache`, cada tabela deve ter dados.

- [ ] **Step 5: Testar modo offline**

No DevTools → Network → marque "Offline". Recarregue a página. O banner âmbar deve aparecer e os dados devem carregar do cache (não ficar tela branca).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(offline): loadAllData with IDB cache + syncOutbox + DOMContentLoaded init"
```

---

## Task 4: Ferramenta e Colaborador — operações offline

**Files:**
- Modify: `index.html` — `salvarFerramenta`, `excluirFerramenta`, `excluirColaborador`, `processarImportColaboradores`

- [ ] **Step 1: salvarFerramenta — adicionar caminho offline**

Localizar `async function salvarFerramenta()` (~linha 2470). Após a validação e antes do `_sb.from(...)`:

Substituir o corpo da função por:

```js
async function salvarFerramenta() {
  const nome = document.getElementById('fc-nome').value.trim();
  const codigo = document.getElementById('fc-codigo').value.trim();
  const categoria = document.getElementById('fc-categoria').value.trim();
  const qtd = parseInt(document.getElementById('fc-quantidade').value, 10);
  if (!nome || !categoria || isNaN(qtd) || qtd < 1) {
    showToast('Preencha nome, categoria e quantidade.', 'error'); return;
  }
  const payload = { nome, codigo: codigo || null, categoria, quantidade_total: qtd, quantidade_disponivel: qtd };

  if (!navigator.onLine) {
    await IDB.enqueue({ type: 'table', table: 'ferramentas_cautela', op: 'insert', payload, createdAt: Date.now(), userId: currentSession?.usuarioId });
    _ferramentas_cautela.push(normFerramentaCautela({ ...payload, id: -(Date.now()), created_at: new Date().toISOString() }));
    closeFerramentaModal();
    renderCautela(); updateTabIndicators();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }

  const { error } = await _sb.from('ferramentas_cautela').insert(payload);
  if (error) { showToast('Erro ao salvar ferramenta.', 'error'); return; }
  closeFerramentaModal();
  await loadAllData();
  refreshAllSections();
  showToast('Ferramenta cadastrada!');
}
```

- [ ] **Step 2: excluirFerramenta — adicionar caminho offline**

Localizar `async function excluirFerramenta(id, nome)` (~linha 2489). Substituir pelo seguinte:

```js
async function excluirFerramenta(id, nome) {
  if (!guardAdmin()) return;
  if (!confirm(`Excluir "${nome}"? Não é possível excluir se houver cautelas em aberto.`)) return;

  if (!navigator.onLine) {
    await IDB.enqueue({ type: 'table', table: 'ferramentas_cautela', op: 'delete', matchKey: 'id', matchValue: id, payload: { id }, createdAt: Date.now(), userId: currentSession?.usuarioId });
    _ferramentas_cautela = _ferramentas_cautela.filter(f => f.id !== id);
    renderCautela(); updateTabIndicators();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }

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
```

- [ ] **Step 3: excluirColaborador — adicionar caminho offline**

Localizar `async function excluirColaborador(id, nome)` (~linha 2569). Substituir pelo seguinte:

```js
async function excluirColaborador(id, nome) {
  if (!guardAdmin()) return;
  if (!confirm(`Excluir colaborador "${nome}"?`)) return;

  if (!navigator.onLine) {
    await IDB.enqueue({ type: 'table', table: 'colaboradores', op: 'delete', matchKey: 'id', matchValue: id, payload: { id }, createdAt: Date.now(), userId: currentSession?.usuarioId });
    _colaboradores = _colaboradores.filter(c => c.id !== id);
    renderCautela();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }

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
```

- [ ] **Step 4: processarImportColaboradores — bloquear offline**

Localizar `async function processarImportColaboradores()` (~linha 2608). Inserir como **primeira linha do corpo** da função (após a abertura `{`):

```js
  if (!navigator.onLine) { showToast('Importação requer conexão com a internet.', 'error'); return; }
```

- [ ] **Step 5: Testar offline**

1. Abrir o app no browser
2. Ir em DevTools → Network → Offline
3. Abrir a tab Cautela → Ferramentas → adicionar uma ferramenta
4. Deve aparecer na lista imediatamente + toast "Salvo localmente..."
5. O badge de sync deve mostrar "1"
6. Desmarcar Offline
7. O syncOutbox deve disparar e o toast "✓ 1 operação sincronizada" deve aparecer

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat(offline): ferramenta/colaborador CRUD — offline queue + optimistic UI"
```

---

## Task 5: Material — CRUD offline

**Files:**
- Modify: `index.html` — `deleteMaterial`, `saveMaterial`

- [ ] **Step 1: deleteMaterial — adicionar caminho offline**

Localizar `async function deleteMaterial(id)` (~linha 3741). Substituir o callback do `openConfirmDelete` pela versão offline-aware:

```js
async function deleteMaterial(id) {
  if (!guardAdmin()) return;
  const material = getMateriais().find(m => m.id === id);
  if (!material) return;
  openConfirmDelete(
    'Excluir material',
    `Tem certeza que deseja excluir <span class="confirm-del-name">${esc(material.nome)}</span>? Todo o histórico de movimentações será perdido. Esta ação não pode ser desfeita.`,
    async () => {
      if (!navigator.onLine) {
        await IDB.enqueue({ type: 'table', table: 'materiais', op: 'delete', matchKey: 'id', matchValue: id, payload: { id }, createdAt: Date.now(), userId: currentSession?.usuarioId });
        _materiais = _materiais.filter(m => m.id !== id);
        refreshAllSections();
        await updateSyncBadge();
        showToast('Salvo localmente — sincroniza ao reconectar');
        return;
      }
      const { error } = await _sb.from('materiais').delete().eq('id', id);
      if (error) { alert('Erro ao excluir: ' + error.message); return; }
      dispararWebhook({
        evento: 'material_excluido',
        nome: material.nome, categoria: material.categoria,
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
```

- [ ] **Step 2: saveMaterial — adicionar caminho offline**

Localizar `async function saveMaterial()` (~linha 3776). Substituir pelo seguinte (mantendo toda a validação existente, adicionando o bloco offline antes do bloco `if (editingMaterialId)`):

```js
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
  if (!isFinite(valor)) { showFieldError('err-m-valor', 'Informe um valor numérico válido.'); valid = false; }
  if (!valid) return;

  const localizacao = document.getElementById('m-local').value.trim() || null;
  const btn = document.querySelector('button[onclick="saveMaterial()"]');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  if (!navigator.onLine) {
    if (editingMaterialId) {
      const old = getMateriais().find(m => m.id === editingMaterialId);
      const matPayload = { nome, categoria: cat, quantidade: qtd, unidade, estoque_minimo: min, valor_unitario: valor, localizacao };
      await IDB.enqueue({ type: 'table', table: 'materiais', op: 'update', matchKey: 'id', matchValue: editingMaterialId, payload: matPayload, createdAt: Date.now(), userId: currentSession?.usuarioId });
      _materiais = _materiais.map(m => m.id === editingMaterialId
        ? normMaterial({ id: editingMaterialId, ...matPayload, estoque_minimo: min, valor_unitario: valor })
        : m);
      const diff = qtd - (old?.quantidade ?? 0);
      if (diff !== 0) {
        const movPayload = { material_id: editingMaterialId, material_nome: nome, tipo: diff > 0 ? 'entrada' : 'saída', quantidade: Math.abs(diff), registrado_por: currentSession.nomeCompleto, observacao: null };
        await IDB.enqueue({ type: 'table', table: 'movimentacoes', op: 'insert', payload: movPayload, createdAt: Date.now() + 1, userId: currentSession?.usuarioId });
        _movimentacoes = [normMovimento({ ...movPayload, id: -(Date.now()), data: new Date().toISOString() }), ..._movimentacoes];
      }
    } else {
      const matPayload = { nome, categoria: cat, quantidade: qtd, unidade, estoque_minimo: min, valor_unitario: valor, localizacao };
      await IDB.enqueue({ type: 'table', table: 'materiais', op: 'insert', payload: matPayload, createdAt: Date.now(), userId: currentSession?.usuarioId });
      _materiais = [..._materiais, normMaterial({ ...matPayload, id: -(Date.now()) })];
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    closeMaterialModal();
    refreshAllSections();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }

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
```

- [ ] **Step 3: Verificar**

1. Ativar modo offline no DevTools
2. Adicionar um material novo → aparece na lista com badge "1"
3. Editar um material existente → atualização aparece imediatamente
4. Desativar offline → sync automático → dados corretos do servidor

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(offline): material CRUD — offline queue + optimistic UI"
```

---

## Task 6: Movimentação e Ajuste — RPCs offline

**Files:**
- Modify: `index.html` — `saveMovimento`, `saveAjuste`

- [ ] **Step 1: saveMovimento — caminho offline (fila de RPC)**

Localizar `async function saveMovimento()` (~linha 3322). Localizar o bloco que inicia com:
```js
  const { data: qtdFinal, error } = await _sb.rpc('registrar_movimentacao', {
```

Inserir **antes** dessa linha o seguinte bloco offline:

```js
  if (!navigator.onLine) {
    const rpcParams = {
      p_material_id: material.id, p_delta: delta, p_tipo: tipo,
      p_quantidade_movimento: qtd, p_registrado_por: currentSession.nomeCompleto,
      p_retirado_por: retiradorPor || null, p_destino: destino || null, p_observacao: observacao || null
    };
    await IDB.enqueue({ type: 'rpc', rpcName: 'registrar_movimentacao', payload: rpcParams, createdAt: Date.now(), userId: currentSession?.usuarioId });
    // Optimistic local update
    _materiais = _materiais.map(m => m.id === material.id ? { ...m, quantidade: novaQtd } : m);
    _movimentacoes = [normMovimento({
      id: -(Date.now()), material_id: material.id, material_nome: material.nome,
      tipo, quantidade: qtd, data: new Date().toISOString(),
      registrado_por: currentSession.nomeCompleto, retirado_por: retiradorPor || null,
      destino: destino || null, observacao: observacao || null
    }), ..._movimentacoes];
    if (btn) { btn.disabled = false; btn.textContent = 'Registrar'; }
    closeMovimentoModal();
    refreshAllSections();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }
```

- [ ] **Step 2: saveAjuste — caminho offline (fila de RPC)**

Localizar `async function saveAjuste()` (~linha 4253). Localizar a linha:
```js
  const { error } = await _sb.rpc('registrar_ajuste_estoque', {
```

Inserir **antes** dessa linha:

```js
  if (!navigator.onLine) {
    const rpcParams = { p_material_id: material.id, p_nova_qtd: qtd, p_registrado_por: currentSession.nomeCompleto };
    await IDB.enqueue({ type: 'rpc', rpcName: 'registrar_ajuste_estoque', payload: rpcParams, createdAt: Date.now(), userId: currentSession?.usuarioId });
    _materiais = _materiais.map(m => m.id === material.id ? { ...m, quantidade: qtd } : m);
    _movimentacoes = [normMovimento({
      id: -(Date.now()), material_id: material.id, material_nome: material.nome,
      tipo: 'ajuste', quantidade: Math.abs(qtd - material.quantidade),
      data: new Date().toISOString(), registrado_por: currentSession.nomeCompleto,
      retirado_por: null, destino: null, observacao: 'Ajuste offline'
    }), ..._movimentacoes];
    if (btn) { btn.disabled = false; btn.textContent = 'Aplicar Ajuste'; }
    closeAjusteModal();
    refreshAllSections();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }
```

- [ ] **Step 3: Verificar**

1. Ativar Offline no DevTools
2. Ir em Materiais → registrar uma entrada de material → aparece no histórico de movimentações
3. Quantidade do material atualiza otimisticamente
4. Badge de sync incrementa
5. Desativar Offline → sync automático

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(offline): movimentação + ajuste — queue RPC offline + optimistic local update"
```

---

## Task 7: Equipamentos e Calibração — offline

**Files:**
- Modify: `index.html` — `saveEquipamento`, `saveRenovarCalib`, `deleteEquipamento`

- [ ] **Step 1: deleteEquipamento — caminho offline**

Localizar `async function deleteEquipamento(id)` (~linha 5321). Substituir o callback do `openConfirmDelete`:

```js
async function deleteEquipamento(id) {
  if (!guardAdmin()) return;
  const equip = getEquipamentos().find(e => e.id === id);
  if (!equip) return;
  openConfirmDelete(
    'Excluir equipamento',
    `Tem certeza que deseja excluir <span class="confirm-del-name">${esc(equip.nome)}</span>? O histórico de calibrações será perdido. Esta ação não pode ser desfeita.`,
    async () => {
      if (!navigator.onLine) {
        await IDB.enqueue({ type: 'table', table: 'equipamentos_calibracao', op: 'delete', matchKey: 'id', matchValue: id, payload: { id }, createdAt: Date.now(), userId: currentSession?.usuarioId });
        _equipamentos = _equipamentos.filter(e => e.id !== id);
        renderEquipamentos(); updateTabIndicators();
        await updateSyncBadge();
        showToast('Salvo localmente — sincroniza ao reconectar');
        return;
      }
      const { error } = await _sb.from('equipamentos_calibracao').delete().eq('id', id);
      if (error) { alert('Erro ao excluir: ' + error.message); return; }
      dispararWebhook({
        evento: 'equipamento_excluido', equipamento: equip.nome,
        identificacao: equip.identificacao || null, categoria: equip.categoria || null,
        responsavel: equip.responsavel || null,
        usuario: currentSession?.nomeCompleto || 'admin', data: new Date().toISOString()
      });
      await loadAllData();
      renderEquipamentos();
      showToast('Equipamento excluído.');
    }
  );
}
```

- [ ] **Step 2: saveRenovarCalib — caminho offline**

Localizar `async function saveRenovarCalib()` (~linha 5129). Inserir **antes** da linha `const { error } = await _sb.from('equipamentos_calibracao').update({`:

```js
  if (!navigator.onLine) {
    const eqPayload = { data_ultima_calibracao: dataCal, data_proxima_calibracao: dataProxima, numero_certificado: cert, certificado_path: certPath };
    await IDB.enqueue({ type: 'table', table: 'equipamentos_calibracao', op: 'update', matchKey: 'id', matchValue: renovarCalibId, payload: eqPayload, createdAt: Date.now(), userId: currentSession?.usuarioId });
    const histPayload = { equipamento_id: renovarCalibId, equipamento_nome: equip.nome, data_calibracao: dataCal, data_proxima: dataProxima, numero_certificado: cert, certificado_path: certPath, responsavel: equip.responsavel || null, registrado_por: currentSession?.nomeCompleto || 'Sistema' };
    await IDB.enqueue({ type: 'table', table: 'calibracoes_historico', op: 'insert', payload: histPayload, createdAt: Date.now() + 1, userId: currentSession?.usuarioId });
    _equipamentos = _equipamentos.map(e => e.id === renovarCalibId
      ? normEquipamento({ id: renovarCalibId, nome: e.nome, categoria: e.categoria, identificacao: e.identificacao, validade_meses: e.validadeMeses, responsavel: e.responsavel, em_calibracao: e.emCalibracao, numero_certificado: cert, certificado_path: certPath, data_ultima_calibracao: dataCal, data_proxima_calibracao: dataProxima })
      : e);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar Renovação'; }
    closeRenovarCalibModal();
    renderEquipamentos(); renderCards(); renderDaySummary();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }
```

- [ ] **Step 3: saveEquipamento — caminho offline**

Localizar `async function saveEquipamento()` (~linha 5221). Após a construção do objeto `payload` e antes do bloco `if (editingEquipamentoId)`, inserir:

```js
  if (!navigator.onLine) {
    if (editingEquipamentoId) {
      await IDB.enqueue({ type: 'table', table: 'equipamentos_calibracao', op: 'update', matchKey: 'id', matchValue: editingEquipamentoId, payload, createdAt: Date.now(), userId: currentSession?.usuarioId });
      _equipamentos = _equipamentos.map(e => e.id === editingEquipamentoId
        ? normEquipamento({ ...payload, id: editingEquipamentoId, certificado_path: e.certificadoPath, em_calibracao: e.emCalibracao })
        : e);
    } else {
      const tempId = -(Date.now());
      await IDB.enqueue({ type: 'table', table: 'equipamentos_calibracao', op: 'insert', payload, createdAt: Date.now(), userId: currentSession?.usuarioId });
      _equipamentos = [..._equipamentos, normEquipamento({ ...payload, id: tempId, certificado_path: null, em_calibracao: false })];
      // Histórico inicial também na fila
      const histPayload = { equipamento_id: tempId, equipamento_nome: nome, data_calibracao: payload.data_ultima_calibracao, data_proxima: dataProxima, numero_certificado: numeroCertificado, certificado_path: null, responsavel, registrado_por: currentSession?.nomeCompleto || 'Sistema', observacao: 'Registro inicial' };
      await IDB.enqueue({ type: 'table', table: 'calibracoes_historico', op: 'insert', payload: histPayload, createdAt: Date.now() + 1, userId: currentSession?.usuarioId });
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    closeEquipamentoModal();
    renderEquipamentos(); renderCards(); renderDaySummary(); updateTabIndicators();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }
```

**Nota:** O histórico inicial de um equipamento offline usa `tempId` como `equipamento_id`. Quando sincronizar, o equipamento receberá um novo ID do servidor. O histórico offline referenciará o tempId e falhará na FK. Para mitigar isso, o syncOutbox processa ops em ordem cronológica — o INSERT do equipamento vem primeiro, mas o `tempId` não corresponde ao ID real. Isso é uma **limitação conhecida do v1**: o histórico de equipamentos criados offline pode falhar ao sincronizar. A opção mais segura é bloquear offline a criação de equipamentos novos e permitir apenas edição + renovação. Ajustar o bloco acima para:

```js
  if (!navigator.onLine) {
    if (!editingEquipamentoId) {
      showToast('Criação de equipamento requer conexão. Edição e renovação funcionam offline.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      return;
    }
    await IDB.enqueue({ type: 'table', table: 'equipamentos_calibracao', op: 'update', matchKey: 'id', matchValue: editingEquipamentoId, payload, createdAt: Date.now(), userId: currentSession?.usuarioId });
    _equipamentos = _equipamentos.map(e => e.id === editingEquipamentoId
      ? normEquipamento({ ...payload, id: editingEquipamentoId, certificado_path: e.certificadoPath, em_calibracao: e.emCalibracao })
      : e);
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
    closeEquipamentoModal();
    renderEquipamentos(); renderCards(); renderDaySummary(); updateTabIndicators();
    await updateSyncBadge();
    showToast('Salvo localmente — sincroniza ao reconectar');
    return;
  }
```

- [ ] **Step 4: Verificar**

1. Offline → editar um equipamento → lista atualiza + badge incrementa
2. Offline → renovar calibração → data atualiza + badge incrementa
3. Offline → tentar criar novo equipamento → toast de bloqueio aparece
4. Reconectar → sync automático

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat(offline): equipamentos + calibração — offline queue + optimistic UI"
```

---

## Task 8: Bloquear operações que requerem rede

**Files:**
- Modify: `index.html` — `nrConfirmar`, `devConfirmar`

**Contexto:** `nrConfirmar` e `devConfirmar` usam RPCs de verificação de senha (`buscar_salt_colaborador`, `verificar_senha_colaborador`) que exigem rede. Suporte completo offline para retirada/devolução requereria cache do hash+salt de cada colaborador (v2 feature). Por ora, bloqueia com mensagem clara.

- [ ] **Step 1: nrConfirmar — bloquear offline**

Localizar `async function nrConfirmar()` (~linha 2826). Inserir como primeira linha do `try {`:

```js
    if (!navigator.onLine) {
      if (errEl) errEl.textContent = 'Retirada requer conexão com a internet.';
      return;
    }
```

- [ ] **Step 2: devConfirmar — bloquear offline**

Localizar `async function devConfirmar()` (~linha 3017). Inserir após a validação do `senha`:

```js
    if (!navigator.onLine) { errEl.textContent = 'Devolução requer conexão com a internet.'; return; }
```

(Inserir após a linha `if (!senha) { errEl.textContent = 'Informe a senha.'; return; }`)

- [ ] **Step 3: Verificar**

Ativar Offline. Tentar registrar retirada → campo de erro mostra "Retirada requer conexão com a internet." Tentar devolução → mesma mensagem.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(offline): block retirada/devolução offline — require network for password auth"
```

---

## Task 9: Bump SW + verificação final

**Files:**
- Modify: `sw.js` — bump cache version
- Verify: browser end-to-end test

- [ ] **Step 1: Bump SW cache**

No `sw.js`, alterar:
```js
const CACHE = 'autchronos-v7';
```
para:
```js
const CACHE = 'autchronos-v8';
```

- [ ] **Step 2: Commit e push**

```bash
git add sw.js index.html
git commit -m "feat(offline): bump SW cache to v8 for offline-sync release"
git push origin main
```

- [ ] **Step 3: Teste de fumaça completo**

Abrir `http://127.0.0.1:8989` no browser.

**Online → preenche o cache:**
1. Login → verificar DevTools → IndexedDB → `autchronos-db` → `cache` contém todas as tabelas
2. Badge de sync não aparece

**Simular offline (DevTools → Network → Offline):**
3. Banner âmbar aparece no topo
4. Todos os dados continuam visíveis (do cache)
5. Adicionar ferramenta → aparece + badge "1"
6. Deletar colaborador → some + badge "2"
7. Registrar movimentação → aparece no histórico + badge "3"
8. Tentar retirada de ferramenta → mensagem "requer conexão"

**Reconectar (desmarcar Offline):**
9. Toast "Conexão restaurada — sincronizando..."
10. Toast "✓ 3 operações sincronizadas"
11. Badge some
12. Dados do servidor carregados (substituem as entradas com ID temporário)

---

## Limitações conhecidas (v1)

| Operação | Status | Motivo |
|----------|--------|--------|
| Criar equipamento novo offline | Bloqueado | FK do histórico incompatível com tempId |
| Retirada de ferramenta offline | Bloqueado | Verificação de senha requer rede |
| Devolução de ferramenta offline | Bloqueado | Verificação de senha requer rede |
| Importar colaboradores offline | Bloqueado | Operação em lote, não é campo |
| Item com tempId deletado antes de sync | Não suportado | Delete por tempId não encontra row real |

**Caminho para v2 (retirada/devolução offline):**
1. Adicionar `salt` e `senha_hash` ao select de colaboradores
2. Cachear em IndexedDB junto com os outros dados
3. Fazer `derivarHash(senha, salt)` localmente e comparar com cache
4. Enfileirar RPC `registrar_retirada` / `registrar_devolucao` para replay
