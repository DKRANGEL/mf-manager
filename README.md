# MF Manager — Magic Fireworks

Sistema interno de gestão de pedidos, estoque e equipamentos para a **Magic Effects Brasil Importações Ltda** — empresa de pirotecnia, Brasília-DF.

![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![Deploy](https://img.shields.io/badge/Deploy-Hostinger_VPS-orange)

---

## Funcionalidades

- **Pedidos de venda** — criar, emitir e controlar baixa de estoque bidirecional
- **Estoque em tempo real** — saldo por produto calculado a partir da última contagem + movimentos
- **Contagem física** — registrar contagens por categoria com exportação em PDF
- **Catálogo de produtos** — CRUD com upload de imagem e autocomplete
- **Equipamentos** — cadastro e ordens de serviço
- **Mobile-first** — interface otimizada para uso no celular pelo Mateus (usuário principal)

---

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Runtime | Node.js 24 + Express |
| Banco de dados | Arquivos JSON em Docker volume persistente |
| Frontend | HTML/CSS/JS vanilla |
| Ícones | Lucide Icons (CDN) |
| Deploy | Hostinger VPS + Docker + Nginx |

---

## Rodando localmente

### Pré-requisitos

- Node.js 18+

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
BOT_API_KEY=chave_do_fastzap    # autenticação do endpoint /bot
PORT=3003                        # porta local (produção usa 8080)
NODE_ENV=production
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
| `/produtos` | Catálogo de produtos (CRUD) |
| `/equipamentos` | Cadastro de equipamentos e ordens de serviço |

---

## API principal

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/catalogo/catalogo` | Lista produtos por categoria |
| GET | `/api/catalogo/buscar?q=` | Autocomplete de produtos |
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

## Deploy — Hostinger VPS

**URL de produção:** `https://manager.magicfireworks.com`

### Acesso ao servidor

```bash
# Usar cmd.exe (não PowerShell 7)
ssh root@85.31.60.246
```

### Estrutura no servidor

```
/app/mf-manager/          # repositório clonado
  .env                    # variáveis de ambiente (não commitado)
  docker-compose.yml      # define container + volume
```

Os dados ficam em Docker volume (`mf_data`) montado em `/app/src/data` — persistem entre deploys e resets.

### Deploy manual (se necessário)

```bash
ssh root@85.31.60.246
cd /app/mf-manager
git pull origin magic-fireworks-template
docker compose up -d --build
docker image prune -f
```

### Auto-deploy

Todo `git push` na branch `magic-fireworks-template` dispara o GitHub Actions (`.github/workflows/deploy.yml`) que faz o deploy automaticamente via SSH.

**Secrets necessários no GitHub:** `VPS_HOST`, `VPS_USER`, `VPS_KEY`

---

Desenvolvido por Dérick para uso interno da Magic Effects Brasil.
