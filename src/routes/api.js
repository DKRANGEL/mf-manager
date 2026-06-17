const express = require('express');
const path = require('path');
const fs = require('fs');
const TinyClient = require('../utils/tinyClient');

const router = express.Router();

const getTinyClient = () => {
    return new TinyClient(process.env.TINY_API_TOKEN);
};

// Testar conexão com a API (valida token)
router.get('/testar', async (req, res) => {
    try {
        const client = getTinyClient();
        const resultado = await client.testarConexao();
        res.json({
            success: true,
            status: resultado.retorno?.status || resultado.status || 'OK',
            data: resultado,
        });
    } catch (error) {
        console.error('Erro ao testar conexão:', error.message);
        res.json({success: false, error: error.message});
    }
});

// ====================================================================
// MATCH DE IMAGEM POR SKU
// ====================================================================

function parseSkuParts(sku) {
    const clean = sku.replace(/[-_.\\s:]/g, '').toLowerCase();
    const suffixMatch = clean.match(/(\d+)$/);
    if (!suffixMatch) return {prefix: clean, suffix: ''};
    const suffix = suffixMatch[1];
    const prefix = clean.slice(0, clean.length - suffix.length);
    return {prefix, suffix};
}

function fileMatchesSku(filenameNoExt, skuPrefix, skuSuffix) {
    const cleaned = filenameNoExt.replace(/[-_.\\s:]/g, '').toLowerCase();

    const prefixIdx = cleaned.indexOf(skuPrefix);
    if (prefixIdx === -1) return false;

    const afterPrefix = cleaned.slice(prefixIdx + skuPrefix.length);
    const suffixIdx = afterPrefix.indexOf(skuSuffix);
    if (suffixIdx === -1) return false;

    const charBefore = suffixIdx > 0 ? afterPrefix[suffixIdx - 1] : '';
    const charAfter = afterPrefix[suffixIdx + skuSuffix.length] || '';
    return !/\d/.test(charBefore) && !/\d/.test(charAfter);
}

function findBestImageMatch(imgDir, sku) {
    if (!fs.existsSync(imgDir)) return null;

    const files = fs.readdirSync(imgDir);
    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
    const imageFiles = files.filter(f => imageExts.includes(path.extname(f).toLowerCase()));
    if (imageFiles.length === 0) return null;

    const {prefix, suffix} = parseSkuParts(sku);
    if (!prefix || !suffix) return null;

    const matches = [];
    for (const file of imageFiles) {
        const nameNoExt = path.basename(file, path.extname(file));
        if (fileMatchesSku(nameNoExt, prefix, suffix)) {
            matches.push(file);
        }
    }

    if (matches.length === 0) return null;
    matches.sort((a, b) => a.length - b.length);
    return matches[0];
}

let imageMatchCache = {};
let imageCacheTime = 0;
const IMAGE_CACHE_TTL = 30000;

function getImageMatch(imgDir, sku) {
    const now = Date.now();
    if (now - imageCacheTime > IMAGE_CACHE_TTL) {
        imageMatchCache = {};
        imageCacheTime = now;
    }
    if (imageMatchCache[sku] !== undefined) return imageMatchCache[sku];
    const result = findBestImageMatch(imgDir, sku);
    imageMatchCache[sku] = result;
    return result;
}

router.get('/produto/imagem/:sku', (req, res) => {
    const sku = req.params.sku;
    const imgDir = path.join(__dirname, '..', 'public', 'produtos');

    const matchedFile = getImageMatch(imgDir, sku);
    if (matchedFile) {
        console.log(`[Imagem] SKU "${sku}" → "${matchedFile}"`);
        return res.json({
            success: true,
            source: 'local',
            matchedFile,
            url: `/public/produtos/${encodeURIComponent(matchedFile)}`,
        });
    }

    // Sem imagem local — retorna null, o frontend usa o placeholder
    res.json({success: true, source: 'none', url: null});
});

router.post('/invalidate-image-cache', (req, res) => {
    imageMatchCache = {};
    imageCacheTime = 0;
    res.json({success: true});
});

// ====================================================================
// ESTOQUE — Cache + SSE para progresso em tempo real
// ====================================================================

let estoqueCache = null;
let estoqueCacheTime = 0;
const ESTOQUE_CACHE_TTL = 5 * 60 * 1000; // 5 minutos

// SSE: progresso em tempo real — conecta antes de chamar /produtos/estoque
const sseClients = new Set();

router.get('/produtos/estoque/progresso', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Keepalive a cada 15s para não cair
    const keepalive = setInterval(() => {
        res.write(': ping\n\n');
    }, 15000);

    sseClients.add(res);

    req.on('close', () => {
        clearInterval(keepalive);
        sseClients.delete(res);
    });
});

function emitSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
        try {
            client.write(payload);
        } catch (_) {
        }
    }
}

// Rota principal de estoque
router.get('/produtos/estoque', async (req, res) => {
    // Cache hit
    const now = Date.now();
    if (estoqueCache && (now - estoqueCacheTime) < ESTOQUE_CACHE_TTL && !req.query.refresh) {
        console.log('[Estoque] Retornando do cache');
        emitSSE({tipo: 'cached', msg: 'Dados do cache (menos de 5 minutos)'});
        return res.json(estoqueCache);
    }

    try {
        const client = getTinyClient();

        const produtos = await client.pesquisarProdutosComEstoque(req.query.q || '', (evt) => {
            emitSSE(evt);
        });

        const agrupado = {};
        let totalItens = 0;
        let totalUnidades = 0;

        for (const p of produtos) {
            const catRaw = p.categoria || 'Sem Categoria';
            const cat = catRaw.includes('>>')
                ? catRaw.split('>>').pop().trim()
                : catRaw.trim();

            if (!agrupado[cat]) agrupado[cat] = [];

            const qtd = p.saldo_real || 0;

            agrupado[cat].push({
                id: p.id,
                sku: p.codigo || '',
                nome: p.descricao || p.nome || '',
                quantidade: qtd,
                unidade: p.unidade || 'UN',
                preco: parseFloat(p.preco || 0),
                categoria: cat,
            });

            totalItens++;
            totalUnidades += qtd;
        }

        const catalogoOrdenado = {};
        Object.keys(agrupado).sort().forEach(cat => {
            catalogoOrdenado[cat] = agrupado[cat].sort((a, b) =>
                (a.sku || a.nome).localeCompare(b.sku || b.nome)
            );
        });

        const resposta = {
            success: true,
            data: catalogoOrdenado,
            total: totalItens,
            totalUnidades,
        };

        // Salva cache
        estoqueCache = resposta;
        estoqueCacheTime = Date.now();

        res.json(resposta);
    } catch (err) {
        console.error('Erro ao buscar estoque:', err.message);
        emitSSE({tipo: 'error', msg: err.message});
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;