# MF Manager — Magic Fireworks

Sistema interno de gestão de pedidos, estoque e equipamentos para a **Magic Effects Brasil Importações Ltda** (empresa de pirotecnia, Brasília-DF).

**Desenvolvedor:** Dérick | **Usuário principal:** Mateus (dono, acessa via mobile)

---

## Stack

- **Runtime:** Node.js 24 + Express
- **Banco de dados:** arquivos JSON em volume persistente no Fly.io (`src/data/`)
- **Frontend:** HTML/CSS/JS vanilla, mobile-first
- **Ícones:** Lucide Icons (CDN, `lucide.createIcons()` após cada render dinâmico)
- **Fontes:** DM Sans + JetBrains Mono (Google Fonts)
- **Deploy:** Fly.io — branch `magic-fireworks-template`

---

## Estrutura de arquivos

```
src/
├── app.js                  # createApp() — registra todas as rotas e páginas
├── server.js               # entry point, dotenv, initData, aquecerCache
├── data/                   # persistência (volume Fly.io)
│   ├── produtos.json       # catálogo de produtos { proximo_id, produtos[] }
│   ├── equipamentos.json
│   ├── config-pedidos.json # { proximo_numero }
│   ├── contagens/          # CONT-YYYY-NNN.json por contagem
│   ├── movimentos/         # PED-YYYY-NNN.json por pedido (log de baixas)
│   ├── pedidos/            # PED-YYYY-NNN.json por pedido
│   └── ordens/             # OS-YYYY-NNN.json por ordem de equipamento
├── public/
│   ├── css/app.css         # design system global (variáveis, sidebar, modais, Lucide)
│   ├── css/documento.css   # estilos do documento impresso
│   ├── js/app.js           # lógica da index (OS, inventário)
│   ├── js/documento.js     # renderização do documento PDF/preview
│   ├── index.html          # home — desktop: gerador OS/recibo | mobile: cards de nav
│   ├── pedidos.html        # hall de pedidos com cards e preview modal
│   ├── emitir.html         # criação/edição de pedido de venda
│   ├── contagem.html       # contagem física de estoque por categoria
│   ├── estoque.html        # saldo em tempo real (baseline contagem + movimentos)
│   ├── produtos.html       # CRUD do catálogo de produtos
│   └── equipamentos.html   # CRUD de equipamentos
├── routes/
│   ├── catalogo.js         # /api/catalogo — CRUD produtos + importar-tiny
│   ├── pedidos.js          # /api/pedidos — CRUD + baixa de estoque
│   ├── contagens.js        # /api/contagens — salvar e listar contagens
│   ├── estoque.js          # /api/estoque — saldo em tempo real
│   ├── equipamentos.js     # /api/equipamentos — CRUD equipamentos + OS
│   ├── api.js              # /api — rotas legadas (Tiny proxy, imagem)
│   └── bot.js              # /bot — catálogo para FastZap (autenticado)
└── utils/
    ├── storage.js          # readJSON, writeJSONAtomic, listJSON
    ├── tinyClient.js       # TinyClient — API v2 do Tiny ERP
    ├── catalogoCache.js    # cache de produtos Tiny em memória (TTL 10 min)
    ├── initData.js         # cria arquivos/diretórios na inicialização
    ├── parserPedido.js     # parser de texto → itens de pedido
    ├── validadorCatalogo.js
    └── multiplicador.js
```

---

## Rotas registradas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/catalogo/catalogo` | Lista produtos agrupados por categoria |
| GET | `/api/catalogo/buscar?q=` | Autocomplete (max 20) |
| POST | `/api/catalogo/item` | Cria produto |
| PUT | `/api/catalogo/item/:id` | Atualiza produto |
| DELETE | `/api/catalogo/item/:id` | Remove produto |
| PUT | `/api/catalogo/item/:id/imagem` | Upload de imagem |
| DELETE | `/api/catalogo/item/:id/imagem` | Remove imagem |
| **POST** | `/api/catalogo/importar-tiny` | **Puxa todos os produtos da API do Tiny e mescla com produtos.json** |
| GET | `/api/pedidos` | Lista pedidos |
| POST | `/api/pedidos` | Salva rascunho |
| PUT | `/api/pedidos/:numero` | Atualiza pedido |
| PUT | `/api/pedidos/:numero/baixa` | Ativa ou reverte baixa de estoque |
| DELETE | `/api/pedidos/:numero` | Exclui rascunho |
| POST | `/api/contagens` | Salva contagem física |
| GET | `/api/contagens/ultima` | Retorna contagem mais recente |
| GET | `/api/contagens` | Lista todas as contagens |
| **GET** | `/api/estoque/atual` | **Saldo em tempo real (baseline + movimentos)** |
| GET | `/api/equipamentos/catalogo` | Lista equipamentos por categoria |
| POST/PUT/DELETE | `/api/equipamentos/item` | CRUD equipamentos |
| GET | `/bot/catalogo` | Catálogo para FastZap (requer BOT_API_KEY) |

---

## Schemas de dados

### produtos.json
```json
{
  "proximo_id": 275,
  "produtos": [{
    "id": 1,
    "codigo": "MFSS-001",
    "nome": "Monotiro Dourado",
    "categoria": "MFSS",
    "preco": 0,
    "unidade": "CX",
    "fator": 12,
    "observacoes": "",
    "imagem": "MFSS-001.jpg",
    "data_cadastro": "2026-07-10"
  }]
}
```

### contagens/CONT-YYYY-NNN.json
```json
{
  "numero": "CONT-2026-001",
  "data": "2026-07-10",
  "responsavel": "Mateus",
  "observacoes": "",
  "data_criacao": "2026-07-10T14:00:00.000Z",
  "itens": [{
    "id": 1,
    "codigo": "MFSS-001",
    "nome": "Monotiro Dourado",
    "categoria": "MFSS",
    "fator": 12,
    "cx": 5,
    "un_avulsas": 3,
    "total_un": 63
  }]
}
```

### movimentos/PED-YYYY-NNN.json
```json
{
  "movimentos": [{
    "codigo": "MFSS-001",
    "descricao": "Monotiro Dourado",
    "qtd_un": 24,
    "tipo": "saida",
    "origem": "pedido",
    "numero_pedido": "PED-2026-001",
    "data": "2026-07-10T15:00:00.000Z"
  }]
}
```

### GET /api/estoque/atual — resposta
```json
{
  "success": true,
  "baseline": {
    "numero": "CONT-2026-001",
    "data": "2026-07-10",
    "data_criacao": "2026-07-10T14:00:00.000Z",
    "responsavel": "Mateus"
  },
  "total_movimentos": 3,
  "total_produtos": 274,
  "produtos": [{
    "codigo": "MFSS-001",
    "nome": "Monotiro Dourado",
    "categoria": "MFSS",
    "fator": 12,
    "saldo_un": -24,
    "saldo_cx_estimado": -2,
    "saldo_negativo": true
  }]
}
```

---

## O que já está pronto

- [x] CRUD completo de pedidos de venda (rascunho → emitido + baixa bidirecional de estoque)
- [x] CRUD de catálogo de produtos com upload de imagem e autocomplete
- [x] Tela de contagem de estoque com toggles por categoria e PDF
- [x] Hall de pedidos com filtros e preview modal
- [x] Log de movimentos de estoque por pedido
- [x] `GET /api/estoque/atual` — saldo em tempo real por produto
- [x] Tela `/estoque` — saldo real com alertas de negativo, filtros e Lucide Icons
- [x] Migração direta Tiny → `produtos.json` via `POST /api/catalogo/importar-tiny`
- [x] Responsividade mobile completa em todas as telas
- [x] Lucide Icons em substituição a emojis em todos os arquivos
- [x] CRUD de equipamentos e Ordens de Serviço

## O que ainda pode ser feito

- [ ] Hall de contagens — lista contagens anteriores com preview PDF
- [ ] Múltiplas seções por pedido (caso Marcio)
- [ ] Alertas automáticos de estoque negativo

---

## Padrões de código

- `fs` sempre importado explicitamente em cada route file
- Escrita atômica via `writeJSONAtomic` (nunca `fs.writeFileSync` direto em arquivos de dados)
- CSS mobile-first — breakpoint padrão `@media (max-width: 768px)`
- `preco_total = qtd_entrada × preco_unit` — fator nunca multiplica preço, só quantidade
- Lucide: adicionar `lucide.createIcons()` após qualquer `innerHTML =` que contenha `<i data-lucide>`
- Commits convencionais na branch `magic-fireworks-template`

## Sobre o Tiny ERP

O sistema foi migrado para ser **independente do Tiny**. O Tiny é usado apenas como fonte de importação inicial de produtos via `POST /api/catalogo/importar-tiny`. Todo o controle de estoque, pedidos e preços é feito neste sistema. A variável `TINY_API_TOKEN` no `.env` é usada pelo `TinyClient` (API v2).
