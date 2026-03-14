// src/utils/catalogoCache.js

const fs = require('fs');
const path = require('path');
const TinyClient = require('./tinyClient');

const CACHE_FILE = path.join(__dirname, '../data/catalogo-cache.json');
const CACHE_TTL = 60 * 60 * 1000; // 60 minutos

let _cache = null;
let _lastUpdate = null;

// ─── Persistência em disco ────────────────────────────────────────────────────

function salvarCacheEmDisco(produtos) {
    try {
        const payload = {atualizadoEm: Date.now(), produtos};
        fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
        console.log(`[CatálogoCache] Cache salvo em disco — ${produtos.length} produtos`);
    } catch (err) {
        console.error('[CatálogoCache] Erro ao salvar cache em disco:', err.message);
    }
}

function carregarCacheDoisco() {
    try {
        if (!fs.existsSync(CACHE_FILE)) return false;
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const payload = JSON.parse(raw);
        const idade = Date.now() - payload.atualizadoEm;

        _cache = payload.produtos;
        _lastUpdate = payload.atualizadoEm;

        if (idade > CACHE_TTL) {
            console.log('[CatálogoCache] Cache em disco expirado — será renovado em background');
        } else {
            const minutos = Math.floor(idade / 60000);
            console.log(`[CatálogoCache] Cache carregado do disco — ${_cache.length} produtos (${minutos}min atrás)`);
        }
        return true;
    } catch (err) {
        console.error('[CatálogoCache] Erro ao carregar cache do disco:', err.message);
        return false;
    }
}

// ─── Busca no Tiny ────────────────────────────────────────────────────────────

async function buscarDoTiny() {
    console.log('[CatálogoCache] Buscando catálogo atualizado no Tiny...');
    const client = new TinyClient(process.env.TINY_API_TOKEN);
    const produtos = await client.pesquisarProdutosComEstoque();

    const catalogo = produtos.map(p => ({
        codigo: p.sku,
        nome: p.nome,
        categoria: p.categoria,
        disponivel: (p.saldo_real || 0) > 0,
        quantidade: p.saldo_real || 0,
        unidade: p.unidade || 'UN'
    }));

    _cache = catalogo;
    _lastUpdate = Date.now();
    salvarCacheEmDisco(catalogo);
    console.log(`[CatálogoCache] Cache atualizado — ${catalogo.length} produtos`);
    return catalogo;
}

// ─── Interface pública ────────────────────────────────────────────────────────

async function getCatalogoBot() {
    // Cache em memória válido
    if (_cache && _lastUpdate && (Date.now() - _lastUpdate) < CACHE_TTL) {
        console.log('[CatálogoCache] Retornando cache em memória');
        return _cache;
    }

    // Cache em memória expirado mas existe — retorna dados antigos e renova em background
    if (_cache) {
        console.log('[CatálogoCache] Cache expirado — retornando dados antigos e renovando em background');
        buscarDoTiny().catch(err =>
            console.error('[CatálogoCache] Erro na renovação em background:', err.message)
        );
        return _cache;
    }

    // Sem cache em memória — busca síncrona (só na primeira chamada após restart sem disco)
    return await buscarDoTiny();
}

function aquecerCache() {
    console.log('[CatálogoCache] Inicializando cache...');

    const carregouDoDisco = carregarCacheDoisco();

    if (carregouDoDisco) {
        const idade = Date.now() - _lastUpdate;
        if (idade > CACHE_TTL) {
            setTimeout(() => {
                buscarDoTiny().catch(err =>
                    console.error('[CatálogoCache] Erro ao renovar cache expirado:', err.message)
                );
            }, 5000);
        }
    } else {
        setTimeout(() => {
            buscarDoTiny().catch(err =>
                console.error('[CatálogoCache] Erro ao aquecer cache:', err.message)
            );
        }, 5000);
    }

    // Renovação automática a cada 60 minutos
    setInterval(() => {
        console.log('[CatálogoCache] Renovação automática agendada...');
        buscarDoTiny().catch(err =>
            console.error('[CatálogoCache] Erro na renovação automática:', err.message)
        );
    }, CACHE_TTL);
}

module.exports = {getCatalogoBot, aquecerCache};