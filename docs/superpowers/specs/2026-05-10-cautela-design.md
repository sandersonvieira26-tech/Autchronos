# Sistema de Cautela — Design Spec
**Data:** 2026-05-10
**Projeto:** Autchronos — ESVJ Engenharia

---

## Visão Geral

Sistema de rastreamento de retirada e devolução de ferramentas por colaboradores. Uma ferramenta retirada fica vinculada ao colaborador até a devolução. Se não devolvida em 24h, um alerta visual e um webhook são emitidos.

Ferramentas são itens que podem ter múltiplas unidades físicas (ex: 5 multímetros do mesmo modelo). `quantidade` na cautela representa unidades retiradas de um mesmo item. `ferramentas_cautela` armazena `quantidade_total` e `quantidade_disponivel` como contadores inteiros.

---

## Modelo de Dados (Supabase)

### Tabela `colaboradores`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `nome` | text | NOT NULL | Nome completo |
| `cpf` | text | NOT NULL, UNIQUE | CPF sem formatação (plaintext — ver Segurança) |
| `setor` | text | | Setor padrão |
| `senha_hash` | text | | PBKDF2 derivado. NULL = primeiro acesso |
| `senha_salt` | text | | Salt por colaborador, gerado no primeiro acesso |
| `created_at` | timestamptz | default now() | |

**RLS:**
- SELECT de `id, nome, cpf, setor, created_at`: qualquer usuário autenticado
- SELECT de `senha_hash, senha_salt`: **bloqueado via REVOKE** (ver abaixo)
- INSERT/UPDATE/DELETE: somente `papel = 'admin'` (exceto via SECURITY DEFINER RPCs)

**Proteção de colunas sensíveis (não é RLS — é GRANT):**
```sql
REVOKE SELECT (senha_hash, senha_salt) ON colaboradores FROM authenticated, anon;
```
Isso impede que qualquer SELECT direto retorne essas colunas, independente de RLS. A leitura só ocorre dentro das funções SECURITY DEFINER.

**Cache no app:** o SELECT do app usa colunas explícitas:
```js
_sb.from('colaboradores').select('id, nome, cpf, setor, created_at')
```
`senha_hash` e `senha_salt` nunca são buscados pelo cliente.

### Tabela `ferramentas_cautela`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `nome` | text | NOT NULL | |
| `codigo` | text | | Código/patrimônio |
| `categoria` | text | NOT NULL | |
| `quantidade_total` | int | NOT NULL, default 1, CHECK (> 0) | Total de unidades cadastradas |
| `quantidade_disponivel` | int | NOT NULL, default 1, CHECK (>= 0 AND <= quantidade_total) | Unidades disponíveis |
| `created_at` | timestamptz | default now() | |

**RLS:**
- SELECT: qualquer usuário autenticado
- INSERT/UPDATE/DELETE: somente `papel = 'admin'`

### Tabela `cautelas`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `colaborador_id` | uuid | FK → colaboradores.id ON DELETE RESTRICT | |
| `colaborador_nome` | text | NOT NULL | Denormalizado na retirada |
| `ferramenta_id` | uuid | FK → ferramentas_cautela.id ON DELETE RESTRICT | |
| `ferramenta_nome` | text | NOT NULL | Denormalizado na retirada |
| `ferramenta_codigo` | text | | Denormalizado na retirada |
| `setor` | text | NOT NULL | Local de uso na retirada |
| `quantidade` | int | NOT NULL, default 1, CHECK (> 0) | Unidades retiradas |
| `observacao` | text | | Opcional |
| `data_retirada` | timestamptz | NOT NULL, default now() | |
| `data_devolucao` | timestamptz | | NULL = em aberto |
| `condicao_devolucao` | text | CHECK IN ('Boa','Com defeito','Danificada') | Preenchido na devolução |
| `alerta_enviado` | boolean | NOT NULL, default false | Evita reenvio do webhook 24h |

**RLS:**
- SELECT: qualquer usuário autenticado
- INSERT: qualquer usuário autenticado (a autenticidade é garantida pela assinatura do colaborador via RPC)
- UPDATE: qualquer usuário autenticado, apenas em linhas onde `data_devolucao IS NULL` (política: `USING (data_devolucao IS NULL)`)
- DELETE: somente `papel = 'admin'`

**FK behavior:**
- `ON DELETE RESTRICT` em `colaborador_id` e `ferramenta_id`
- UI exibe ao falhar: "Este registro possui cautela em aberto e não pode ser excluído"

---

## Funções Postgres (SECURITY DEFINER RPCs)

Todas as operações que tocam `senha_hash`/`senha_salt` ou atualizam `quantidade_disponivel` atomicamente são feitas via RPCs chamadas pelo Supabase client (`_sb.rpc(...)`).

### `verificar_senha_colaborador(p_id uuid, p_hash text) → boolean`

Retorna `true` se o hash fornecido bate com o armazenado. Retorna `false` se não bate **ou se `senha_hash IS NULL`** (primeiro acesso — o client não deve chamar esta função nesse caso).

```sql
CREATE OR REPLACE FUNCTION verificar_senha_colaborador(p_id uuid, p_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_stored text;
BEGIN
  SELECT senha_hash INTO v_stored FROM colaboradores WHERE id = p_id;
  IF v_stored IS NULL THEN RETURN false; END IF;
  RETURN v_stored = p_hash;
END;
$$;

GRANT EXECUTE ON FUNCTION verificar_senha_colaborador TO authenticated, anon;
```

### `definir_senha_colaborador(p_id uuid, p_hash text, p_salt text) → boolean`

Define hash e salt para um colaborador. Só funciona quando `senha_hash IS NULL` (primeiro acesso). Retorna `false` sem fazer nada se a senha já estiver definida — evita sobrescrita acidental.

```sql
CREATE OR REPLACE FUNCTION definir_senha_colaborador(p_id uuid, p_hash text, p_salt text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_existing text;
BEGIN
  SELECT senha_hash INTO v_existing FROM colaboradores WHERE id = p_id;
  IF v_existing IS NOT NULL THEN RETURN false; END IF;
  UPDATE colaboradores SET senha_hash = p_hash, senha_salt = p_salt WHERE id = p_id;
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION definir_senha_colaborador TO authenticated, anon;
```

### `resetar_senha_colaborador(p_id uuid) → void`

Chamada pelo admin para redefinir a assinatura de um colaborador.

```sql
CREATE OR REPLACE FUNCTION resetar_senha_colaborador(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE colaboradores SET senha_hash = NULL, senha_salt = NULL WHERE id = p_id;
END;
$$;

GRANT EXECUTE ON FUNCTION resetar_senha_colaborador TO authenticated;
```

### `buscar_salt_colaborador(p_id uuid) → text`

Retorna apenas o salt do colaborador para o client calcular o hash antes de verificar. Retorna `NULL` se o colaborador não tiver senha definida (primeiro acesso).

```sql
CREATE OR REPLACE FUNCTION buscar_salt_colaborador(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_salt text;
BEGIN
  SELECT senha_salt INTO v_salt FROM colaboradores WHERE id = p_id;
  RETURN v_salt;
END;
$$;

GRANT EXECUTE ON FUNCTION buscar_salt_colaborador TO authenticated, anon;
```

### `registrar_retirada(p_colaborador_id uuid, p_ferramenta_id uuid, p_quantidade int, p_setor text, p_observacao text, p_colaborador_nome text, p_ferramenta_nome text, p_ferramenta_codigo text) → uuid`

Atomic: INSERT em `cautelas` + decremento de `quantidade_disponivel`. Se `quantidade_disponivel < p_quantidade`, levanta exceção. Retorna o `id` da cautela criada.

```sql
CREATE OR REPLACE FUNCTION registrar_retirada(
  p_colaborador_id uuid, p_ferramenta_id uuid, p_quantidade int,
  p_setor text, p_observacao text,
  p_colaborador_nome text, p_ferramenta_nome text, p_ferramenta_codigo text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_disponivel int;
  v_cautela_id uuid;
BEGIN
  -- Lock da linha para evitar race condition
  SELECT quantidade_disponivel INTO v_disponivel
    FROM ferramentas_cautela WHERE id = p_ferramenta_id FOR UPDATE;

  IF v_disponivel < p_quantidade THEN
    RAISE EXCEPTION 'quantidade_insuficiente';
  END IF;

  UPDATE ferramentas_cautela
    SET quantidade_disponivel = quantidade_disponivel - p_quantidade
    WHERE id = p_ferramenta_id;

  INSERT INTO cautelas (
    colaborador_id, colaborador_nome, ferramenta_id, ferramenta_nome,
    ferramenta_codigo, setor, quantidade, observacao
  ) VALUES (
    p_colaborador_id, p_colaborador_nome, p_ferramenta_id, p_ferramenta_nome,
    p_ferramenta_codigo, p_setor, p_quantidade, p_observacao
  ) RETURNING id INTO v_cautela_id;

  RETURN v_cautela_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_retirada TO authenticated, anon;
```

**Tratamento de erro no client:** se a exceção for `quantidade_insuficiente`, exibir "Quantidade insuficiente. Outro colaborador pode ter retirado ao mesmo tempo."

### `registrar_devolucao(p_cautela_id uuid, p_condicao text) → void`

Atomic: UPDATE em `cautelas` + incremento de `quantidade_disponivel`.

```sql
CREATE OR REPLACE FUNCTION registrar_devolucao(p_cautela_id uuid, p_condicao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE v_qtd int; v_ferramenta_id uuid;
BEGIN
  SELECT quantidade, ferramenta_id INTO v_qtd, v_ferramenta_id
    FROM cautelas WHERE id = p_cautela_id AND data_devolucao IS NULL FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cautela_nao_encontrada';
  END IF;

  UPDATE cautelas
    SET data_devolucao = now(), condicao_devolucao = p_condicao
    WHERE id = p_cautela_id;

  UPDATE ferramentas_cautela
    SET quantidade_disponivel = quantidade_disponivel + v_qtd
    WHERE id = v_ferramenta_id;
END;
$$;

GRANT EXECUTE ON FUNCTION registrar_devolucao TO authenticated, anon;
```

---

## Segurança e Privacidade

### Senha / Assinatura — PBKDF2 com Salt

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

### CPF

- Armazenado em texto plano (necessário para busca e importação)
- Base legal LGPD: legítimo interesse para controle de patrimônio
- UI: sempre mascarado (`***.***.***-XX`)
- Busca: CPF completo digitado compara contra plaintext no cache
- Webhooks: `cpf_hash` = SHA-256 sem salt do CPF (known limitation: CPF space é finito; aceito pois webhooks são internos)

---

## Fluxo de Importação de Colaboradores

- Formatos: CSV e XLSX
- SheetJS via CDN `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js` (versão fixada)
- Carregado sob demanda; botão desabilitado + spinner durante carregamento
- Erro de CDN: "Não foi possível carregar o parser. Tente importar como CSV."
- Colunas obrigatórias: `nome`, `cpf` | Opcional: `setor`
- CPFs duplicados: ignorados silenciosamente
- Toast final: `X importados, Y ignorados (já existiam)`
- Após importar: `loadAllData()` para atualizar cache

---

## Fluxo de Retirada (3 passos)

### Passo 1 — Identificar colaborador
- Admin digita CPF completo ou nome → busca no cache `_colaboradores`
- Não encontrado: "Colaborador não cadastrado"

### Passo 2 — Preencher cautela
- Ferramenta: dropdown com `quantidade_disponivel > 0`
- Quantidade: 1 até `quantidade_disponivel` (validado no client e no servidor via RPC)
- Setor: pré-preenchido com `colaborador.setor` se existir
- Observação: opcional

### Passo 3 — Assinatura
**Primeiro acesso** (`senha_hash IS NULL` no cache — o campo não existe no cache; o client verifica chamando `buscar_salt_colaborador` que retorna `null`):
1. Exibe campos "Crie sua senha" + "Confirme sua senha"
2. Client gera `salt = crypto.randomUUID()`
3. Client calcula `hash = PBKDF2(senha, salt)`
4. Chama `definir_senha_colaborador(id, hash, salt)` — retorna `true`
5. Prossegue para `registrar_retirada`

**Acesso subsequente** (salt retornado por `buscar_salt_colaborador`):
1. Exibe campo "Sua senha de retirada"
2. Client calcula `hash = PBKDF2(senha, salt_retornado)`
3. Chama `verificar_senha_colaborador(id, hash)` — se `false`: "Senha incorreta"
4. Prossegue para `registrar_retirada`

**Confirmar retirada:**
- Chama RPC `registrar_retirada(...)` — atômico (INSERT + UPDATE em transação)
- Se `quantidade_insuficiente`: "Quantidade insuficiente. Tente novamente."
- Se sucesso: dispara webhook `cautela_retirada`, atualiza cache, fecha modal

### Senha esquecida
- Admin clica "Redefinir assinatura" na listagem de colaboradores
- Chama `resetar_senha_colaborador(id)` — define `senha_hash = NULL, senha_salt = NULL`
- Toast: "Assinatura redefinida. O colaborador criará nova senha na próxima retirada."

---

## Fluxo de Devolução (2 passos)

### Passo 1 — Identificar cautelas abertas
- Admin informa CPF → lista cautelas com `data_devolucao IS NULL`
- Card: colaborador, ferramenta, código, setor, tempo em aberto (vermelho se >24h)

### Passo 2 — Confirmar devolução
- Selecionar ferramenta (se >1 em aberto)
- Condição: `Boa` / `Com defeito` / `Danificada`
- Assinatura: mesmo fluxo de verificação (busca salt → calcula hash → `verificar_senha_colaborador`)
- Chama RPC `registrar_devolucao(cautela_id, condicao)` — atômico (UPDATE cautela + UPDATE ferramentas)
- Dispara webhook `cautela_devolvida` com `horas_em_posse = Math.floor((Date.now() - data_retirada) / 3_600_000)`
- Atualiza cache e tela

---

## Layout da Aba Cautela

A aba "Cautela" é adicionada à navegação principal, seguindo padrão visual existente.

### Sub-seção: Painel (tela inicial)

- Banner vermelho (visível quando há atrasos): `🔴 N ferramentas com atraso superior a 24h`
- Cards de resumo: Em aberto / Devolvidas hoje* / Ferramentas cadastradas
- Botões: `+ Nova Retirada` | `Registrar Devolução`
- Lista de cautelas abertas (ordem por `data_retirada` crescente):
  - Card normal: colaborador, ferramenta, código, setor, tempo em aberto
  - Card vermelho: `data_retirada` > 24h atrás

*"Devolvidas hoje": comparação feita no client com `toLocaleDateString()` (timezone local do browser) contra `data_devolucao`.

### Sub-seção: Ferramentas

- Tabela: nome, código, categoria, `disponivel/total`
- `+ Nova Ferramenta` (admin only)
- Busca por nome ou código
- Exclusão bloqueada se houver cautela aberta (erro FK RESTRICT com mensagem amigável)

### Sub-seção: Colaboradores

- Lista: nome + CPF mascarado (`***.***.***-XX`)
- `Importar CSV/XLSX` (admin only)
- `Redefinir assinatura` por colaborador (admin only)
- Busca por nome ou CPF completo (contra plaintext no cache)

---

## Sistema de Alertas

### Variável de intervalo

```js
let _cautelaAlertInterval = null;
```

- Ao entrar na aba Cautela: `_cautelaAlertInterval = setInterval(verificarAtrasosCautela, 30 * 60 * 1000)`
- Ao sair da aba Cautela: `clearInterval(_cautelaAlertInterval); _cautelaAlertInterval = null`
- Gerenciado na função `setMobileTab` / troca de aba, igual ao padrão de `_realtimeChannel`

### Ordem de operação do alerta

1. UPDATE `cautelas SET alerta_enviado = true WHERE id = X AND alerta_enviado = false`
2. Se 1 linha afetada: dispara webhook `cautela_atraso`
3. Se 0 linhas afetadas: alerta já enviado, ignorar

### Webhook `cautela_atraso`

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

`horas_em_posse`: inteiro calculado como `Math.floor((data_devolucao - data_retirada) / 3_600_000)`.

---

## Cache e Realtime

Novos arrays globais adicionados ao `loadAllData()`:

```js
let _colaboradores = [];       // select explícito: id, nome, cpf, setor, created_at
let _ferramentas_cautela = [];
let _cautelas = [];            // somente cautelas abertas (data_devolucao IS NULL)
                               // + devolvidas hoje para o card de resumo
```

Novos canais no `setupRealtime()`:
```js
.on('postgres_changes', { event: '*', schema: 'public', table: 'colaboradores' }, loadAndRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'ferramentas_cautela' }, loadAndRefresh)
.on('postgres_changes', { event: '*', schema: 'public', table: 'cautelas' }, loadAndRefresh)
```

---

## Dependências Externas

- **SheetJS 0.18.5** — CDN `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`, carregado sob demanda
- **Web Crypto API** — nativa (Chrome 37+, Firefox 34+, Safari 11+)

---

## Fora de Escopo

- Notificações por SMS, WhatsApp ou e-mail ao colaborador
- Foto de ferramenta
- Edição de cautela após confirmação
- Relatórios/exportação de histórico
- Auto-atendimento de recuperação de senha pelo colaborador
