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
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
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

    async _requestRaw(endpoint, params = {}) {
        const body = new URLSearchParams({
            token: this.token,
            formato: 'JSON',
            ...params,
        });

        const response = await fetch(`${TINY_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: body.toString(),
        });

        if (!response.ok) {
            throw new Error(`Erro na API Tiny: HTTP ${response.status}`);
        }

        return await response.json();
    }

    async testarConexao() {
        const data = await this._requestRaw('produtos.pesquisa.php', { pesquisa: '' });
        return data;
    }

    async obterProduto(id) {
        const retorno = await this._request('produto.obter.php', {id});
        return retorno.produto;
    }

    async pesquisarProdutoPorSKU(sku) {
        const retorno = await this._request('produtos.pesquisa.php', {pesquisa: sku});
        const produtos = retorno.produtos || [];
        if (produtos.length === 0) return null;

        const idProduto = produtos[0].produto.id;
        return await this.obterProduto(idProduto);
    }

    async pesquisarTodosProdutos(pesquisa = '') {
        const todos = [];
        let pagina = 1;

        while (true) {
            const retorno = await this._request('produtos.pesquisa.php', {pesquisa, pagina});
            const produtos = retorno.produtos || [];
            if (produtos.length === 0) break;
            todos.push(...produtos.map(p => p.produto));
            if (produtos.length < 100) break;
            pagina++;
        }

        return todos;
    }

    // Busca lista de produtos + estoque real via produto.obter.estoque.php
    // SEQUENCIAL com delay — Promise.all estoura o rate limit da API Tiny
    // onProgress(current, total, sku, saldo, logLine) — callback opcional para SSE
    async pesquisarProdutosComEstoque(pesquisa = '', onProgress = null) {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const emit = (current, total, sku, saldo, tipo, msg) => {
            if (onProgress) onProgress({current, total, sku, saldo, tipo, msg});
        };

        // 1. Busca lista de produtos
        const todos = [];
        let pagina = 1;

        emit(0, 0, '', 0, 'info', 'Buscando lista de produtos...');
        while (true) {
            const retorno = await this._request('produtos.pesquisa.php', {pesquisa, pagina});
            const produtos = retorno.produtos || [];
            if (produtos.length === 0) break;
            todos.push(...produtos.map(p => p.produto));
            if (produtos.length < 100) break;
            pagina++;
        }

        if (todos.length === 0) return [];

        emit(0, todos.length, '', 0, 'info', `${todos.length} produtos encontrados. Buscando estoques...`);

        // 2. Busca estoque UM POR VEZ com delay entre cada chamada
        const DELAY_MS = 400;
        const RETRY_DELAY_MS = 20000;
        const MAX_RETRIES = 3;
        const resultado = [];

        for (let i = 0; i < todos.length; i++) {
            const produto = todos[i];
            let saldo = 0;

            for (let tentativa = 1; tentativa <= MAX_RETRIES; tentativa++) {
                try {
                    const r = await this._request('produto.obter.estoque.php', {id: produto.id});
                    saldo = parseFloat(r.produto?.saldo || 0);
                    break;
                } catch (err) {
                    const isRateLimit = err.message.includes('Bloqueada') || err.message.includes('Excedido');
                    if (isRateLimit && tentativa < MAX_RETRIES) {
                        const msg = `Rate limit em ${produto.codigo}, aguardando ${RETRY_DELAY_MS / 1000}s (tentativa ${tentativa}/${MAX_RETRIES})`;
                        console.log(`[Estoque] ${msg}`);
                        emit(i + 1, todos.length, produto.codigo, 0, 'ratelimit', msg);
                        await sleep(RETRY_DELAY_MS);
                    } else {
                        const msg = `ERRO ${produto.codigo}: ${err.message}`;
                        console.log(`[Estoque] ${msg}`);
                        emit(i + 1, todos.length, produto.codigo, 0, 'error', msg);
                        saldo = 0;
                        break;
                    }
                }
            }

            resultado.push({...produto, saldo_real: saldo});
            emit(i + 1, todos.length, produto.codigo, saldo, 'ok', `${produto.codigo} → ${saldo} un.`);

            if (i < todos.length - 1) {
                await sleep(DELAY_MS);
            }
        }

        emit(todos.length, todos.length, '', 0, 'done', `Concluído: ${resultado.length} produtos processados`);
        return resultado;
    }
}

module.exports = TinyClient;
module.exports.default = TinyClient;