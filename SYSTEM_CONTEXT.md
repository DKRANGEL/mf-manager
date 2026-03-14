# SYSTEM_CONTEXT — MF Manager (tiny-recibo-pro)

> Documento de engenharia reversa gerado em 2026-03-13.
> Atualizado em 2026-03-14 — reflete o estado atual após sprint de infraestrutura e segurança.
> Destinado a ser injetado como contexto de sistema em sessões de LLM para auxiliar no desenvolvimento de integrações (
> Bots/Assistentes Instagram e automações externas).

---

## 1. Visão Geral da Arquitetura & Stack

### Identidade do Projeto

- **Nome interno (npm):** `tiny-recibo-pro`
- **Propósito real:** Sistema interno da empresa **Magic Effects Brasil Importações Ltda** (fireworks/pirotecnia,
  Brasília-DF) para geração de documentos operacionais (Pedidos de Venda, Ordens de Equipamento, Inventários) integrado
  ao ERP **Tiny/Olist**.
- **Entry point:** `src/server.js`
- **Porta padrão:** `3003` (local) / `8080` (container Docker/Fly.io)

### Stack Principal

| Camada                      | Tecnologia                                                  |
|-----------------------------|-------------------------------------------------------------|
| Runtime                     | Node.js 24.13.1                                             |
| Framework HTTP              | Express 4.x                                                 |
| HTTP Client (para Tiny API) | `node-fetch` 2.x                                            |
| Config de env vars          | `dotenv`                                                    |
| Frontend                    | HTML/CSS/JS vanilla (sem framework SPA)                     |
| PDF                         | `window.print()` — CSS `@media print` via browser nativo    |
| Persistência                | Sistema de arquivos local (JSON flat-files) + Fly.io Volume |
| Containerização             | Docker (multi-stage build)                                  |
| Deploy                      | Fly.io (região `gru` — São Paulo)                           |
| CI/CD                       | GitHub Actions                                              |

**Não há banco de dados relacional.** Toda persistência é feita em arquivos `.json` dentro de `src/data/`, montado em
volume persistente no Fly.io.

### Variáveis de Ambiente

```
TINY_API_TOKEN=<token_da_api_tiny>
BOT_API_KEY=<chave_de_autenticacao_para_rotas_bot>
PORT=8080
NODE_ENV=production
```

- `TINY_API_TOKEN` é lido em cada instanciação do `TinyClient`. Nunca exposto ao frontend.
- `BOT_API_KEY` é usado pelo middleware `requireApiKey` para autenticar chamadas externas às rotas `/bot/*`.
- `PORT` e `NODE_ENV` são definidos explicitamente no `fly.toml` sob `[env]`.

---

## 2. Estrutura de Diretórios

```
/
├── src/
│   ├── server.js                  ← Entry point: boot (initData, aquecerCache, listen)
│   ├── app.js                     ← App factory: Express configurado com middleware e rotas
│   ├── routes/
│   │   ├── api.js                 ← Proxy para Tiny ERP + match de imagens + estoque SSE
│   │   ├── equipamentos.js        ← CRUD local de equipamentos e Ordens de Serviço
│   │   └── bot.js                 ← Rotas protegidas para integrações externas (FastZap)
│   ├── middleware/
│   │   └── auth.js                ← Middleware requireApiKey (header x-api-key)
│   ├── utils/
│   │   ├── tinyClient.js          ← Classe wrapper para API REST do Tiny (api2)
│   │   ├── initData.js            ← Seed idempotente dos flat-files no volume
│   │   └── catalogoCache.js       ← Cache persistente do catálogo Tiny (disco + memória)
│   ├── data/                      ← Montado no Fly.io Volume mf_data
│   │   ├── equipamentos.json      ← DB flat-file: catálogo de equipamentos físicos
│   │   ├── config-equipamentos.json ← Listas de autocompletar (responsáveis, locais, eventos)
│   │   ├── catalogo-cache.json    ← Cache persistente do catálogo Tiny (gerado em runtime)
│   │   └── ordens/
│   │       └── OS-YYYY-NNN.json   ← Uma OS por arquivo JSON
│   └── public/
│       ├── index.html             ← SPA principal (pedidos + OS + inventários)
│       ├── equipamentos.html      ← Página de gerenciamento do catálogo de equipamentos
│       ├── MagicFireworksLogo.jpeg
│       ├── placeholder-produto.svg
│       ├── css/
│       │   ├── app.css            ← Estilos da sidebar/UI
│       │   └── documento.css      ← Estilos do documento imprimível (@media print)
│       ├── js/
│       │   ├── app.js             ← Controles da UI, modais, SSE, lógica de OS
│       │   └── documento.js       ← Renderização de templates HTML em DOM
│       ├── produtos/              ← Imagens de produtos (SKU como nome de arquivo)
│       └── templates/
│           ├── pedido.html        ← Template HTML do Pedido de Venda
│           ├── ordem-equipamento.html ← Template HTML da Ordem de Equipamento
│           ├── inventario.html    ← Template HTML do Inventário de Equipamentos
│           └── inventario-produtos.html ← Template HTML do Inventário de Produtos Tiny
├── config.json                    ← Dados da empresa + customização visual do documento
├── Dockerfile
├── fly.toml
├── .env.example                   ← Documenta variáveis necessárias (sem valores reais)
├── .github/workflows/fly-deploy.yml
└── package.json
```

---

## 3. Mapeamento Completo de Rotas (API Surface)

### 3.1 Rotas do Servidor Principal (`src/app.js`)

```
GET  /config
```

- Retorna `config.json` (dados da empresa, cores, mensagem de rodapé). **Sem token.**
- Response: `{ empresa: {...}, recibo: {...} }`

```
POST /upload/produto?sku=<SKU>&ext=<.png>
```

- Content-Type: `image/*` (raw binary, limit 5MB)
- Salva imagem em `src/public/produtos/<SKU><ext>`
- Após salvar, faz POST interno para `/api/invalidate-image-cache`
- Response: `{ success: true, path: "/public/produtos/<SKU>.png" }`

```
GET  /upload/produtos
```

- Lista todos os arquivos na pasta `src/public/produtos/`
- Response: `{ success: true, files: ["MFCS001-1.png", ...] }`

```
GET  /
```

- Serve `src/public/index.html` (SPA principal)

```
GET  /equipamentos
```

- Serve `src/public/equipamentos.html` (gerenciador do catálogo físico)

```
/public/*              → static files
/api/equipamentos/*    → equipamentosRoutes (src/routes/equipamentos.js)
/api/*                 → apiRoutes (src/routes/api.js)
/bot/*                 → botRoutes (src/routes/bot.js) ← protegido por API key
```

---

### 3.2 Rotas da API Tiny (`src/routes/api.js`) — montadas em `/api`

#### Conexão / Diagnóstico

```
GET /api/testar
```

- Testa conectividade com o Tiny (chama `pedidos.pesquisa.php` com datas fixas de 2026)
- Response: `{ success: bool, status: "OK"|"Erro", data: <retorno_raw> }`

#### Pedidos de Venda

```
GET /api/pedido/numero/:numero
```

- **Rota principal usada pelo frontend.** Busca pelo número visível na UI do Tiny.
- Internamente: faz `pedidos.pesquisa.php?numero=<numero>` → extrai `id` interno → chama `pedido.obter.php?id=<id>`
- Response: `{ success: true, data: <objeto_pedido_completo_tiny> }`

```
GET /api/pedido/:id
```

- Busca pedido de venda pelo ID interno da API Tiny
- Chama: `pedido.obter.php`
- Response: `{ success: true, data: <pedido> }`

```
GET /api/pdv/pedido/:id
```

- Busca pedido do PDV (Ponto de Venda) pelo ID interno
- Chama: `pdv.pedido.obter.php`
- Response: `{ success: true, data: <pedido> }`

```
GET /api/pedidos?<filtros>
```

- Pesquisa pedidos com filtros arbitrários (repassados direto ao Tiny)
- Chama: `pedidos.pesquisa.php`
- Response: `{ success: true, data: [<pedido_resumo>, ...] }`

#### Imagens de Produtos (match por SKU)

```
GET /api/produto/imagem/:sku
```

- Busca a melhor imagem local correspondente ao SKU
- Algoritmo: normaliza SKU (remove separadores, lowercase), separa prefixo alfanumérico do sufixo numérico, compara
  contra nomes de arquivo em `src/public/produtos/`
- Cache em memória de 30 segundos (`IMAGE_CACHE_TTL = 30000`)
- Response (encontrou): `{ success: true, source: "local", matchedFile: "MFCS001-1.png", url: "/public/produtos/..." }`
- Response (não encontrou): `{ success: true, source: "none", url: null }`

```
POST /api/invalidate-image-cache
```

- Limpa o cache de match de imagens em memória
- Response: `{ success: true }`

#### Estoque de Produtos Tiny (SSE + Cache)

```
GET /api/produtos/estoque/progresso
```

- **Server-Sent Events (SSE)** — conectar antes de chamar `/produtos/estoque`
- Emite eventos em tempo real enquanto a busca de estoque ocorre
- Evento formato:
  `data: {"tipo":"ok"|"error"|"ratelimit"|"info"|"done"|"cached", "current":N, "total":N, "sku":"...", "saldo":N, "msg":"..."}\n\n`
- Keepalive a cada 15s com `: ping\n\n`

```
GET /api/produtos/estoque?q=<termo>&refresh=1
```

- Retorna inventário completo do Tiny com saldo real de estoque, agrupado por categoria
- Cache em memória de 5 minutos (`ESTOQUE_CACHE_TTL = 300000`)
- `?refresh=1` força nova busca ignorando cache
- Internamente: paginação via `produtos.pesquisa.php` (100/página) + `produto.obter.estoque.php` sequencial com delay de
  400ms/item e retry em rate limit (20s de espera, 3 tentativas)
- Response:

```json
{
  "success": true,
  "data": {
    "Single Shot 0.8\"": [
      {
        "id": "...",
        "sku": "MFSSS001",
        "nome": "Red Mine",
        "quantidade": 50,
        "unidade": "UN",
        "preco": 12.50,
        "categoria": "Single Shot 0.8\""
      }
    ]
  },
  "total": 180,
  "totalUnidades": 4500
}
```

---

### 3.3 Rotas de Equipamentos (`src/routes/equipamentos.js`) — montadas em `/api/equipamentos`

#### Configuração (Autocomplete)

```
GET  /api/equipamentos/config
```

- Retorna listas para popular datalists HTML (responsáveis, locais, eventos)
- Lê de `src/data/config-equipamentos.json`
- Response:
  `{ success: true, data: { responsaveis_entrega: [...], responsaveis_equipamento: [...], locais_frequentes: [...], eventos_recentes: [...] } }`

```
POST /api/equipamentos/config
```

- Body JSON:
  `{ responsaveis_entrega?: [...], responsaveis_equipamento?: [...], locais_frequentes?: [...], eventos_recentes?: [...] }`
- Substitui as listas correspondentes no arquivo
- Response: `{ success: true }`

#### CRUD de Ordens de Serviço (OS)

```
POST /api/equipamentos/ordens
```

- Cria nova OS. Gera número automático no formato `OS-YYYY-NNN` (sequencial persistido em `config-equipamentos.json`)
- Body JSON:

```json
{
  "evento": "Show Henrique e Juliano",
  "local": "Arena BRB Mané Garrincha",
  "data_saida": "2026-03-15",
  "data_retorno": "2026-03-16",
  "responsavel_entrega": "Dérick",
  "responsavel_equipamento": "Bertholdo",
  "itens": [
    {
      "sku": "MAQ-001",
      "descricao": "Jet Set CO2",
      "qtd_saida": 6,
      "qtd_retorno": 0
    }
  ],
  "observacoes": ""
}
```

- Salva em `src/data/ordens/OS-YYYY-NNN.json`
- Atualiza listas de autocomplete com novos valores (max 50 itens/lista, FIFO)
- Response: `{ success: true, data: <ordem_completa_com_numero_gerado> }`

```
GET  /api/equipamentos/ordens
```

- Lista todas as OS (resumo: numero, evento, local, data_saida, status, data_criacao)
- Ordenadas por `data_criacao` decrescente
- Response: `{ success: true, data: [<resumo_os>, ...] }`

```
GET  /api/equipamentos/ordens/:numero
```

- Retorna OS completa pelo número (ex: `OS-2026-001`)
- Response: `{ success: true, data: <os_completa> }` ou 404

```
PUT  /api/equipamentos/ordens/:numero
```

- Atualiza OS (merge com dados existentes). Campos `numero` e `data_criacao` são imutáveis.
- Atualiza `data_atualizacao` automaticamente
- Usado principalmente para registrar retorno de equipamentos (`qtd_retorno` dos itens)
- Response: `{ success: true, data: <os_atualizada> }`

#### CRUD do Catálogo de Equipamentos Físicos

```
GET  /api/equipamentos/produtos?q=<termo>&categoria=<cat>
```

- Busca equipamentos locais por nome, SKU ou categoria
- Response: `{ success: true, data: [<equipamento>, ...] }`

```
GET  /api/equipamentos/categorias
```

- Lista categorias distintas do catálogo
- Response: `{ success: true, data: ["Cabos DMX", "Chicotes", ...] }`

```
GET  /api/equipamentos/catalogo
```

- Catálogo completo agrupado por categoria, ordenado por SKU dentro de cada categoria
- Response: `{ success: true, data: { "Cabos DMX": [...], ... }, total: 82 }`

```
POST /api/equipamentos/item
```

- Adiciona novo equipamento ao catálogo
- Body: `{ sku, nome, categoria, quantidade, em_manutencao, observacoes }`
- SKU único obrigatório (retorna 400 se duplicado)
- Response: `{ success: true, data: <equipamento_com_id_gerado> }`

```
PUT  /api/equipamentos/item/:id
```

- Atualiza equipamento por ID numérico interno
- Body: qualquer subconjunto dos campos (`nome`, `sku`, `categoria`, `quantidade`, `em_manutencao`, `observacoes`)
- Response: `{ success: true, data: <equipamento_atualizado> }`

```
DELETE /api/equipamentos/item/:id
```

- Remove equipamento do catálogo
- Response: `{ success: true, data: <equipamento_removido> }`

---

### 3.4 Rotas do Bot (`src/routes/bot.js`) — montadas em `/bot`

**Todas as rotas exigem autenticação via header `x-api-key`.**
Sem o header ou com valor incorreto: `401 { success: false, error: "Não autorizado" }`.

```
GET /bot/catalogo
```

- Retorna catálogo completo de produtos Tiny formatado para consumo da IA
- Autenticação: header `x-api-key: <BOT_API_KEY>`
- Cache persistente em disco com TTL de 60 minutos — resposta em <1s
- Em caso de cache expirado: retorna dados antigos imediatamente e renova em background
- Response:

```json
{
  "success": true,
  "total": 271,
  "produtos": [
    {
      "codigo": "MFSSS001",
      "nome": "Red Mine",
      "categoria": "Single Shot 0.8\"",
      "disponivel": true,
      "quantidade": 50,
      "unidade": "UN"
    }
  ]
}
```

---

## 4. Segurança e Autenticação

### 4.1 Middleware `requireApiKey` (`src/middleware/auth.js`)

Protege rotas externas via header HTTP:

```javascript
// Header obrigatório em todas as rotas /bot/*
x - api - key
:
<valor_do_BOT_API_KEY>
```

- Se `BOT_API_KEY` não estiver configurada: retorna `503`
- Se header ausente ou incorreto: retorna `401`
- Rotas internas (`/api/*`, `/public/*`) não são afetadas

### 4.2 Separação de superfícies

| Superfície  | Autenticação            | Quem usa                       |
|-------------|-------------------------|--------------------------------|
| `/api/*`    | Nenhuma (interno)       | Frontend da aplicação          |
| `/bot/*`    | `x-api-key` obrigatório | FastZap / integrações externas |
| `/public/*` | Nenhuma                 | Browser (assets estáticos)     |

---

## 5. Cache do Catálogo (`src/utils/catalogoCache.js`)

### 5.1 Arquitetura de três camadas

```
1. Memória    → retorno instantâneo enquanto TTL válido (60min)
2. Disco      → carregado no startup via src/data/catalogo-cache.json
3. Background → cache expirado retorna dados antigos + renova sem bloquear
```

### 5.2 Comportamento no startup

```
Servidor sobe
  → carregarCacheDoDisco()
    → arquivo existe e válido  → cache pronto em <1s, sem chamada ao Tiny
    → arquivo existe expirado  → carrega dados antigos + renova em background (5s delay)
    → arquivo não existe       → agenda busca no Tiny em background (5s delay)
  → setInterval(60min)        → renovação automática
```

### 5.3 Comportamento na requisição

```
GET /bot/catalogo
  → cache em memória válido   → retorna imediatamente
  → cache em memória expirado → retorna dados antigos + dispara buscarDoTiny() em background
  → sem cache em memória      → busca síncrona no Tiny (só na primeira vez absoluta)
```

**Implicação:** a primeira inicialização do sistema (volume vazio, sem `catalogo-cache.json`) pode levar 15-20 minutos
para popular o cache — devido ao rate limit sequencial do Tiny. Após isso, todos os restarts subsequentes carregam do
disco em menos de 1 segundo.

---

## 6. Integração com Tiny ERP

### 6.1 Arquitetura do TinyClient (`src/utils/tinyClient.js`)

**Base URL:** `https://api.tiny.com.br/api2`

Todas as requisições são feitas via **HTTP POST** com `Content-Type: application/x-www-form-urlencoded`, incluindo
sempre `token` e `formato=JSON` no body.

```javascript
const body = new URLSearchParams({
    token: this.token,
    formato: 'JSON',
    ...params
});
fetch(`${TINY_BASE_URL}/${endpoint}`, {method: 'POST', body: body.toString()});
```

### 6.2 Endpoints do Tiny consumidos

| Endpoint Tiny               | Método interno                                                    | Uso                                 |
|-----------------------------|-------------------------------------------------------------------|-------------------------------------|
| `pedidos.pesquisa.php`      | `pesquisarPedidos()`, `obterPedidoPorNumero()`, `testarConexao()` | Busca/listagem de pedidos           |
| `pedido.obter.php`          | `obterPedido(id)`                                                 | Detalhe completo do pedido de venda |
| `pdv.pedido.obter.php`      | `obterPedidoPDV(id)`                                              | Detalhe de pedido PDV               |
| `produtos.pesquisa.php`     | `pesquisarTodosProdutos()`, `pesquisarProdutosComEstoque()`       | Listagem paginada de produtos       |
| `produto.obter.php`         | `obterProduto(id)`                                                | Detalhe de produto                  |
| `produto.obter.estoque.php` | `pesquisarProdutosComEstoque()`                                   | Saldo real de estoque por produto   |

### 6.3 Fluxo de busca por número de pedido

```
Frontend → GET /api/pedido/numero/12345
  → TinyClient.obterPedidoPorNumero("12345")
    → POST api2/pedidos.pesquisa.php {numero: "12345"}
    → extrai pedidos[0].pedido.id
    → POST api2/pedido.obter.php {id: <id_interno>}
    → retorna pedido completo
  → { success: true, data: <pedido> }
```

### 6.4 Fluxo de estoque com rate limit handling

```
1. Busca lista de produtos via paginação (100/página)
2. Para CADA produto:
   a. Aguarda 400ms entre chamadas (DELAY_MS)
   b. Chama produto.obter.estoque.php
   c. Em caso de rate limit ("Bloqueada"/"Excedido"):
      - Aguarda 20s (RETRY_DELAY_MS)
      - Tenta até 3x (MAX_RETRIES)
   d. Emite evento SSE com progresso
3. Retorna array com { ...produto, saldo_real: N }
```

### 6.5 Schema do objeto Pedido retornado pelo Tiny

```json
{
  "id": "123456789",
  "numero": "12345",
  "data_pedido": "01/03/2026",
  "nome_vendedor": "Vendedor Nome",
  "desconto": "0.00",
  "totalPedido": "1500.00",
  "forma_pagamento": "Pix",
  "obs": "Observações do pedido",
  "cliente": {
    "nome": "Nome Cliente",
    "nome_fantasia": "Fantasy",
    "cpf_cnpj": "123.456.789-00",
    "endereco": "Rua X",
    "numero": "100",
    "bairro": "Bairro Y",
    "cidade": "Brasília",
    "uf": "DF",
    "fone": "(61) 99999-9999",
    "celular": "",
    "email": "cliente@email.com"
  },
  "itens": [
    {
      "item": {
        "codigo": "MFSSS001",
        "descricao": "Red Mine",
        "quantidade": "10",
        "unidade": "UN",
        "valor_unitario": "12.50"
      }
    }
  ],
  "parcelas": [
    {
      "parcela": {
        "dias": "30",
        "data_vencimento": "01/04/2026",
        "forma_pagamento": "Pix",
        "valor": "1500.00",
        "obs": ""
      }
    }
  ]
}
```

---

## 7. Geração de PDF / Documentos

### 7.1 Mecanismo

**Não há biblioteca de geração de PDF no backend.** O sistema usa abordagem 100% baseada em browser:

1. Frontend busca dados via API (Tiny ou local)
2. `documento.js` renderiza template HTML no DOM (dentro de `#recibo`)
3. Usuário clica "Exportar PDF" → `window.print()`
4. CSS `documento.css` com `@media print` formata para impressão/PDF

### 7.2 Templates disponíveis

| Template                    | Arquivo                                     | Dados de entrada         |
|-----------------------------|---------------------------------------------|--------------------------|
| Pedido de Venda             | `public/templates/pedido.html`              | Objeto pedido do Tiny    |
| Ordem de Equipamento        | `public/templates/ordem-equipamento.html`   | Objeto OS local          |
| Inventário de Equipamentos  | `public/templates/inventario.html`          | Catálogo local agrupado  |
| Inventário de Produtos Tiny | `public/templates/inventario-produtos.html` | Dados de estoque do Tiny |

### 7.3 Match de Imagem por SKU

- Normaliza SKU: remove `-_.:\s`, lowercase
- Separa prefixo alfanumérico do sufixo numérico (ex: `mfsss` + `001`)
- Itera sobre arquivos em `src/public/produtos/`
- Prioriza arquivos com nome mais curto em caso de múltiplos matches
- Cache de 30s em memória (invalidado via POST `/api/invalidate-image-cache`)

### 7.4 Categorização de SKUs de Produtos Tiny

```javascript
const SKU_CATEGORIAS = [
    ['MFCSM', 'Smoke Mine'],
    ['MFSCW', 'Smoke Cake Waterfall'],
    ['MFSCM', 'Smoke Mine'],
    ['MFSSS', 'Single Shot 0.8"'],
    ['MFSS1', 'Single Shot 1.2"'],
    ['MFS3I', 'Display Shell 3"'],
    ['MFS4I', 'Display Shell 4"'],
    ['MFS5I', 'Display Shell 5"'],
    ['MFS6I', 'Display Shell 6"'],
    ['MFCX', 'Cake X'],
    ['MFCW', 'Cake W'],
    ['MFCS', 'Cake S'],
];
// SKUs terminando em _U = unidade (ex: MFSSS001_U)
```

---

## 8. Persistência Local (Flat-file JSON)

### 8.1 `src/data/equipamentos.json`

```json
{
  "proximo_id": 83,
  "equipamentos": [
    {
      "id": 1,
      "sku": "CHI-001",
      "nome": "Chicote 1 Metro / 3 Vias",
      "categoria": "Chicotes",
      "quantidade": 3,
      "em_manutencao": 0,
      "observacoes": "",
      "data_cadastro": "2026-02-21"
    }
  ]
}
```

Categorias reais: Chicotes, Cabos DMX, Cabos MD12, Cabos MD30, Cabos Fire One, Mesas e Controladores, Réguas, Máquinas,
Equipamentos de Efeito, Racks 0.8", Racks 1.2", Extensões, Mangueiras, Consumíveis.

### 8.2 `src/data/config-equipamentos.json`

```json
{
  "responsaveis_entrega": [
    "Bertholdo",
    "Dérick"
  ],
  "responsaveis_equipamento": [
    "Bertholdo"
  ],
  "locais_frequentes": [
    "Arena BRB Mané Garrincha",
    "Open Hall"
  ],
  "eventos_recentes": [
    "Show Henrique e Juliano",
    "Baile de Formatura B2"
  ],
  "proximo_numero": 10
}
```

Cada lista aceita até 50 itens (FIFO). `proximo_numero` é o contador sequencial de OS.

### 8.3 `src/data/ordens/OS-YYYY-NNN.json`

```json
{
  "numero": "OS-2026-001",
  "evento": "Baile de Formatura B2",
  "local": "Open Hall",
  "data_saida": "2026-02-21",
  "data_retorno": "2026-02-22",
  "responsavel_entrega": "Bertholdo José da Silva Neto",
  "responsavel_equipamento": "Bertholdo José da Silva Neto",
  "status": "aberta",
  "itens": [
    {
      "sku": "MAQ-001",
      "descricao": "Jet Set CO2",
      "qtd_saida": 6,
      "qtd_retorno": 0
    }
  ],
  "observacoes": "",
  "data_criacao": "2026-02-21T14:26:58.892Z",
  "data_atualizacao": "2026-02-21T14:26:58.892Z"
}
```

**Atenção:** `status` nunca é atualizado automaticamente — permanece `"aberta"` mesmo após retorno de equipamentos.

### 8.4 `src/data/catalogo-cache.json` (gerado em runtime)

```json
{
  "atualizadoEm": 1741900682000,
  "produtos": [
    {
      "codigo": "MFSSS001",
      "nome": "Red Mine",
      "categoria": "Single Shot 0.8\"",
      "disponivel": true,
      "quantidade": 50,
      "unidade": "UN"
    }
  ]
}
```

Gerado automaticamente pelo `catalogoCache.js`. Persiste no volume Fly.io. **Não versionado no Git.**

### 8.5 `config.json` (raiz do projeto)

```json
{
  "empresa": {
    "nome": "MAGIC EFFECTS BRASIL IMPORTACOES LTDA",
    "cnpj": "22.748.770/0001-50",
    "endereco": "NUCLEO RURAL ALEXANDRE GUSMAO GLEBA 2 LOTE, 143 - BRAZLANDIA, Brasília, DF",
    "telefone": "(22) 99982-5488",
    "email": "magiceffectsbrasil@gmail.com",
    "logo": "/public/FireworksMagicLogo.jpg"
  },
  "recibo": {
    "corPrimaria": "#1a1a2e",
    "corAcento": "#e94560",
    "mostrarEndereco": true,
    "mostrarTelefone": true,
    "mostrarEmail": false,
    "mensagemRodape": "Obrigado pela preferência!"
  }
}
```

---

## 9. Infraestrutura e CI/CD

### 9.1 Dockerfile (multi-stage)

```dockerfile
ARG NODE_VERSION=24.13.1
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
ENV NODE_ENV="production"

FROM base AS build
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
    build-essential node-gyp pkg-config python-is-python3
COPY package-lock.json package.json ./
RUN npm ci
COPY . .

FROM base
COPY --from=build /app /app
EXPOSE 8080
CMD ["npm", "run", "start"]
```

### 9.2 fly.toml

```toml
app = 'tiny-recibo-pro'
primary_region = 'gru'

[env]
PORT = "8080"
NODE_ENV = "production"

[http_service]
internal_port = 8080
force_https = true
auto_stop_machines = 'stop'
auto_start_machines = true
min_machines_running = 1

[[vm]]
memory = '256mb'
cpu_kind = 'shared'
cpus = 1

[mounts]
source = "mf_data"
destination = "/app/src/data"
```

**Volume `mf_data`:** criado via `fly volumes create mf_data --region gru --size 1`. Persiste `src/data/` entre deploys
e restarts.

**Cold start eliminado:** `min_machines_running = 1` mantém sempre uma máquina ativa.

### 9.3 GitHub Actions — CI/CD Pipeline

```yaml
name: Deploy MF Manager
on:
  push:
    branches:
      - magic-fireworks-template

jobs:
  deploy:
    runs-on: ubuntu-latest
    concurrency: deploy-group
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Branch de produção:** `magic-fireworks-template` (não `main` nem `master`).

---

## 10. Fluxos Operacionais Completos

### 10.1 Gerar Pedido de Venda

```
1. Usuário digita número do pedido no input #pedidoId
2. app.js → gerarRecibo() → fetch /api/pedido/numero/<N>
3. api.js → TinyClient.obterPedidoPorNumero(N)
   a. POST Tiny: pedidos.pesquisa.php {numero: N} → pega id interno
   b. POST Tiny: pedido.obter.php {id: <interno>} → pedido completo
4. Response JSON para o frontend
5. documento.js → renderDocumento(pedido, config)
   a. fetch /public/templates/pedido.html (cacheado)
   b. inject no DOM #recibo
   c. para cada item: fetch /api/produto/imagem/<sku>
   d. monta linhas da tabela com imagens, quantidades, valores
6. Usuário clica "Exportar PDF" → window.print()
```

### 10.2 Criar Ordem de Serviço de Equipamento

```
1. Usuário abre modal "Nova OS" → preenche evento, local, datas, responsáveis
2. Adiciona equipamentos via busca: fetch /api/equipamentos/produtos?q=<termo>
3. Define qtd_saida para cada item
4. Clica "Gerar OS" → fetch POST /api/equipamentos/ordens
5. Gera número OS-YYYY-NNN, salva JSON em data/ordens/
6. Atualiza config-equipamentos.json com novos valores
7. documento.js → renderOrdemEquipamento(ordem, config)
8. window.print() para exportar PDF
```

### 10.3 Inventário de Produtos Tiny (SSE)

```
1. Usuário clica "Gerar Inventário de Produtos"
2. app.js → iniciarSSE() abre EventSource /api/produtos/estoque/progresso
3. fetch GET /api/produtos/estoque
4. Backend: paginação em produtos.pesquisa.php (100/pág)
5. Para cada produto: produto.obter.estoque.php + delay 400ms + retry em rate limit
6. Cada produto processado → emitSSE() → frontend atualiza progress bar
7. Ao concluir: emite {tipo: "done"} → SSE fecha
8. renderInventarioProdutos() → monta tabelas por categoria
```

### 10.4 Consulta de catálogo pelo bot (FastZap)

```
1. FastZap chama GET /bot/catalogo com header x-api-key
2. requireApiKey valida o header
3. getCatalogoBot() verifica cache em memória
   → válido: retorna imediatamente
   → expirado: retorna dados antigos + renova em background
   → sem cache: busca no Tiny (apenas primeira inicialização)
4. Retorna JSON com 271 produtos (codigo, nome, categoria, disponivel, quantidade)
```

---

## 11. Pontos de Extensão para Bots/Integrações Externas

### 11.1 Rotas protegidas disponíveis para o FastZap

| Rota                | Auth        | Descrição                                        |
|---------------------|-------------|--------------------------------------------------|
| `GET /bot/catalogo` | `x-api-key` | Catálogo completo com disponibilidade em estoque |

### 11.2 Rotas internas (sem autenticação própria)

Usadas apenas pelo frontend interno — não devem ser expostas ao bot:

- `GET /api/pedido/numero/:numero`
- `GET /api/equipamentos/ordens`
- `GET /api/equipamentos/catalogo`
- `GET /api/produtos/estoque`

### 11.3 Limitações arquiteturais atuais

- **Sem webhooks:** sistema não emite eventos — integrações externas precisam fazer polling
- **Cache do catálogo:** primeira inicialização leva 15-20min (rate limit Tiny). Restarts subsequentes carregam do disco
  em <1s
- **Estado em memória:** caches de imagens e SSE são perdidos a cada restart (não crítico)
- **Sem CORS configurado:** requisições cross-origin podem falhar dependendo do contexto do bot
- **Sem rate limiting próprio:** `/api/*` não tem proteção contra abuso

---

## 12. Resumo da Topologia de Dados

```
[FastZap / External Bot]
         ↓ HTTPS + x-api-key header
[Fly.io — tiny-recibo-pro.fly.dev]
  [Express Server :8080]
    ├── /config → config.json (empresa, cores)
    ├── /bot/* → routes/bot.js [AUTENTICADO]
    │    └── catalogoCache → src/data/catalogo-cache.json (Volume)
    │                      → TinyClient (quando cache expirado)
    ├── /api/* → routes/api.js
    │    ├── TinyClient → https://api.tiny.com.br/api2
    │    └── filesystem: src/public/produtos/ (imagens por SKU)
    ├── /api/equipamentos/* → routes/equipamentos.js
    │    └── Volume mf_data → src/data/
    │         ├── equipamentos.json
    │         ├── config-equipamentos.json
    │         ├── catalogo-cache.json
    │         └── ordens/OS-*.json
    └── /public/* → static files (HTML, CSS, JS, imagens)

[GitHub repo: branch magic-fireworks-template]
  → push → GitHub Actions → flyctl deploy → Fly.io GRU
  
[Fly.io Volume: mf_data]
  → montado em /app/src/data
  → persiste entre deploys e restarts
```