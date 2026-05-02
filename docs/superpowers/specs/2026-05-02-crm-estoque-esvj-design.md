# CRM de Estoque de Materiais — ESVJ Engenharia

**Data:** 2026-05-02  
**Projeto:** Sistema web de gestão de estoque para ESVJ Engenharia  
**Stack:** HTML + CSS + JavaScript puros, single-file, nginx:alpine no EasyPanel

---

## 1. Visão Geral

Aplicação web completa em um único arquivo `index.html` com três telas (Login, Registro, Dashboard), controle de acesso por papéis (admin / viewer), persistência via `localStorage` e deployment via container Docker (nginx) no EasyPanel.

O documento HTML deve incluir `<html lang="pt-BR">` e `<meta charset="UTF-8">`.

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
  └─ Sessão ativa? ────────────────► Dashboard
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

### 6.2 Sessão atual (`crm_sessao` ou `crm_sessao_temp`)

Quando "Lembrar-me" está **marcado**: sessão salva em `localStorage` com a chave `crm_sessao` (persiste ao fechar o navegador).  
Quando "Lembrar-me" está **desmarcado**: sessão salva em `sessionStorage` com a chave `crm_sessao_temp` (apagada ao fechar a aba).  
O JS deve verificar `localStorage.getItem('crm_sessao')` e depois `sessionStorage.getItem('crm_sessao_temp')` na carga da página.

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

**Regra de status (calculada em runtime, sem campo armazenado):**

```
qtd >= estoqueMinimo                              → OK
qtd >= (estoqueMinimo * 0.5) AND qtd < estoqueMinimo → Baixo
qtd < (estoqueMinimo * 0.5)                       → Crítico
```

### 6.4 Movimentações (`crm_movimentacoes`)
```json
[
  {
    "id": "uuid-v4",
    "materialId": 1,
    "materialNome": "Cabo de Cobre 4mm",
    "tipo": "entrada",
    "quantidade": 50,
    "data": "2026-04-28T10:30:00.000Z",
    "registradoPor": "admin"
  }
]
```

**Semântica:** Movimentações são derivadas automaticamente da diferença de quantidade ao editar um material.  
- Quantidade aumentou → registra `entrada` com a diferença positiva  
- Quantidade diminuiu → registra `saída` com a diferença absoluta  

Não existe registro independente de movimentação: toda movimentação é consequência de uma edição de quantidade. Uma correção de erro de digitação também gera movimentação; isso é aceito como limitação do sistema (sem back-end real).

**Dados mockados na primeira carga:** ~25 registros distribuídos nos últimos 30 dias, referenciando apenas `materialId`s existentes na lista de materiais mockados. Ao menos um registro de cada tipo (`entrada` e `saída`) deve cair no dia corrente (horário local) para que o filtro "Hoje" exiba barras no gráfico. Os demais registros podem ser distribuídos livremente nos 29 dias anteriores.

---

## 7. Telas

### 7.1 Login
- Card centralizado, fundo cinza claro com sutil padrão geométrico CSS
- Logo ESVJ no topo do card
- Campo **Usuário** (aceita apenas nome de usuário — sem campo de e-mail; o label é "Usuário", não "Usuário/e-mail")
- Campo **Senha**
- Checkbox **"Lembrar-me"** — controla se a sessão vai para `localStorage` (marcado) ou `sessionStorage` (desmarcado)
- Botão laranja **"Entrar"**
- Link **"Esqueci minha senha"** → `alert("Funcionalidade indisponível. Entre em contato com o administrador do sistema.")`
- Link **"Criar conta"** → navega para Registro
- Mensagem de erro em vermelho abaixo do botão: "Usuário ou senha incorretos."

### 7.2 Registro
- Mesmo card/logo da tela de login
- Campos: Nome completo, Usuário (único, sem espaços), Senha, Confirmar senha
- Validações e mensagens de erro inline:
  - Campo vazio → "Este campo é obrigatório."
  - Usuário já existente → "Este nome de usuário já está em uso."
  - Senhas não coincidem → "As senhas não coincidem."
- Botão laranja **"Criar conta"** → login automático como viewer (sessão em `sessionStorage`, sem "Lembrar-me" na tela de registro) → Dashboard
- Link **"Já tenho conta"** → Login

### 7.3 Dashboard

#### Header
- Fundo `#1f2937`, logo ESVJ à esquerda
- À direita: avatar circular laranja com iniciais + nome do usuário + botão "Sair"
- **Iniciais do avatar:** primeiras letras de cada palavra do `nomeCompleto`, limitado a 2 caracteres. Se o nome tiver apenas uma palavra, usar as duas primeiras letras dessa palavra. (ex: "João Silva" → "JS", "Administrador" → "AD")

#### Cards de resumo (4 cards)

| Card | Cálculo |
|---|---|
| Total de Itens | `materiais.length` |
| Itens em Baixo Estoque | Materiais com status `Baixo` ou `Crítico` |
| Valor Total do Estoque | `Σ (quantidade × valorUnitario)` formatado em R$ |
| Entradas do Mês | Soma das `quantidade` das movimentações do tipo `entrada` no mês corrente |

> O card "Entradas do Mês" exibe a **soma numérica** das quantidades que entraram no mês (ex: 320), sem rótulo de unidade — os materiais têm unidades diferentes (m, kg, un), portanto a soma é exibida como número puro. Não há card equivalente para saídas; o balanço detalhado está na seção de Movimentações.

Layout: 4 colunas no desktop, 2×2 no tablet, 1 coluna no mobile.

#### Tabela de Materiais
Colunas: ID, Nome, Categoria, Quantidade, Unidade, Estoque Mínimo, Status, Ações  
Filtros acima da tabela: busca por nome (text input) + dropdown Categoria + dropdown Status  
Botão **"Adicionar Material"** acima da tabela — visível apenas para admin  
Botões **Editar** / **Excluir** na coluna Ações — visíveis apenas para admin  
**Estado vazio:** quando nenhum material corresponde aos filtros, exibir linha única com texto "Nenhum material encontrado."

#### Modal Adicionar/Editar (admin)
Campos: Nome, Categoria, Quantidade, Unidade, Estoque Mínimo, Valor Unitário

**Campo Categoria:** dropdown com categorias existentes + opção `"+ Nova categoria"` no final da lista.  
Ao selecionar `"+ Nova categoria"`: um campo de texto aparece imediatamente abaixo do dropdown para digitar o nome da nova categoria. Ao salvar o modal, a nova categoria é adicionada à lista global de categorias disponíveis.

Ao salvar uma **edição**: a diferença de quantidade é registrada como movimentação automaticamente.  
Ao salvar um **novo** material: nenhuma movimentação é gerada (quantidade inicial não é considerada entrada).

#### Seção Movimentações

Filtro de período em botões agrupados: `Hoje` | `7 dias` | `14 dias` | `30 dias`

**Agrupamento do gráfico por período:**

| Filtro | Granularidade | Número de barras |
|---|---|---|
| Hoje | Por hora | 24 barras |
| 7 dias | Por dia | 7 barras |
| 14 dias | Por dia | 14 barras |
| 30 dias | Blocos de 6 dias | 5 barras (janela rolante: hoje − 30 dias, dividida em 5 blocos de 6 dias cada) |

- **Gráfico SVG de barras agrupadas:** Entradas (laranja `#f97316`) vs Saídas (cinza `#6b7280`) no período selecionado, com rótulos de valor acima das barras e legenda abaixo.  
- **Estado vazio do gráfico:** se não há movimentações no período, exibir mensagem centralizada "Sem movimentações neste período." no lugar do SVG.

- **Tabela de histórico:** colunas: Data/Hora, Material, Tipo (badge "Entrada" laranja / "Saída" cinza), Quantidade, Registrado por  
- **Estado vazio da tabela:** exibir linha única "Nenhuma movimentação encontrada neste período."

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
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

No EasyPanel: criar novo serviço → App → Git repository → build automático via Dockerfile.

---

## 10. Dados Mockados de Materiais

Pré-populados na primeira carga (10 itens, garantindo ao menos 3 em status Baixo/Crítico):

| ID | Nome | Categoria | Qtd | Unidade | Est. Mínimo | Valor Unit. (R$) | Status calculado |
|---|---|---|---|---|---|---|---|
| 1 | Cabo de Cobre 4mm | Elétrico | 150 | m | 50 | 8,50 | OK |
| 2 | Disjuntor 20A | Elétrico | 8 | un | 20 | 35,00 | Crítico |
| 3 | Tubo PVC 50mm | Hidráulico | 60 | m | 30 | 12,00 | OK |
| 4 | Joelho PVC 50mm | Hidráulico | 12 | un | 30 | 4,50 | Baixo |
| 5 | Cimento CP-II | Civil | 5 | sc | 15 | 32,00 | Crítico |
| 6 | Areia Média | Civil | 2000 | kg | 500 | 0,18 | OK |
| 7 | Chave de Fenda Phillips | Ferramentas | 4 | un | 10 | 18,90 | Baixo |
| 8 | Alicate Universal | Ferramentas | 15 | un | 10 | 42,00 | OK |
| 9 | Capacete de Segurança | EPI | 3 | un | 10 | 28,00 | Crítico |
| 10 | Luva de Proteção | EPI | 25 | par | 20 | 9,90 | OK |

Valor Total do Estoque calculado com esses dados: R$ 2.568,80 (determinístico).

Categorias disponíveis (inicializam o dropdown): Elétrico, Hidráulico, Civil, Ferramentas, EPI.

---

## 11. Fora do Escopo

- Recuperação real de senha (apenas alerta informativo com instrução de contato)
- Backend / API real
- Autenticação segura (senhas em texto plano no localStorage — apenas simulação)
- Registro independente de movimentação (movimentações são derivadas de edições de quantidade)
- Paginação da tabela de materiais
- Exportação de dados (PDF/Excel)
