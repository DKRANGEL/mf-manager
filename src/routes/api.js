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

// ★ PRINCIPAL: Buscar pedido pelo NÚMERO visível na interface do Tiny
router.get('/pedido/numero/:numero', async (req, res) => {
    try {
        const client = getTinyClient();
        const pedido = await client.obterPedidoPorNumero(req.params.numero);
        res.json({success: true, data: pedido});
    } catch (error) {
        console.error('Erro ao buscar por número:', error.message);
        res.status(400).json({success: false, error: error.message});
    }
});

// Obter pedido de venda por ID interno da API
router.get('/pedido/:id', async (req, res) => {
    try {
        const client = getTinyClient();
        const pedido = await client.obterPedido(req.params.id);
        res.json({success: true, data: pedido});
    } catch (error) {
        console.error('Erro ao obter pedido:', error.message);
        res.status(error.message.includes('API Tiny') ? 400 : 500).json({success: false, error: error.message});
    }
});

// Obter pedido do PDV por ID interno
router.get('/pdv/pedido/:id', async (req, res) => {
    try {
        const client = getTinyClient();
        const pedido = await client.obterPedidoPDV(req.params.id);
        res.json({success: true, data: pedido});
    } catch (error) {
        console.error('Erro ao obter pedido PDV:', error.message);
        res.status(error.message.includes('API Tiny') ? 400 : 500).json({success: false, error: error.message});
    }
});

// Pesquisar pedidos por filtros
router.get('/pedidos', async (req, res) => {
    try {
        const client = getTinyClient();
        const pedidos = await client.pesquisarPedidos(req.query);
        res.json({success: true, data: pedidos});
    } catch (error) {
        console.error('Erro ao pesquisar pedidos:', error.message);
        res.status(500).json({success: false, error: error.message});
    }
});

// ====================================================================
// MATCH DE IMAGEM POR SKU — PREFIXO + SUFIXO EXATOS
//
// O SKU é dividido em:
//   PREFIXO = tudo antes do último bloco numérico, sem separadores
//   SUFIXO  = último bloco de dígitos
//
// Ambos EXATOS no nome do arquivo (sem separadores).
//
//   "MFSSS-001"    → prefix="mfsss"  suffix="001"
//   "MFSS1.2-015"  → prefix="mfss12" suffix="015"
//   "MFCX-042"     → prefix="mfcx"   suffix="042"
//   "MFCS-100"     → prefix="mfcs"   suffix="100"
//
// MFSSS-015  ≠ MFSS1.2-015  (mfsss015 ≠ mfss12015) ✅
// MFCS-100   ≠ MFCX-100     (mfcs ≠ mfcx)          ✅
// ====================================================================

function parseSkuParts(sku) {
    const clean = sku.replace(/[-_.\s:]/g, '').toLowerCase();
    const suffixMatch = clean.match(/(\d+)$/);
    if (!suffixMatch) return {prefix: clean, suffix: ''};
    const suffix = suffixMatch[1];
    const prefix = clean.slice(0, clean.length - suffix.length);
    return {prefix, suffix};
}

function fileMatchesSku(filenameNoExt, skuPrefix, skuSuffix) {
    const cleaned = filenameNoExt.replace(/[-_.\s:]/g, '').toLowerCase();

    const prefixIdx = cleaned.indexOf(skuPrefix);
    if (prefixIdx === -1) return false;

    const afterPrefix = cleaned.slice(prefixIdx + skuPrefix.length);
    const suffixIdx = afterPrefix.indexOf(skuSuffix);
    if (suffixIdx === -1) return false;

    // Sufixo não pode ser parte de número maior
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

// Cache
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

router.get('/produto/imagem/:sku', async (req, res) => {
    const sku = req.params.sku;
    const imgDir = path.join(__dirname, '..', 'public', 'produtos');

    // 1. Local (match exato prefixo+sufixo)
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

    // 2. API do Tiny
    try {
        const client = getTinyClient();
        const produto = await client.pesquisarProdutoPorSKU(sku);
        if (produto) {
            const imagemUrl =
                produto.imagemURL ||
                produto.imagem_url ||
                produto.url_imagem ||
                (produto.anexos && produto.anexos.length > 0 ? produto.anexos[0].anexo?.url : null) ||
                (produto.imagens_externas && produto.imagens_externas.length > 0 ? produto.imagens_externas[0].url : null);
            if (imagemUrl) {
                return res.json({success: true, source: 'api', url: imagemUrl});
            }
        }
    } catch (err) {
        console.log(`[Imagem] API falhou para SKU ${sku}: ${err.message}`);
    }

    res.json({success: true, source: 'none', url: null});
});

router.post('/invalidate-image-cache', (req, res) => {
    imageMatchCache = {};
    imageCacheTime = 0;
    res.json({success: true});
});

router.get('/produtos/estoque', async (req, res) => {
    try {
        const client = getTinyClient();
        const produtos = await client.pesquisarTodosProdutos(req.query.q || '');

        // Agrupa por categoria
        const agrupado = {};
        let totalItens = 0;
        let totalUnidades = 0;

        for (const p of produtos) {
            // Categoria pode vir como "Pai >> Filho", pega só o último nível
            const catRaw = p.categoria || 'Sem Categoria';
            const cat = catRaw.includes('>>')
                ? catRaw.split('>>').pop().trim()
                : catRaw.trim();

            if (!agrupado[cat]) agrupado[cat] = [];

            const qtd = parseFloat(p.estoque?.saldoVirtualTotal || p.saldo_estoque || 0);

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

        // Ordena categorias e itens dentro de cada uma
        const catalogoOrdenado = {};
        Object.keys(agrupado).sort().forEach(cat => {
            catalogoOrdenado[cat] = agrupado[cat].sort((a, b) =>
                (a.sku || a.nome).localeCompare(b.sku || b.nome)
            );
        });

        res.json({
            success: true,
            data: catalogoOrdenado,
            total: totalItens,
            totalUnidades,
        });
    } catch (err) {
        console.error('Erro ao buscar estoque:', err.message);
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;
