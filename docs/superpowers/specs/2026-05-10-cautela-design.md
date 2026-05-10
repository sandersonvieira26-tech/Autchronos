# Sistema de Cautela — Design Spec
**Data:** 2026-05-10
**Projeto:** Autchronos — ESVJ Engenharia

---

## Visão Geral

Sistema de rastreamento de retirada e devolução de ferramentas por colaboradores. Uma ferramenta retirada fica vinculada ao colaborador até a devolução. Se não devolvida em 24h, um alerta visual e um webhook são emitidos.

---

## Modelo de Dados (Supabase)

### Tabela `colaboradores`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `nome` | text | NOT NULL | Nome completo |
| `cpf` | text | NOT NULL, UNIQUE | CPF sem formatação |
| `setor` | text | | Setor padrão (pré-preenche o campo) |
| `senha_hash` | text | | SHA-256 da senha. NULL = primeiro acesso |
| `created_at` | timestamptz | default now() | |

### Tabela `ferramentas_cautela`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | serial | PK | |
| `nome` | text | NOT NULL | |
| `codigo` | text | | Código/patrimônio |
| `categoria` | text | NOT NULL | |
| `disponivel` | boolean | default true | Atualizado a cada retirada/devolução |
| `created_at` | timestamptz | default now() | |

### Tabela `cautelas`

| Campo | Tipo | Restrições | Descrição |
|---|---|---|---|
| `id` | uuid | PK, default gen_random_uuid() | |
| `colaborador_id` | uuid | FK → colaboradores.id | |
| `ferramenta_id` | int | FK → ferramentas_cautela.id | |
| `setor` | text | NOT NULL | Local/setor de uso |
| `quantidade` | int | NOT NULL, default 1 | |
| `observacao` | text | | Opcional |
| `data_retirada` | timestamptz | NOT NULL, default now() | |
| `data_devolucao` | timestamptz | | NULL = ainda em aberto |
| `condicao_devolucao` | text | | NULL, 'Boa', 'Com defeito', 'Danificada' |
| `alerta_enviado` | boolean | default false | Evita reenvio do webhook de 24h |

---

## Fluxo de Importação de Colaboradores

- Acesso: admin, sub-seção "Colaboradores" na aba Cautela
- Formatos aceitos: CSV e XLSX
- Colunas obrigatórias: `nome`, `cpf`
- Coluna opcional: `setor`
- CPFs duplicados são ignorados silenciosamente
- Ao finalizar: toast com `X importados, Y ignorados (já existiam)`
- XLSX parseado via biblioteca SheetJS (CDN, carregada sob demanda)

---

## Fluxo de Retirada (3 passos)

### Passo 1 — Identificar colaborador
- Admin digita CPF ou nome
- Sistema busca no cache de colaboradores
- Se não encontrado: mensagem de erro "Colaborador não cadastrado"

### Passo 2 — Preencher cautela
- Selecionar ferramenta (dropdown com apenas as `disponivel = true`)
- Setor/local de uso (pré-preenchido com `colaborador.setor` se existir)
- Quantidade (default 1)
- Observação (opcional)

### Passo 3 — Assinatura
- Exibe: "Confirme sua identidade, [Nome]"
- Campo de senha
- **Primeiro acesso** (`senha_hash IS NULL`): "Crie sua senha de retirada" + confirmação
- Senha convertida para SHA-256 via Web Crypto API antes de salvar/comparar
- Ao confirmar:
  - Insere registro em `cautelas`
  - Atualiza `ferramentas_cautela.disponivel = false`
  - Dispara webhook `cautela_retirada`

---

## Fluxo de Devolução (2 passos)

### Passo 1 — Identificar cautelas abertas
- Admin ou colaborador informa CPF
- Sistema lista todas as cautelas abertas daquele colaborador
- Exibe: ferramenta, código/patrimônio, setor, tempo em aberto

### Passo 2 — Confirmar devolução
- Selecionar a ferramenta a devolver (se houver mais de uma em aberto)
- Condição da ferramenta: Boa / Com defeito / Danificada
- Assinatura (senha do colaborador)
- Ao confirmar:
  - Atualiza `cautelas.data_devolucao = now()` e `condicao_devolucao`
  - Atualiza `ferramentas_cautela.disponivel = true`
  - Dispara webhook `cautela_devolvida`

---

## Layout da Aba Cautela

A aba "Cautela" é adicionada à navegação principal do dashboard, seguindo o padrão visual existente (Materiais, Calibração).

### Sub-seção: Painel (tela inicial)

- **Banner de alerta** (vermelho, visível quando há atrasos):
  `🔴 N ferramentas com atraso superior a 24h`
- **Cards de resumo**: Em aberto / Devolvidas hoje / Ferramentas cadastradas
- **Botões de ação**: `+ Nova Retirada` | `Registrar Devolução`
- **Lista de cautelas abertas**, ordenada por `data_retirada` crescente:
  - Card normal: colaborador, ferramenta, código/patrimônio, setor, tempo em aberto
  - Card vermelho: quando `data_retirada` há mais de 24h

### Sub-seção: Ferramentas

- Tabela com: nome, código/patrimônio, categoria, status (🟢 Disponível / 🔴 Em uso)
- Botão `+ Nova Ferramenta` (admin only)
- Campo de busca por nome ou código

### Sub-seção: Colaboradores

- Lista com nome e CPF mascarado (exibe apenas os 2 últimos dígitos: `***.***.***-XX`)
- Botão `Importar CSV/XLSX` (admin only)
- Campo de busca por nome ou CPF

---

## Sistema de Alertas

### Verificação de atraso
- Roda ao carregar a aba Cautela
- Roda a cada 30 minutos via `setInterval` enquanto a aba estiver ativa
- Critério: `data_devolucao IS NULL AND data_retirada < now() - 24h`

### Badge visual
- Aparece na aba "Cautela" na navegação (igual ao badge de alertas de estoque)
- Número indica quantidade de ferramentas em atraso

### Webhook `cautela_atraso`
- Disparado **uma única vez por cautela** (`alerta_enviado = false → true`)
- Payload:
  ```json
  {
    "evento": "cautela_atraso",
    "colaborador": "João Silva",
    "cpf_hash": "<sha256 do cpf>",
    "ferramenta": "Multímetro Fluke",
    "codigo": "PAT-001",
    "setor": "Elétrica",
    "horas_em_aberto": 26,
    "data_retirada": "2026-05-09T10:00:00Z",
    "timestamp": "..."
  }
  ```

---

## Webhooks

| Evento | Quando | Campos principais |
|---|---|---|
| `cautela_retirada` | Nova retirada confirmada | colaborador, ferramenta, codigo, setor, quantidade, data_retirada |
| `cautela_devolvida` | Devolução confirmada | colaborador, ferramenta, codigo, condicao_devolucao, horas_em_posse, data_devolucao |
| `cautela_atraso` | Primeira vez que passa 24h | colaborador, cpf_hash, ferramenta, codigo, setor, horas_em_aberto, data_retirada |

---

## Segurança e Privacidade

- **Senha/assinatura**: SHA-256 via Web Crypto API. Nunca trafega em claro.
- **CPF na UI**: sempre mascarado na listagem (`***.***.***-XX`)
- **CPF no webhook**: enviado como hash SHA-256, não em texto claro
- **Acesso admin**: cadastro de ferramentas, importação de colaboradores e visualização de todas as cautelas são restritos a `papel = 'admin'`
- **Retirada/devolução**: qualquer usuário logado pode operar (viewer ou admin), desde que o colaborador assine com sua senha

---

## Dependências Externas

- **SheetJS (xlsx)** — parsing de arquivos `.xlsx` no browser, carregado via CDN sob demanda apenas quando o admin acessa a importação
- **Web Crypto API** — nativa nos browsers modernos, sem dependência externa

---

## Fora de Escopo

- Notificações por SMS, WhatsApp ou e-mail ao colaborador
- Foto de ferramenta
- Edição de cautela após confirmação
- Relatórios/exportação de histórico de cautelas
