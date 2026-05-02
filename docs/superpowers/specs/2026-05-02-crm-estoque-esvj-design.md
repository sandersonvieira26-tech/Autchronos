# CRM de Estoque de Materiais — ESVJ Engenharia

**Data:** 2026-05-02  
**Projeto:** Sistema web de gestão de estoque para ESVJ Engenharia  
**Stack:** HTML + CSS + JavaScript puros, single-file, nginx:alpine no EasyPanel

---

## 1. Visão Geral

Aplicação web completa em um único arquivo `index.html` com três telas (Login, Registro, Dashboard), controle de acesso por papéis (admin / viewer), persistência via `localStorage` e deployment via container Docker (nginx) no EasyPanel.

---

## 2. Estrutura do Repositório

```
meu-projeto/
├── index.html          ← aplicação completa (HTML + CSS + JS inline)
├── Dockerfile          ← FROM nginx:alpine
└── nginx.conf          ← configuração mínima, porta 80
```

---

## 3. Identidade Visual

| Papel | Descrição | Hex |
|---|---|---|
| Primário | Laranja — botões, destaques, badges | `#f97316` |
| Laranja escuro | Hover, header accent | `#ea580c` |
| Header background | Cinza chumbo | `#1f2937` |
| Fundo do dashboard | Cinza claro | `#f3f4f6` |
| Cards / modal | Branco | `#ffffff` |
| Texto principal | Cinza escuro | `#111827` |
| Status OK | Verde | `#16a34a` |
| Status Baixo | Âmbar | `#d97706` |
| Status Crítico | Vermelho | `#dc2626` |

**Logo:** SVG inline "ESVJ" (bold, laranja) + "Engenharia" (cinza claro). Aparece no header do dashboard e centralizado nas telas de Login e Registro.

---

## 4. Fluxo de Navegação

```
Carrega página
  └─ Sessão ativa no localStorage? ──► Dashboard
  └─ Não ──────────────────────────► Login

Login
  ├─ Credenciais válidas ─────────► Dashboard (papel da sessão)
  └─ Link "Criar conta" ──────────► Registro

Registro
  ├─ Formulário válido ───────────► Dashboard (papel: viewer, login automático)
  └─ Link "Já tenho conta" ───────► Login

Dashboard
  └─ Botão "Sair" ────────────────► Remove sessão → Login
```

Três `<div>` raiz no HTML, alternados via `display: none / block` por JavaScript. Sem redirecionamento de URL.

---

## 5. Papéis de Acesso

| Funcionalidade | Admin | Viewer |
|---|---|---|
| Ver cards de resumo | ✅ | ✅ |
| Ver tabela de materiais | ✅ | ✅ |
| Ver gráfico e histórico | ✅ | ✅ |
| Adicionar material | ✅ | ❌ |
| Editar material | ✅ | ❌ |
| Excluir material | ✅ | ❌ |

Credenciais pré-semeadas no `localStorage` na primeira carga: `admin / 1234` com papel `admin`.  
Novos usuários registrados recebem papel `viewer` automaticamente.

---

## 6. Modelos de Dados (localStorage)

### 6.1 Usuários (`crm_usuarios`)
```json
[
  {
    "id": 1,
    "nomeCompleto": "Administrador",
    "usuario": "admin",
    "senha": "1234",
    "papel": "admin"
  }
]
```

### 6.2 Sessão atual (`crm_sessao`)
```json
{
  "usuarioId": 1,
  "usuario": "admin",
  "nomeCompleto": "Administrador",
  "papel": "admin"
}
```

### 6.3 Materiais (`crm_materiais`)
```json
[
  {
    "id": 1,
    "nome": "Cabo de Cobre 4mm",
    "categoria": "Elétrico",
    "quantidade": 150,
    "unidade": "m",
    "estoqueMinimo": 50,
    "valorUnitario": 8.50
  }
]
```
Status calculado em runtime: `OK` (qtd ≥ mínimo), `Baixo` (qtd entre 50–99% do mínimo), `Crítico` (qtd < 50% do mínimo).

### 6.4 Movimentações (`crm_movimentacoes`)
```json
[
  {
    "id": "uuid",
    "materialId": 1,
    "materialNome": "Cabo de Cobre 4mm",
    "tipo": "entrada",
    "quantidade": 50,
    "data": "2026-04-28T10:30:00.000Z",
    "registradoPor": "admin"
  }
]
```
Movimentações são geradas automaticamente quando o admin edita a quantidade de um material:  
- Quantidade aumentou → registra `entrada` com a diferença  
- Quantidade diminuiu → registra `saída` com a diferença

---

## 7. Telas

### 7.1 Login
- Card centralizado, fundo cinza claro com sutil padrão geométrico CSS
- Logo ESVJ no topo do card
- Campos: Usuário/e-mail, Senha
- Checkbox "Lembrar-me"
- Botão laranja "Entrar"
- Link "Esqueci minha senha" → `alert()` informativo (sem fluxo real)
- Link "Criar conta" → navega para Registro
- Mensagem de erro abaixo do botão para credenciais inválidas

### 7.2 Registro
- Mesmo card/logo da tela de login
- Campos: Nome completo, Usuário (único), Senha, Confirmar senha
- Validações: campos obrigatórios, usuário já existente, senhas não coincidem
- Botão laranja "Criar conta" → login automático como viewer → Dashboard
- Link "Já tenho conta" → Login

### 7.3 Dashboard

#### Header
- Fundo `#1f2937`, logo ESVJ à esquerda
- À direita: avatar circular laranja com iniciais do usuário + nome + botão "Sair"

#### Cards de resumo (4 cards)
| Card | Cálculo |
|---|---|
| Total de Itens | `materiais.length` |
| Itens em Baixo Estoque | Materiais com `status !== 'OK'` |
| Valor Total do Estoque | `Σ (quantidade × valorUnitario)` |
| Entradas do Mês | Soma das entradas com `data` no mês corrente |

Layout: 4 colunas no desktop, 2×2 no tablet, 1 coluna no mobile.

#### Tabela de Materiais
Colunas: ID, Nome, Categoria, Quantidade, Unidade, Estoque Mínimo, Status, Ações  
Filtros acima da tabela: busca por nome (text input) + dropdown Categoria + dropdown Status  
Botão "Adicionar Material" acima da tabela — visível apenas para admin  
Botões Editar / Excluir na coluna Ações — visíveis apenas para admin

#### Modal Adicionar/Editar (admin)
Campos: Nome, Categoria (dropdown com categorias existentes + opção "Nova categoria"), Quantidade, Unidade, Estoque Mínimo, Valor Unitário  
Ao salvar edição: diferença de quantidade gera movimentação automaticamente

#### Seção Movimentações
Filtro de período em botões agrupados: `Hoje` | `7 dias` | `14 dias` | `30 dias`  
- **Gráfico SVG de barras agrupadas:** Entradas (laranja) vs Saídas (cinza) no período selecionado, agrupadas por material  
- **Tabela de histórico:** Data, Material, Tipo (badge colorido), Quantidade, Registrado por  
Dados mockados pré-populados (últimos 30 dias) para visualização imediata na primeira carga

---

## 8. Responsividade

| Breakpoint | Layout |
|---|---|
| ≥ 1024px (desktop) | Cards 4×1, tabela completa, gráfico largo |
| 768–1023px (tablet) | Cards 2×2, tabela com scroll horizontal |
| < 768px (mobile) | Cards 1×1, tabela compacta com scroll, modal full-width |

---

## 9. Deployment (EasyPanel)

**Dockerfile:**
```dockerfile
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
```

**nginx.conf:**
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

No EasyPanel: criar novo serviço → App → Git repository → build automático via Dockerfile.

---

## 10. Categorias de Materiais Mockadas

Pré-populadas para demonstração:
- Elétrico
- Hidráulico
- Civil
- Ferramentas
- EPI

---

## 11. Fora do Escopo

- Recuperação real de senha (apenas alerta informativo)
- Backend / API real
- Autenticação segura (senhas em texto plano no localStorage — apenas simulação)
- Paginação da tabela de materiais
- Exportação de dados (PDF/Excel)
