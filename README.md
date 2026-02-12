# 🧾 Tiny Recibo Pro

**Gerador de recibos profissionais para o ERP Tiny/Olist**

Transforma os recibos genéricos do PDV do Tiny ERP em documentos profissionais com identidade visual da empresa. Integração direta via API — sem retrabalho manual.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

---

## 🎯 Problema

O Tiny ERP gera recibos com layout fixo e genérico que não transmitem profissionalismo. Não há opção nativa para customizar a estrutura, fontes, cores ou layout dos recibos de venda — apenas a inclusão do logo é possível.

## 💡 Solução

App web que consome a API do Tiny, extrai os dados do pedido e renderiza um recibo com design profissional, pronto para envio via WhatsApp ou impressão.

## ✨ Features

- 🔗 Integração direta com API v2 do Tiny ERP
- 🎨 Template profissional com logo, cores e tipografia customizáveis
- 📱 Otimizado para compartilhamento via WhatsApp (exporta como imagem)
- 📄 Exportação em PDF (A4 ou térmico 80mm)
- ⚡ Interface minimalista — cola o número do pedido, gera o recibo
- 🔒 Token da API armazenado como variável de ambiente (seguro)

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Browser/UI    │────▶│  Express Proxy    │────▶│  API Tiny ERP   │
│  (HTML/CSS/JS)  │◀────│  (Node.js)       │◀────│  (v2 REST)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │
        ▼
  ┌───────────┐
  │ html2canvas│ → Exporta como PNG/PDF
  │  + jsPDF   │
  └───────────┘
```

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- Token da API do Tiny ERP ([como gerar](https://tiny.com.br/api-docs/api2-auth))

### Instalação

```bash
# Clone o repositório
git clone https://github.com/seu-usuario/tiny-recibo-pro.git
cd tiny-recibo-pro

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com seu token da API

# Inicie o servidor
npm run dev
```

### Configuração

Edite o arquivo `.env`:

```env
TINY_API_TOKEN=seu_token_aqui
PORT=3000
```

Edite o arquivo `src/config.json` para personalizar a empresa:

```json
{
  "empresa": {
    "nome": "Magic Fireworks",
    "cnpj": "00.000.000/0001-00",
    "endereco": "Rua Exemplo, 123 - Cidade/UF",
    "telefone": "(00) 00000-0000",
    "logo": "/public/logo.png"
  }
}
```

Acesse `http://localhost:3000` e pronto.

## 📁 Estrutura do Projeto

```
tiny-recibo-pro/
├── src/
│   ├── public/           # Assets estáticos (CSS, JS frontend, imagens)
│   │   ├── css/
│   │   │   └── style.css
│   │   ├── js/
│   │   │   └── app.js
│   │   └── logo.png
│   ├── routes/
│   │   └── api.js        # Rotas do proxy para API Tiny
│   ├── utils/
│   │   └── tinyClient.js # Client HTTP para API do Tiny
│   └── server.js         # Entry point Express
├── docs/
│   └── SETUP_TINY.md     # Guia de configuração do Tiny
├── .env.example
├── .gitignore
├── config.json           # Configurações da empresa
├── package.json
├── LICENSE
└── README.md
```

## 🔧 API Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/` | Interface web |
| `GET` | `/api/pedido/:id` | Obtém dados do pedido via API Tiny |
| `GET` | `/api/pdv/pedido/:id` | Obtém dados do pedido PDV via API Tiny |

## 🛠️ Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Frontend:** Vanilla HTML/CSS/JS
- **PDF:** html2canvas + jsPDF
- **HTTP Client:** node-fetch
- **API:** Tiny ERP API v2

## 📝 Licença

MIT License — veja o arquivo [LICENSE](LICENSE) para detalhes.

---

Desenvolvido para resolver um problema real de identidade visual em recibos de venda do Tiny ERP.
