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
}

module.exports = TinyClient;
