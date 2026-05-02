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
| Gerenciar Categorias | ✅ | ❌ |

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

**Regras de validação dos campos:**
- `nome`: obrigatório, não vazio.
- `categoria`: obrigatório, seleção do dropdown.
- `quantidade`: obrigatório, número decimal ≥ 0 (zero é válido — material em falta). Valores negativos rejeitados.
- `unidade`: obrigatório, texto livre (ex: m, kg, un, L, pç). Sem lista fixa.
- `estoqueMinimo`: obrigatório, número decimal ≥ 0. Zero é válido (status sempre OK quando mínimo = 0).
- `valorUnitario`: opcional — se vazio, armazenar como `0`. Número decimal ≥ 0. Valores negativos rejeitados. Aceita entrada com vírgula ou ponto decimal (normalizar para número JS antes de salvar). Não exibido como coluna na tabela; visível apenas no modal.

**Formato de exibição de valores monetários:** `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })` → `R$ 1.234,56`.

**Regra de status (calculada em runtime, sem campo armazenado):**

```
qtd >= estoqueMinimo                              → OK
qtd >= (estoqueMinimo * 0.5) AND qtd < estoqueMinimo → Baixo
qtd < (estoqueMinimo * 0.5)                       → Crítico
```

### 6.4 Categorias (`crm_categorias`)
```json
["Elétrico", "Hidráulico", "Civil", "Ferramentas", "EPI"]
```
Lista simples de strings. Pré-carregada com 5 categorias padrão na primeira carga, mas o admin pode adicionar, renomear e excluir livremente.

**Renomear:** ao renomear uma categoria, todos os materiais que usam o nome antigo são atualizados automaticamente para o novo nome (cascade via localStorage). A operação é imediata ao confirmar o campo de texto.

**Excluir:** ao excluir uma categoria em uso, exibir confirmação: "X material(is) usa(m) esta categoria. Deseja excluir mesmo assim?" — se confirmado, a categoria é removida da lista e os materiais que a usavam ficam com o nome antigo como texto livre (não vinculado à lista).

**Mínimo de categorias:** não é permitido excluir a última categoria restante. Botão Excluir fica desabilitado quando há apenas 1 categoria, com tooltip "É necessário manter ao menos uma categoria."

### 6.5 Movimentações (`crm_movimentacoes`)
```json
[
  {
    "id": "crypto.randomUUID()",
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

**Sem dados mockados:** a lista de movimentações começa vazia. O histórico e o gráfico exibirão os estados vazios definidos na seção 7.3 até que o admin cadastre materiais e realize edições de quantidade.

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
- Campos: Nome completo, Usuário, Senha, Confirmar senha
- **Regras do campo Usuário:** mínimo 3 caracteres, máximo 30, aceita apenas letras (com ou sem acento), números, underscore `_` e hífen `-`. Espaços não permitidos. Comparação de duplicatas é case-insensitive (`admin` = `Admin`).
- Validações e mensagens de erro inline:
  - Campo vazio → "Este campo é obrigatório."
  - Usuário com caracteres inválidos → "Use apenas letras, números, _ ou -."
  - Usuário com menos de 3 caracteres → "Mínimo de 3 caracteres."
  - Usuário já existente (case-insensitive) → "Este nome de usuário já está em uso."
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
| Entradas do Mês | Soma das `quantidade` das movimentações do tipo `entrada` no mês corrente (mês calendário: do dia 1 ao último dia do mês atual) |

> O card "Entradas do Mês" exibe a **soma numérica** das quantidades que entraram no mês calendário corrente (ex: 320), sem rótulo de unidade — os materiais têm unidades diferentes (m, kg, un), portanto a soma é exibida como número puro. Não há card equivalente para saídas; o balanço detalhado está na seção de Movimentações.

Layout: 4 colunas no desktop, 2×2 no tablet, 1 coluna no mobile.

#### Tabela de Materiais
Colunas: ID, Nome, Categoria, Quantidade, Unidade, Estoque Mínimo, Status, Ações  
Filtros acima da tabela: busca por nome (text input) + dropdown Categoria + dropdown Status  
Botões acima da tabela (visíveis apenas para admin): **"Adicionar Material"** e **"Gerenciar Categorias"**  
Botões **Editar** / **Excluir** na coluna Ações — visíveis apenas para admin  
**Excluir material:** exibir confirmação "Deseja excluir o material '[Nome]'? Esta ação não pode ser desfeita." — se confirmado, remove o material e suas movimentações associadas do localStorage.  
**Estado vazio:** quando nenhum material corresponde aos filtros, exibir linha única com texto "Nenhum material encontrado."

#### Modal Adicionar/Editar Material (admin)
Campos: Nome, Categoria (dropdown), Quantidade, Unidade, Estoque Mínimo, Valor Unitário

**Validação ao salvar:** todos os campos exceto Valor Unitário são obrigatórios. Erros exibidos inline abaixo de cada campo. Botão "Salvar" só avança após todos os campos válidos.

| Campo | Obrigatório | Restrição |
|---|---|---|
| Nome | Sim | Não vazio |
| Categoria | Sim | Seleção do dropdown |
| Quantidade | Sim | Decimal ≥ 0 |
| Unidade | Sim | Texto livre, não vazio |
| Estoque Mínimo | Sim | Decimal ≥ 0 |
| Valor Unitário | Não | Decimal ≥ 0; vazio → salva como 0 |

> Se o admin precisar de uma categoria ainda não existente, deve: fechar o modal, clicar em "Gerenciar Categorias", adicionar a categoria e reabrir o modal. Esta limitação é aceita e documentada na seção 11.

Ao salvar uma **edição**: a diferença de quantidade é registrada como movimentação automaticamente. A tabela de materiais re-renderiza após fechar o modal.  
Ao salvar um **novo** material: nenhuma movimentação é gerada (quantidade inicial não é considerada entrada).

#### Modal Gerenciar Categorias (admin)
Acessado pelo botão "Gerenciar Categorias" acima da tabela.  
Exibe a lista atual de categorias em ordem alfabética, cada uma com:
- Campo de texto editável com o nome da categoria (renomeação imediata ao sair do campo / `blur`)
- Botão **Excluir** ao lado (desabilitado se for a última categoria)

**Validações de renomear e adicionar:**
- Nome vazio ou somente espaços → rejeitado silenciosamente; campo restaura valor anterior.
- Nome duplicado (case-insensitive) → exibir erro inline: "Esta categoria já existe." e restaurar valor anterior.
- Renomear aciona cascade automático em todos os materiais que usam o nome antigo. A tabela de materiais re-renderiza quando o modal "Gerenciar Categorias" for fechado.

**Ação de adicionar:** campo de texto vazio + botão **"Adicionar"** ao final da lista. Ao confirmar: nome validado, categoria inserida e lista reordenada alfabeticamente.

**Excluir sem materiais vinculados:** remove diretamente.  
**Excluir com materiais vinculados:** exibir confirmação "X material(is) usa(m) esta categoria. Deseja excluir mesmo assim?" — se confirmado, remove da lista; materiais mantêm o nome antigo como texto livre.  
**Excluir última categoria:** botão desabilitado com tooltip "É necessário manter ao menos uma categoria."

Botão **"Fechar"** encerra o modal. Todas as alterações já foram aplicadas imediatamente; não há desfazer.

#### Seção Movimentações

Filtro de período em botões agrupados: `Hoje` | `7 dias` | `14 dias` | `30 dias`

**Agrupamento do gráfico por período:**

| Filtro | Granularidade | Número de barras |
|---|---|---|
| Hoje | Por hora | 24 barras |
| 7 dias | Por dia | 7 barras |
| 14 dias | Por dia | 14 barras |
| 30 dias | Blocos de 6 dias | 5 barras (janela rolante: hoje − 30 dias, dividida em 5 blocos de 6 dias cada) |

- **Gráfico SVG de barras agrupadas:** Entradas (laranja `#f97316`) vs Saídas (cinza `#6b7280`) no período selecionado, com rótulos de valor acima das barras e legenda abaixo. Barras ordenadas da esquerda (mais antiga) para a direita (mais recente).  
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

## 10. Estado Inicial do Sistema

**Categorias (`crm_categorias`):** pré-carregadas com `["Elétrico", "Hidráulico", "Civil", "Ferramentas", "EPI"]` — editáveis pelo admin via modal "Gerenciar Categorias".  
**Materiais:** lista vazia. O admin cadastrará os itens com base no estoque físico atual.  
**Movimentações:** lista vazia. Registros gerados conforme edições de quantidade pelo admin.  
**Cards de resumo:** exibem zeros na primeira carga (Total de Itens: 0, Itens em Baixo Estoque: 0, Valor Total: R$ 0,00, Entradas do Mês: 0).  
**Gráfico e tabela de histórico:** exibem os estados vazios definidos na seção 7.3.

---

## 11. Fora do Escopo

- Recuperação real de senha (apenas alerta informativo com instrução de contato)
- Backend / API real
- Autenticação segura (senhas em texto plano no localStorage — apenas simulação)
- Registro independente de movimentação (movimentações são derivadas de edições de quantidade)
- Criação de categoria diretamente dentro do modal de material (requer navegar ao modal "Gerenciar Categorias" separado)
- Paginação da tabela de materiais
- Exportação de dados (PDF/Excel)
