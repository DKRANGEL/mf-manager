# MF Manager — Magic Fireworks

Sistema interno de gestão de pedidos, estoque e equipamentos para a **Magic Effects Brasil Importações Ltda** — empresa de pirotecnia, Brasília-DF.

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Fly.io-8B5CF6?logo=fly.io&logoColor=white)

---

## Funcionalidades

- **Pedidos de venda** — criar, emitir e controlar baixa de estoque bidirecional
- **Estoque em tempo real** — saldo por produto calculado a partir da última contagem + movimentos
- **Contagem física** — registrar contagens por categoria com exportação em PDF
- **Catálogo de produtos** — CRUD com upload de imagem, autocomplete e importação do Tiny ERP
- **Equipamentos** — cadastro e ordens de serviço
- **Mobile-first** — interface otimizada para uso no celular pelo Mateus (usuário principal)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 24 + Express |
| Banco de dados | Arquivos JSON em volume persistente (Fly.io) |
| Frontend | HTML/CSS/JS vanilla |
| Ícones | Lucide Icons (CDN) |
| Deploy | Fly.io |

---

## Rodando localmente

### Pré-requisitos

- Node.js 18+
- Token da API do Tiny ERP (para importação de produtos)

### Instalação

```bash
git clone <repo>
cd tiny-recibo-pro
npm install
cp .env.example .env   # edite com seu token
npm run dev
```

### Variáveis de ambiente

```env
TINY_API_TOKEN=seu_token_aqui   # API v2 do Tiny ERP
BOT_API_KEY=chave_do_fastzap    # autenticação do endpoint /bot
PORT=3003                        # porta local (Fly.io usa 8080)
```

Acesse `http://localhost:3003`.

---

## Páginas

| Rota | Descrição |
|------|-----------|
| `/` | Home — desktop (gerador OS/recibo) e mobile (cards de navegação) |
| `/pedidos` | Hall de pedidos com filtros e preview |
| `/emitir` | Criar ou editar pedido de venda |
| `/estoque` | Saldo em tempo real por produto |
| `/contagem` | Registrar contagem física de estoque |
| `/produtos` | Catálogo de produtos (CRUD + importar do Tiny) |
| `/equipamentos` | Cadastro de equipamentos e ordens de serviço |

---

## API principal

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/catalogo/catalogo` | Lista produtos por categoria |
| GET | `/api/catalogo/buscar?q=` | Autocomplete de produtos |
| POST | `/api/catalogo/importar-tiny` | Importa todos os produtos da API do Tiny |
| GET | `/api/pedidos` | Lista pedidos |
| PUT | `/api/pedidos/:numero/baixa` | Ativa/reverte baixa de estoque |
| POST | `/api/contagens` | Salva contagem física |
| GET | `/api/estoque/atual` | Saldo em tempo real (baseline + movimentos) |
| GET | `/api/equipamentos/catalogo` | Lista equipamentos por categoria |

---

## Estrutura de dados

Os dados são armazenados em `src/data/` como arquivos JSON:

```
src/data/
├── produtos.json         # catálogo completo
├── config-pedidos.json   # próximo número de pedido
├── pedidos/              # um arquivo por pedido
├── contagens/            # um arquivo por contagem física
├── movimentos/           # log de baixas por pedido
└── ordens/               # ordens de equipamento
```

---

## Deploy (Fly.io)

```bash
fly deploy
```

O volume de dados é montado em `/data` na máquina virtual. Os arquivos JSON persistem entre deploys.

---

Desenvolvido por Dérick para uso interno da Magic Effects Brasil.
