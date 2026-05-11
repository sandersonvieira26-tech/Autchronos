# Sistema de Cautela — Design Spec
**Data:** 2026-05-10
**Projeto:** Autchronos — ESVJ Engenharia

---

## Visão Geral

Sistema de rastreamento de retirada e devolução de ferramentas por colaboradores. Uma ferramenta retirada fica vinculada ao colaborador até a devolução. Se não devolvida em 24h, um alerta visual e um webhook são emitidos.

Ferramentas são itens **únicos** (um registro = um item físico). `quantidade` na cautela representa o número de unidades do mesmo modelo retiradas — portanto `ferramentas_cautela` armazena um contador `quantidade_total` / `quantidade_disponivel`, não um boolean.

---

## Modelo de Dados (Supabase)

### Tabela `colaboradores`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `nome` | text | NOT NULL | Nome completo |
| `cpf` | text | NOT NULL, UNIQUE | CPF sem formatação (armazenado em texto plano — ver seção Segurança) |
| `setor` | text | | Setor padrão (pré-preenche o campo de retirada) |
| `senha_hash` | text | | PBKDF2 derivado da senha. NULL = primeiro acesso |
| `senha_salt` | text | | Salt aleatório por colaborador (gerado no primeiro acesso) |
| `created_at` | timestamptz | default now() | |

**RLS:**
- Leitura de `id`, `nome`, `cpf`, `setor`: qualquer usuário autenticado
- Leitura de `senha_hash`, `senha_salt`: nenhum papel (colunas nunca retornadas por SELECT direto — verificação feita via função Postgres RPC)
- Escrita (INSERT/UPDATE/DELETE): somente `papel = 'admin'`

### Tabela `ferramentas_cautela`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `nome` | text | NOT NULL | |
| `codigo` | text | | Código/patrimônio |
| `categoria` | text | NOT NULL | |
| `quantidade_total` | int | NOT NULL, default 1 | Total de unidades cadastradas |
| `quantidade_disponivel` | int | NOT NULL, default 1 | Unidades disponíveis no momento |
| `created_at` | timestamptz | default now() | |

**RLS:**
- Leitura: qualquer usuário autenticado
- Escrita: somente `papel = 'admin'`

**Regra:** `quantidade_disponivel` nunca pode ser negativo. Ferramenta só aparece disponível para retirada quando `quantidade_disponivel > 0`.

### Tabela `cautelas`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `colaborador_id` | uuid | FK → colaboradores.id ON DELETE RESTRICT | |
| `colaborador_nome` | text | NOT NULL | Denormalizado no momento da retirada |
| `ferramenta_id` | uuid | FK → ferramentas_cautela.id ON DELETE RESTRICT | |
| `ferramenta_nome` | text | NOT NULL | Denormalizado no momento da retirada |
| `ferramenta_codigo` | text | | Denormalizado no momento da retirada |
| `setor` | text | NOT NULL | Local/setor de uso no momento da retirada |
| `quantidade` | int | NOT NULL, default 1 | Unidades retiradas |
| `observacao` | text | | Opcional |
| `data_retirada` | timestamptz | NOT NULL, default now() | |
| `data_devolucao` | timestamptz | | NULL = ainda em aberto |
| `condicao_devolucao` | text | | NULL, 'Boa', 'Com defeito', 'Danificada' |
| `alerta_enviado` | boolean | default false | Evita reenvio do webhook de 24h |

**RLS:**
- Leitura: qualquer usuário autenticado
- INSERT: qualquer usuário autenticado (retirada via assinatura do colaborador)
- UPDATE: qualquer usuário autenticado (devolução via assinatura do colaborador)
- DELETE: somente `papel = 'admin'`

**FK behavior:**
- `ON DELETE RESTRICT` em ambas as FKs — impede exclusão de colaborador ou ferramenta com cautela aberta
- UI exibe: "Este colaborador/ferramenta possui cautela em aberto e não pode ser excluído"

**Índice único parcial (previne race condition):**
```sql
CREATE UNIQUE INDEX cautelas_ferramenta_aberta_idx
  ON cautelas (ferramenta_id, quantidade)
  WHERE data_devolucao IS NULL;
```
Se dois admins tentarem registrar a mesma ferramenta simultaneamente, o segundo INSERT falha com violação de unicidade — capturado pelo app com mensagem "Ferramenta já retirada por outro colaborador".

---

## Segurança e Privacidade

### Senha / Assinatura — PBKDF2 com Salt

A senha de assinatura é derivada com PBKDF2 usando Web Crypto API (nativa, sem dependência externa):

```js
async function derivarHash(senha, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(senha), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}
```

- Salt: UUID aleatório gerado no primeiro acesso (`crypto.randomUUID()`)
- Iterações: 100.000 (resistente a ataque offline)
- Verificação: via Postgres RPC `verificar_senha_colaborador(id, hash)` — nunca expõe `senha_hash` ou `senha_salt` em SELECT direto

### CPF

- Armazenado em texto plano no banco (necessário para busca/importação)
- Base legal LGPD: legítimo interesse para controle de patrimônio da empresa
- Exibição na UI: sempre mascarado (`***.***.***-XX`)
- Busca: aceita CPF completo digitado pelo admin (compara contra o campo plaintext)
- Webhooks: enviado como `cpf_hash` (SHA-256 do CPF) — nunca em texto claro

### RLS Summary

`senha_hash` e `senha_salt` nunca são selecionados diretamente pelo app. A verificação é feita por uma Postgres Function (SECURITY DEFINER) que recebe o hash derivado do lado cliente e retorna `boolean`. Isso impede que o anon key exponha esses campos.

---

## Fluxo de Importação de Colaboradores

- Acesso: admin, sub-seção "Colaboradores" na aba Cautela
- Formatos aceitos: CSV e XLSX
- XLSX parseado via **SheetJS** (CDN `https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js`) — carregado sob demanda quando o admin clica "Importar"
- Loading state: botão desabilitado + spinner enquanto a lib carrega ou o arquivo é processado
- Timeout/erro CDN: mensagem "Não foi possível carregar o parser de Excel. Tente importar como CSV."
- Colunas obrigatórias: `nome`, `cpf`
- Coluna opcional: `setor`
- CPFs duplicados (já existentes no banco): ignorados silenciosamente
- Ao finalizar: toast com `X importados, Y ignorados (já existiam)`

---

## Fluxo de Retirada (3 passos)

### Passo 1 — Identificar colaborador
- Admin digita CPF (completo) ou nome
- Sistema busca no cache `_colaboradores`
- Se não encontrado: "Colaborador não cadastrado"

### Passo 2 — Preencher cautela
- Selecionar ferramenta (dropdown com apenas as que têm `quantidade_disponivel > 0`)
- Quantidade (1 até `quantidade_disponivel` da ferramenta)
- Setor/local de uso (pré-preenchido com `colaborador.setor` se existir)
- Observação (opcional)

### Passo 3 — Assinatura
- Exibe: "Confirme sua identidade, [Nome]"
- Campo de senha
- **Primeiro acesso** (`senha_hash IS NULL`): "Crie sua senha de retirada" + campo de confirmação
- Processo de verificação:
  1. Client deriva `hash = PBKDF2(senha, salt)` — se primeiro acesso, gera novo salt
  2. Chama RPC `verificar_senha_colaborador(id, hash)` que retorna `true/false`
  3. Se primeiro acesso: chama RPC `definir_senha_colaborador(id, hash, salt)`
- Ao confirmar com sucesso:
  - INSERT em `cautelas` (com campos denormalizados)
  - UPDATE `ferramentas_cautela.quantidade_disponivel -= quantidade`
  - Dispara webhook `cautela_retirada`
  - Atualiza cache e tela

### Senha esquecida
- Não há auto-atendimento (sem email/SMS em escopo)
- Admin pode resetar: botão "Redefinir assinatura" na listagem de colaboradores (admin only)
- Ação: UPDATE `colaboradores SET senha_hash = NULL, senha_salt = NULL` → colaborador cria nova senha na próxima retirada
- Toast: "Assinatura redefinida. O colaborador criará uma nova senha na próxima retirada."

---

## Fluxo de Devolução (2 passos)

### Passo 1 — Identificar cautelas abertas
- Admin ou colaborador informa CPF
- Sistema lista todas as cautelas abertas daquele colaborador
- Exibe por card: ferramenta, código/patrimônio, setor, tempo em aberto (vermelho se >24h)

### Passo 2 — Confirmar devolução
- Selecionar a ferramenta a devolver (se houver mais de uma em aberto)
- Condição da ferramenta: `Boa` / `Com defeito` / `Danificada`
- Assinatura (senha do colaborador — mesma verificação via RPC)
- Ao confirmar:
  - UPDATE `cautelas SET data_devolucao = now(), condicao_devolucao = X`
  - UPDATE `ferramentas_cautela.quantidade_disponivel += quantidade`
  - Dispara webhook `cautela_devolvida`
  - Atualiza cache e tela

---

## Layout da Aba Cautela

A aba "Cautela" é adicionada à navegação principal do dashboard, seguindo o padrão visual existente.

### Sub-seção: Painel (tela inicial)

- **Banner de alerta** (vermelho, visível quando há atrasos):
  `🔴 N ferramentas com atraso superior a 24h`
- **Cards de resumo**: Em aberto / Devolvidas hoje (timezone local) / Ferramentas cadastradas
- **Botões de ação**: `+ Nova Retirada` | `Registrar Devolução`
- **Lista de cautelas abertas**, ordenada por `data_retirada` crescente:
  - Cada card: colaborador, ferramenta, código/patrimônio, setor, tempo em aberto
  - Card vermelho: quando `data_retirada` há mais de 24h

### Sub-seção: Ferramentas

- Tabela: nome, código/patrimônio, categoria, disponível/total
- Botão `+ Nova Ferramenta` (admin only)
- Busca por nome ou código
- Ferramenta com cautela aberta: bloqueada para exclusão (FK RESTRICT)

### Sub-seção: Colaboradores

- Lista: nome + CPF mascarado (`***.***.***-XX`)
- Botão `Importar CSV/XLSX` (admin only)
- Botão "Redefinir assinatura" por colaborador (admin only)
- Busca aceita CPF completo ou nome (busca contra valor plaintext no cache)

---

## Sistema de Alertas

### Variável de intervalo

```js
let _cautelaAlertInterval = null;
```

Gerenciada junto com a troca de abas:
- Ao entrar na aba Cautela: inicia o intervalo
- Ao sair da aba Cautela: `clearInterval(_cautelaAlertInterval)` antes de iniciar outro — evita acúmulo

### Verificação de atraso

- Roda ao entrar na aba Cautela
- Roda a cada 30 minutos via `setInterval` enquanto a aba estiver ativa
- Critério: `data_devolucao IS NULL AND data_retirada < now() - 24h`

### Badge visual

- Aparece na aba "Cautela" na navegação (igual ao badge de alertas de estoque)
- Número indica quantidade de cautelas em atraso

### Ordem de operação do alerta

Para evitar envio duplo ou perda silenciosa:
1. UPDATE `cautelas SET alerta_enviado = true` WHERE id = X
2. Se UPDATE suceder: dispara webhook `cautela_atraso`
3. Se webhook falhar: log no console (fire-and-forget — mesmo padrão existente)

### Webhook `cautela_atraso`

Disparado **uma única vez por cautela** (`alerta_enviado = false → true`).

```json
{
  "evento": "cautela_atraso",
  "colaborador": "João Silva",
  "cpf_hash": "<sha256 do cpf>",
  "ferramenta": "Multímetro Fluke",
  "codigo": "PAT-001",
  "setor": "Elétrica",
  "quantidade": 1,
  "horas_em_aberto": 26,
  "data_retirada": "2026-05-09T10:00:00.000Z",
  "timestamp": "2026-05-10T12:00:00.000Z"
}
```

---

## Webhooks

### `cautela_retirada`

```json
{
  "evento": "cautela_retirada",
  "colaborador": "João Silva",
  "cpf_hash": "<sha256 do cpf>",
  "ferramenta": "Multímetro Fluke",
  "codigo": "PAT-001",
  "setor": "Elétrica",
  "quantidade": 1,
  "observacao": null,
  "data_retirada": "2026-05-10T14:00:00.000Z",
  "timestamp": "2026-05-10T14:00:00.000Z"
}
```

### `cautela_devolvida`

```json
{
  "evento": "cautela_devolvida",
  "colaborador": "João Silva",
  "cpf_hash": "<sha256 do cpf>",
  "ferramenta": "Multímetro Fluke",
  "codigo": "PAT-001",
  "condicao_devolucao": "Boa",
  "quantidade": 1,
  "horas_em_posse": 4,
  "data_retirada": "2026-05-10T10:00:00.000Z",
  "data_devolucao": "2026-05-10T14:00:00.000Z",
  "timestamp": "2026-05-10T14:00:00.000Z"
}
```

### `cautela_atraso`

*(ver seção Sistema de Alertas)*

---

## Cache e Realtime

Dois novos arrays globais:

```js
let _colaboradores = [];
let _ferramentas_cautela = [];
let _cautelas = [];
```

Adicionados ao `loadAllData()` existente. Novos canais Realtime (dentro de `setupRealtime()`):

```js
.on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, async () => { ... })
.on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas_cautela' }, async () => { ... })
.on('postgres_changes', { event: '*', schema: 'public', table: 'cautelas' }, async () => { ... })
```

Após importação de colaboradores: `loadAllData()` chamado para atualizar o cache.

---

## Dependências Externas

- **SheetJS (xlsx)** — parsing de `.xlsx` no browser, CDN `https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js`, carregado sob demanda
- **Web Crypto API** — nativa nos browsers modernos (Chrome 37+, Firefox 34+, Safari 11+), sem dependência externa

---

## Fora de Escopo

- Notificações por SMS, WhatsApp ou e-mail ao colaborador
- Foto de ferramenta
- Edição de cautela após confirmação
- Relatórios/exportação de histórico de cautelas
- Auto-atendimento de recuperação de senha pelo colaborador
