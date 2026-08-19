# MF Manager — Magic Fireworks

Sistema interno de gestão de pedidos, estoque e equipamentos para a **Magic Effects Brasil Importações Ltda** (empresa de pirotecnia, Brasília-DF).

**Desenvolvedor:** Dérick | **Usuário principal:** Mateus (dono, acessa via mobile)

---

## Stack

- **Runtime:** Node.js 24 + Express
- **Banco de dados:** arquivos JSON em Docker volume persistente (`src/data/`)
- **Frontend:** HTML/CSS/JS vanilla, mobile-first
- **Ícones:** Lucide Icons (CDN, `lucide.createIcons()` após cada render dinâmico)
- **Fontes:** DM Sans + JetBrains Mono (Google Fonts)
- **Deploy:** Hostinger VPS + Docker + Nginx — branch `main`

---

## Estrutura de arquivos

```
src/
├── app.js                  # createApp() — registra todas as rotas e páginas
├── server.js               # entry point, dotenv, initData, initUsuarios
├── data/                   # persistência (Docker volume mf_data)
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
│   ├── js/alerts.js        # wrapper MF (alert/confirm/prompt/toast) sobre SweetAlert2
│   ├── js/documento.js     # renderização do documento PDF/preview (+ modo romaneio)
│   ├── index.html          # home — desktop: gerador OS/recibo | mobile: cards de nav
│   ├── pedidos.html        # hall de pedidos com cards e preview modal
│   ├── emitir.html         # criação/edição de pedido de venda
│   ├── contagem.html       # contagem física de estoque por categoria
│   ├── estoque.html        # saldo em tempo real (baseline contagem + movimentos)
│   ├── produtos.html       # CRUD do catálogo de produtos
│   └── equipamentos.html   # CRUD de equipamentos
├── routes/
│   ├── catalogo.js         # /api/catalogo — CRUD produtos
│   ├── pedidos.js          # /api/pedidos — CRUD + baixa de estoque
│   ├── contagens.js        # /api/contagens — salvar e listar contagens
│   ├── estoque.js          # /api/estoque — saldo em tempo real
│   ├── equipamentos.js     # /api/equipamentos — CRUD equipamentos
│   ├── movimentos.js       # /api/movimentos — coletor + log
│   ├── auth.js             # /api/auth — login, usuários, senhas
│   ├── auditoria.js        # /api/auditoria — trilha de ações (admin)
│   └── bot.js              # /bot — catálogo para FastZap (autenticado)
├── middleware/
│   ├── sessao.js           # cookie HMAC + requireAuth
│   ├── auditoria.js        # registro automático de ações
│   ├── permissoes.js       # controle de acesso por papel/permissões (páginas 302, APIs 403)
│   └── auth.js             # requireApiKey (bot)
└── utils/
    ├── storage.js          # readJSON, writeJSONAtomic, listJSON
    ├── permissoes.js       # papéis (admin/owner/operador), presets e resolverPermissoes
    ├── catalogoCache.js    # catálogo do bot — 100% local (produtos + saldo)
    ├── initData.js         # cria arquivos/diretórios na inicialização
    ├── migracaoHistorico.js # limpeza única do histórico (remove entradas/lixo de vai-e-volta)
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
| GET | `/api/pedidos` | Lista pedidos |
| POST | `/api/pedidos` | Salva rascunho |
| PUT | `/api/pedidos/:numero` | Atualiza pedido |
| PUT | `/api/pedidos/:numero/baixa` | Ativa ou reverte baixa de estoque |
| PUT | `/api/pedidos/:numero/recibo` | Salva o recibo de pagamento (só pedido aberto/concluído) |
| POST | `/api/pedidos/pdf` | PDF vetorial (Chrome headless) do JSON enviado — `{doc: 'pedido'\|'recibo', pedido/recibo, nome}` |
| GET | `/api/pedidos/:numero/pdf?doc=` | PDF vetorial do pedido salvo (romaneio para quem não vê valores) |
| DELETE | `/api/pedidos/:numero` | Exclui rascunho |
| POST | `/api/contagens` | Salva contagem física (nasce `aplicada: false` — staged) |
| PUT | `/api/contagens/:numero/aplicar` | Aplica/desaplica a contagem como base do estoque |
| DELETE | `/api/contagens/:numero` | Exclui uma contagem |
| GET | `/api/contagens/ultima` | Retorna contagem mais recente |
| GET | `/api/contagens` | Lista todas as contagens (com `aplicada`) |
| **GET** | `/api/estoque/atual` | **Saldo em tempo real (última contagem APLICADA − saídas posteriores; só saídas)** |
| GET | `/api/equipamentos/catalogo` | Lista equipamentos por categoria |
| POST/PUT/DELETE | `/api/equipamentos/item` | CRUD equipamentos |
| GET | `/bot/catalogo` | Catálogo para FastZap (requer BOT_API_KEY) |
| GET | `/api/auth/me` | Sessão atual (usuario, nome, admin, papel, permissoes) |
| GET/POST | `/api/auth/usuarios` | Lista / cria usuário (admin; aceita `papel`) |
| PUT | `/api/auth/usuarios/:u/permissoes` | Salva papel + permissões granulares (admin) |

---

## Níveis de acesso

Três papéis (presets em `utils/permissoes.js`), customizáveis por usuário no `/perfil`:

| Papel | Acesso |
|-------|--------|
| `admin` | Tudo — inclui usuários, senhas e auditoria. Ignora customizações. |
| `owner` | Tudo, exceto gerenciar usuários/senhas/auditoria |
| `operador` | Só a tela de pedidos, somente visualização, **sem valores** |

- **Permissões granulares** por usuário: `telas` (pedidos, emitir, estoque, contagem, produtos, equipamentos, etiquetas, coletor, movimentos) + `pedidos` (ver_valores, criar_editar, excluir, mudar_status)
- **Enforcement no servidor** (`middleware/permissoes.js`): páginas proibidas → redirect `/`; APIs → 403
- **Sem `ver_valores`**: a API de pedidos remove os preços do JSON (`ocultarValoresPedido`) e marca `valores_ocultos: true`; o `documento.js` então renderiza modo "romaneio" (sem colunas de valor, subtotais, resumo, pagamentos, dados bancários)
- **Usuários legados sem `papel`** = owner (nada quebra)
- O frontend só esconde botões por cortesia — a segurança real é sempre no servidor

### usuarios.json (gitignored)
```json
{
  "usuarios": [{
    "usuario": "fulano",
    "nome": "Fulano Silva",
    "admin": false,
    "papel": "operador",
    "permissoes": {
      "telas": { "pedidos": true, "emitir": false, "...": false },
      "pedidos": { "ver_valores": false, "criar_editar": false, "excluir": false, "mudar_status": false }
    },
    "senha_hash": "salt:hash (scrypt)",
    "senha_cifrada": "iv:tag:enc (AES-256-GCM, requer SENHA_CRYPT_KEY)",
    "criado_em": "ISO"
  }]
}
```

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
- [x] Login, gestão de usuários, auditoria e trilha de ações
- [x] Níveis de acesso (Administrador / Owner / Operador) com permissões granulares por usuário
- [x] Preview "romaneio" sem valores para usuários sem `ver_valores`
- [x] Abas por tipo de documento no hall de pedidos
- [x] Item sem valor com motivo selecionável (Pago pelo evento / Isento)
- [x] Compartilhar PDF pelo share sheet nativo do mobile — PDF vetorial gerado no servidor (Chrome headless/puppeteer-core, `utils/pdf.js`; `documento.js`/`recibo.js` são isomórficos e rodam no Node); fallback html2canvas + jsPDF se o servidor falhar
- [x] Ordem dos blocos do documento reordenável por pedido (`pedido.ordem_blocos`) — lista arrastável em `/emitir`; cabeçalho e dados do cliente ficam fixos no topo
- [x] Reordenar pagamentos já feitos por arraste (SortableJS) — reflete na tabela do documento
- [x] Recibo de pagamento em PDF (`js/recibo.js`, estilo próprio com valor por extenso) — bloco em `/emitir` visível só para pedido `aberto`/`concluido`; salvo em `pedido.recibo` via `PUT /api/pedidos/:numero/recibo`

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
- Commits convencionais na branch `main`

## Servidor de produção

- **URL:** `https://manager.magicfireworks.com`
- **VPS:** Hostinger — IP disponível no painel da Hostinger (não commitado)
- **Acesso SSH:** `ssh root@<IP_DO_VPS>` (usar **cmd.exe**, não PowerShell 7)
- **Pasta no servidor:** `/app/mf-manager`
- **Dados persistentes:** Docker volume `mf_data` → `/app/src/data`
- **Auto-deploy:** GitHub Actions via push na branch `main`

### Comandos úteis no servidor

```bash
docker compose logs -f          # ver logs em tempo real
docker compose restart          # reiniciar sem rebuild
docker compose up -d --build    # rebuild completo
docker ps                       # ver containers rodando
systemctl status nginx          # status do Nginx
```

---

## Independência do Tiny ERP

O sistema é **100% independente do Tiny** desde julho/2026. Todo o código relacionado
(TinyClient, rotas proxy, importação, cache remoto) foi removido. Catálogo, estoque,
pedidos e preços são geridos exclusivamente neste sistema. A variável `TINY_API_TOKEN`
pode ser removida do `.env`.
