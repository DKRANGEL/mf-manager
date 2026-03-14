const TinyClient = require('./tinyClient');

let _cache = null;
let _lastUpdate = null;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

async function getCatalogoBot() {
    const agora = Date.now();

    if (_cache && _lastUpdate && (agora - _lastUpdate) < CACHE_TTL) {
        console.log('[CatálogoCache] Retornando cache existente');
        return _cache;
    }

    console.log('[CatálogoCache] Buscando catálogo atualizado no Tiny...');
    const client = new TinyClient(process.env.TINY_API_TOKEN);
    const produtos = await client.pesquisarProdutosComEstoque();

    _cache = produtos.map(p => ({
        codigo: p.sku,
        nome: p.nome,
        categoria: p.categoria,
        disponivel: (p.saldo_real || 0) > 0,
        quantidade: p.saldo_real || 0,
        unidade: p.unidade || 'UN'
    }));

    _lastUpdate = agora;
    console.log(`[CatálogoCache] Cache atualizado — ${_cache.length} produtos`);
    return _cache;
}

function aquecerCache() {
    console.log('[CatálogoCache] Aquecendo cache em background...');
    getCatalogoBot()
        .then(c => console.log(`[CatálogoCache] Cache aquecido — ${c.length} produtos`))
        .catch(err => console.error('[CatálogoCache] Falha ao aquecer cache:', err.message));
}

module.exports = { getCatalogoBot, aquecerCache };