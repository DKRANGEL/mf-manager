# Configuração do Token API no Tiny ERP

## Passo a passo

### 1. Acessar Extensões
- Faça login no Tiny ERP: https://erp.tiny.com.br
- Vá em **Menu → Início → Extensões**

### 2. Adicionar extensão Token API
- Procure por **"Token API"**
- Clique em **Adicionar**
- Confirme a instalação

### 3. Gerar o Token
- Após instalada, acesse a extensão
- Clique em **Gerar Token**
- Copie o token gerado

### 4. Configurar no projeto
- Cole o token no arquivo `.env`:

```env
TINY_API_TOKEN=seu_token_copiado_aqui
```

## Limites da API

| Plano | Chamadas/dia |
|-------|-------------|
| Impulsione | 2.000 |
| Evoluir | 5.000 |
| Potencializar | 15.000 |

Com 30 recibos/dia, cada recibo fazendo 1 chamada, você usará ~30 chamadas. Muito abaixo do limite.

## Endpoints utilizados

| Endpoint | Descrição |
|----------|-----------|
| `pedido.obter.php` | Dados completos do pedido de venda |
| `pdv.pedido.obter.php` | Dados do pedido feito pelo PDV |
| `pedidos.pesquisa.php` | Pesquisa de pedidos por filtros |

## Referência

- [Documentação API Tiny v2](https://tiny.com.br/api-docs/api2-auth)
- [Webhooks](https://tiny.com.br/api-docs/api2-webhooks) (não utilizado neste projeto)
