# Offline Sync com IndexedDB — Design Spec

**Data:** 2026-05-13  
**Projeto:** Autchronos — Gestão de Estoque  
**Abordagem escolhida:** Outbox Pattern (Fila de Operações)

---

## Contexto

O app precisa funcionar sem internet no campo (almoxarifados, obras) onde 2–5 usuários podem operar simultaneamente sem conexão. Ao reconectar, todas as operações offline devem ser sincronizadas com o Supabase. Conflitos entre usuários são resolvidos aplicando todas as operações independentemente (cada uma vira um registro no histórico).

---

## Arquitetura

### IndexedDB — banco local `autchronos-db` (versão 1)

Dois object stores:

**`cache`**
- Guarda o snapshot mais recente de cada tabela do Supabase
- Key: nome da tabela (string)
- Value: array de objetos (mesma estrutura retornada pelo Supabase)
- Atualizado sempre que `loadAllData()` obtém sucesso do servidor
- Usado como fallback quando o app está offline

**`outbox`**
- Fila de operações de escrita realizadas offline
- Key: id auto-increment
- Value:
  ```
  {
    id: number (auto),
    table: string,
    op: "insert" | "update" | "delete",
    payload: object,        // dados completos do registro
    matchKey: string,       // campo para identificar o registro (ex: "id")
    matchValue: any,        // valor do matchKey para update/delete
    createdAt: number,      // Date.now()
    userId: string,         // auth.user.id
    status: "pending" | "failed",
    errorMessage?: string
  }
  ```

### Módulo `IDB` (IIFE inline em index.html)

Expõe a interface pública:

| Função | Descrição |
|--------|-----------|
| `IDB.open()` | Abre/cria o banco (chamado no init, retorna Promise) |
| `IDB.setCache(table, rows)` | Sobrescreve cache da tabela |
| `IDB.getCache(table)` | Retorna array de registros (null se não cacheado) |
| `IDB.enqueue(op)` | Adiciona operação à fila outbox |
| `IDB.dequeue(id)` | Remove operação da fila (após sync bem-sucedido) |
| `IDB.getPending()` | Retorna todas as operações com status "pending", ordem cronológica |
| `IDB.markFailed(id, msg)` | Marca operação como falha com mensagem de erro |
| `IDB.countPending()` | Retorna número de operações pendentes |

### Funções novas em index.html

| Função | Descrição |
|--------|-----------|
| `_tryWrite(table, op, payload, supabaseFn, cacheUpdater)` | Wrapper genérico: tenta Supabase online, senão enfileira offline |
| `_updateLocalCache(table, op, payload, matchKey, matchValue)` | Aplica operação otimisticamente no cache IndexedDB |
| `syncOutbox()` | Replaya todas as operações pendentes ao reconectar |
| `updateSyncBadge()` | Atualiza o contador de pendentes na navbar |
| `setOfflineMode(isOffline)` | Mostra/esconde banner offline e badge |

---

## Fluxo de dados

### Escrita online (comportamento atual, sem mudança visível)
```
usuário salva
→ supabaseFn() → sucesso
→ IDB.setCache(table, rows atualizados do servidor)
→ render normal
```

### Escrita offline
```
usuário salva
→ supabaseFn() → falha (offline)
→ IDB.enqueue({ table, op, payload, ... })
→ _updateLocalCache(table, op, payload)   ← atualiza cache local otimisticamente
→ updateSyncBadge()
→ showToast("Salvo localmente — será sincronizado ao reconectar")
→ render com dados locais (experiência contínua, sem bloqueio)
```

### Leitura offline
```
loadAllData()
→ _sb.from(table).select() → falha (offline)
→ IDB.getCache(table) → retorna dados cacheados
→ render com dados do último acesso
→ banner "Modo offline — dados do último acesso em campo" visível
```

### Reconexão (evento `window online`)
```
syncOutbox() dispara:
  showToast("Conexão restaurada — sincronizando...")
  ops = IDB.getPending()   ← ordem cronológica
  para cada op:
    → supabaseFn(op) → sucesso → IDB.dequeue(op.id)
    → supabaseFn(op) → erro   → IDB.markFailed(op.id, erro.message)
                              → showToast("Erro ao sincronizar [tabela]: [msg]")
  ao final:
    → loadAllData()   ← atualiza cache com dados reais do servidor
    → updateSyncBadge()
    → showToast("✓ N operações sincronizadas")  (se N > 0)
```

### Conflito entre usuários offline
Toda operação de campo é modelada como INSERT (movimentação, cautela, calibração). Dois usuários que registram movimentações diferentes para o mesmo material geram dois registros independentes no Supabase — ambos entram no histórico e o saldo final é a soma. Nenhuma operação é perdida.

Para UPDATE (ex: devolução de ferramenta): envia como-está ao sincronizar. Se dois usuários marcarem a mesma cautela como devolvida, o segundo UPDATE não causa erro (apenas sobrescreve o mesmo valor), o que é inofensivo.

---

## UI

### Banner offline
```html
<div id="offline-banner" style="display:none">
  Sem conexão — exibindo dados do último acesso
</div>
```
- Fixo no topo da tela, fundo âmbar (#f59e0b), texto escuro
- Aparece quando `!navigator.onLine`
- Some automaticamente ao reconectar

### Badge de sync na navbar
```html
<span id="sync-badge" style="display:none">N</span>
```
- Ao lado do ícone de menu ou no header
- Mostra número de operações na fila
- Clicável: abre toast com lista das operações pendentes

### Toasts

| Evento | Mensagem |
|--------|----------|
| Operação offline | "Salvo localmente — sincroniza ao reconectar" |
| Reconectou | "Conexão restaurada — sincronizando..." |
| Sync concluído | "✓ 3 operações sincronizadas" |
| Erro de sync | "Erro ao sincronizar materiais: [msg]" |

---

## Operações cobertas pelo offline sync

| Tabela | Operações offline suportadas |
|--------|------------------------------|
| `materiais` | insert, update (ajuste de quantidade), delete |
| `movimentacoes` | insert, delete |
| `cautelas` | insert (retirada), update (devolução) |
| `ferramentas_cautela` | insert, delete |
| `colaboradores` | insert, delete |
| `equipamentos_calibracao` | insert, update, delete |
| `calibracoes_historico` | insert, delete |

**Fora do escopo offline:**
- `categorias` — operação administrativa, pode esperar conexão
- `profiles` — gerenciamento de usuário, não ocorre em campo

---

## Funções existentes a modificar (ajuste cirúrgico)

Cada função de escrita recebe uma chamada a `_tryWrite` internamente. O comportamento online não muda — apenas adiciona o fallback offline.

Estimativa: ~12 funções de save/delete existentes + `loadAllData`.

---

## Escopo de implementação

- ~300 linhas novas (módulo IDB + syncOutbox + wrappers + UI)
- Ajustes cirúrgicos em ~12 funções existentes
- Tudo inline em index.html (sem novos arquivos de deploy)
- Nenhuma mudança em Supabase, server.js ou sw.js

---

## O que NÃO está no escopo

- Resolução de conflito com interface manual (usuário escolhe qual versão manter)
- Sync incremental com delta (toda reconexão faz `loadAllData` completo)
- Notificação push quando outro usuário sincronizou (já coberto pelo Realtime)
- Operações offline para categorias e profiles
