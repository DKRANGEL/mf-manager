const fetch = require('node-fetch');

const TINY_BASE_URL = 'https://api.tiny.com.br/api2';

class TinyClient {
  constructor(token) {
    if (!token) throw new Error('TINY_API_TOKEN não configurado');
    this.token = token;
  }

  async _request(endpoint, params = {}) {
    const body = new URLSearchParams({
      token: this.token,
      formato: 'JSON',
      ...params,
    });

    const response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Tiny: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.retorno.status === 'Erro') {
      const erros = data.retorno.erros?.map(e => e.erro).join(', ') || 'Erro desconhecido';
      throw new Error(`API Tiny: ${erros}`);
    }

    return data.retorno;
  }

  // Retorna JSON cru da API (para debug/teste de conexão)
  async _requestRaw(endpoint, params = {}) {
    const body = new URLSearchParams({
      token: this.token,
      formato: 'JSON',
      ...params,
    });

    const response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Erro na API Tiny: HTTP ${response.status}`);
    }

    return await response.json();
  }

  // Testa se o token é válido
  async testarConexao() {
    const data = await this._requestRaw('pedidos.pesquisa.php', {
      dataInicial: '01/01/2026',
      dataFinal: '31/12/2026',
    });
    return data;
  }

  async obterPedido(id) {
    const retorno = await this._request('pedido.obter.php', { id });
    return retorno.pedido;
  }

  async obterPedidoPDV(id) {
    const retorno = await this._request('pdv.pedido.obter.php', { id });
    return retorno.pedido;
  }

  async pesquisarPedidos(filters = {}) {
    const retorno = await this._request('pedidos.pesquisa.php', filters);
    return retorno.pedidos || [];
  }

  // Busca pedido pelo NÚMERO visível na interface (não pelo ID interno da API)
  // Fluxo: pesquisa por número → pega ID interno → obtém dados completos
  async obterPedidoPorNumero(numero) {
    const retorno = await this._request('pedidos.pesquisa.php', {
      numero,
    });

    const pedidos = retorno.pedidos || [];

    if (pedidos.length === 0) {
      throw new Error(`Nenhum pedido encontrado com número "${numero}"`);
    }

    // Pesquisa retorna dados resumidos — pega o ID interno
    const pedidoResumo = pedidos[0].pedido;
    const idInterno = pedidoResumo.id;

    console.log(`[Tiny] Número "${numero}" → ID interno: ${idInterno}`);

    // Busca dados completos pelo ID interno
    const pedidoCompleto = await this.obterPedido(idInterno);
    return pedidoCompleto;
  }

  // Busca dados de um produto pelo ID (inclui URL da imagem)
  async obterProduto(id) {
    const retorno = await this._request('produto.obter.php', { id });
    return retorno.produto;
  }

  // Busca produto por SKU (código)
  async pesquisarProdutoPorSKU(sku) {
    const retorno = await this._request('produtos.pesquisa.php', {
      pesquisa: sku,
    });
    const produtos = retorno.produtos || [];
    if (produtos.length === 0) return null;

    const idProduto = produtos[0].produto.id;
    return await this.obterProduto(idProduto);
  }
}

module.exports = TinyClient;
