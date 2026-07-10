// ===================== ROTAS: CATÁLOGO DE PRODUTOS PRÓPRIO =====================
// CRUD de produtos salvos em data/produtos.json (storage atômico)
// + seed read-only a partir do catalogo-cache.json (Tiny).
//
// Montado em /api/catalogo — NÃO em /api/produtos, pra não colidir com
// /api/produtos/estoque que vive no routes/api.js.

const express = require('express');
const path = require('path');
const fs = require('fs');

const {readJSON, writeJSONAtomic} = require('../utils/storage');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');
const CACHE_FILE = path.join(DATA_DIR, 'catalogo-cache.json');

// ---- Helpers ----

function categoriaDoCodigo(codigo) {
    if (!codigo) return 'Sem categoria';
    const match = codigo.split(/[-_]/)[0];
    return match || 'Sem categoria';
}

function lerProdutos() {
    return readJSON(PRODUTOS_FILE, {proximo_id: 1, produtos: []});
}

function salvarProdutos(db) {
    writeJSONAtomic(PRODUTOS_FILE, db);
}

// ===================== LISTAGEM =====================

// GET /api/catalogo/catalogo — lista completa agrupada por categoria
router.get('/catalogo', (req, res) => {
    try {
        const db = lerProdutos();
        const agrupado = {};
        db.produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!agrupado[cat]) agrupado[cat] = [];
            agrupado[cat].push(p);
        });
        Object.values(agrupado).forEach(lista =>
            lista.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''))
        );
        res.json({success: true, data: agrupado, total: db.produtos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== CRUD =====================

// POST /api/catalogo/item — cria produto
router.post('/item', (req, res) => {
    try {
        const db = lerProdutos();
        const codigo = (req.body.codigo || '').trim();

        if (codigo && db.produtos.find(p => p.codigo === codigo)) {
            return res.status(400).json({success: false, error: `Código ${codigo} já existe`});
        }

        const novo = {
            id: db.proximo_id++,
            codigo,
            nome: (req.body.nome || '').trim(),
            categoria: categoriaDoCodigo(codigo),
            preco: parseFloat(req.body.preco) || 0,
            unidade: (req.body.unidade || 'UN').trim(),
            observacoes: (req.body.observacoes || '').trim(),
            data_cadastro: new Date().toISOString().split('T')[0]
        };

        db.produtos.push(novo);
        salvarProdutos(db);
        res.json({success: true, data: novo});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/item/:id — atualiza produto
router.put('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const atual = db.produtos[idx];

        // Se mudou o código, garante que não duplica outro
        const novoCodigo = req.body.codigo !== undefined ? req.body.codigo.trim() : atual.codigo;
        if (novoCodigo !== atual.codigo && db.produtos.find(p => p.codigo === novoCodigo && p.id !== id)) {
            return res.status(400).json({success: false, error: `Código ${novoCodigo} já existe`});
        }

        db.produtos[idx] = {
            ...atual,
            codigo: novoCodigo,
            nome: req.body.nome !== undefined ? req.body.nome.trim() : atual.nome,
            categoria: categoriaDoCodigo(novoCodigo),
            preco: req.body.preco !== undefined ? (parseFloat(req.body.preco) || 0) : atual.preco,
            unidade: req.body.unidade !== undefined ? req.body.unidade.trim() : atual.unidade,
            observacoes: req.body.observacoes !== undefined ? req.body.observacoes.trim() : atual.observacoes
        };

        salvarProdutos(db);
        res.json({success: true, data: db.produtos[idx]});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/catalogo/item/:id — remove produto
router.delete('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const removido = db.produtos.splice(idx, 1)[0];
        salvarProdutos(db);
        res.json({success: true, data: removido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== MIGRAÇÃO DO TINY (API direta) =====================

// POST /api/catalogo/importar-tiny — puxa todos os produtos da API do Tiny e
// mescla com produtos.json. Atualiza nome/categoria/unidade dos existentes e
// adiciona os novos. Preço e estoque NÃO vêm do Tiny — são geridos aqui.
const TinyClient = require('../utils/tinyClient');

router.post('/importar-tiny', async (req, res) => {
    try {
        const token = process.env.TINY_API_TOKEN;
        if (!token) {
            return res.status(500).json({success: false, error: 'TINY_API_TOKEN não configurado no ambiente'});
        }

        const client = new TinyClient(token);
        const tinyProdutos = await client.pesquisarTodosProdutos('');

        if (tinyProdutos.length === 0) {
            return res.status(400).json({success: false, error: 'Nenhum produto encontrado no Tiny'});
        }

        const db = lerProdutos();
        const porCodigo = new Map(db.produtos.map(p => [p.codigo, p]));
        let novos = 0, atualizados = 0, ignorados = 0;

        for (const t of tinyProdutos) {
            const codigo = (t.codigo || '').trim();
            if (!codigo) { ignorados++; continue; }

            if (porCodigo.has(codigo)) {
                const p = porCodigo.get(codigo);
                p.nome = t.nome || p.nome;
                p.categoria = categoriaDoCodigo(codigo);
                p.unidade = t.unidade || p.unidade;
                atualizados++;
            } else {
                const novo = {
                    id: db.proximo_id++,
                    codigo,
                    nome: t.nome || '',
                    categoria: categoriaDoCodigo(codigo),
                    preco: 0,
                    unidade: t.unidade || 'UN',
                    observacoes: '',
                    data_cadastro: new Date().toISOString().split('T')[0]
                };
                db.produtos.push(novo);
                porCodigo.set(codigo, novo);
                novos++;
            }
        }

        salvarProdutos(db);
        res.json({success: true, novos, atualizados, ignorados, total: db.produtos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

const multer = require('multer');
const PRODUTOS_IMG_DIR = path.join(__dirname, '..', 'data', 'produtos');

const upload = multer({
    dest: PRODUTOS_IMG_DIR,
    limits: {fileSize: 5 * 1024 * 1024}, // 5MB
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Apenas imagens são aceitas'));
        }
        cb(null, true);
    }
});

// PUT /api/catalogo/item/:id/imagem
router.put('/item/:id/imagem', upload.single('imagem'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({success: false, error: 'Nenhum arquivo enviado'});

        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) {
            fs.unlinkSync(req.file.path); // limpa o arquivo se produto não existir
            return res.status(404).json({success: false, error: 'Produto não encontrado'});
        }

        // Renomeia pro nome final: CODIGO.ext (ex: MFSSS-001.jpg)
        const ext = path.extname(req.file.originalname).toLowerCase() || '.jpg';
        const nomeArquivo = `${db.produtos[idx].codigo.replace(/[^a-zA-Z0-9_\-.]/g, '_')}${ext}`;
        const destFinal = path.join(PRODUTOS_IMG_DIR, nomeArquivo);

        // Remove imagem anterior se existir e for diferente
        const imagemAnterior = db.produtos[idx].imagem;
        if (imagemAnterior && imagemAnterior !== nomeArquivo) {
            const pathAnterior = path.join(PRODUTOS_IMG_DIR, imagemAnterior);
            if (fs.existsSync(pathAnterior)) fs.unlinkSync(pathAnterior);
        }

        fs.renameSync(req.file.path, destFinal);
        db.produtos[idx].imagem = nomeArquivo;
        salvarProdutos(db);

        res.json({success: true, data: {imagem: nomeArquivo, url: `/public/produtos/${nomeArquivo}`}});
    } catch (err) {
        if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/catalogo/item/:id/imagem
router.delete('/item/:id/imagem', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const nomeArquivo = db.produtos[idx].imagem;
        if (nomeArquivo) {
            const filePath = path.join(PRODUTOS_IMG_DIR, nomeArquivo);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            db.produtos[idx].imagem = null;
            salvarProdutos(db);
        }

        res.json({success: true});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/catalogo/buscar?q=texto — autocomplete com foto
router.get('/buscar', (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const db = lerProdutos();

        let resultados = db.produtos;

        if (q) {
            resultados = resultados.filter(p =>
                (p.codigo || '').toLowerCase().includes(q) ||
                (p.nome || '').toLowerCase().includes(q) ||
                (p.categoria || '').toLowerCase().includes(q)
            );
        }

        // Limita a 20 resultados no autocomplete
        resultados = resultados.slice(0, 20).map(p => ({
            id: p.id,
            codigo: p.codigo,
            nome: p.nome,
            categoria: p.categoria,
            preco: p.preco,
            unidade: p.unidade,
            imagem: p.imagem || null,
            fator: p.fator || 1
        }));

        res.json({success: true, data: resultados});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;