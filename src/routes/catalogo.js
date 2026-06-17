// ===================== ROTAS: CATÁLOGO DE PRODUTOS PRÓPRIO =====================
// CRUD de produtos salvos em data/produtos.json (storage atômico)
// + seed read-only a partir do catalogo-cache.json (Tiny).
//
// Montado em /api/catalogo — NÃO em /api/produtos, pra não colidir com
// /api/produtos/estoque que vive no routes/api.js.

const express = require('express');
const path = require('path');
const {readJSON, writeJSONAtomic} = require('../utils/storage');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');
const CACHE_FILE = path.join(DATA_DIR, 'catalogo-cache.json');

// ---- Helpers ----

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
            categoria: (req.body.categoria || 'Sem categoria').trim(),
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
            categoria: req.body.categoria !== undefined ? req.body.categoria.trim() : atual.categoria,
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

// ===================== SEED DO TINY (read-only) =====================

// POST /api/catalogo/importar-tiny — popula/atualiza produtos a partir do cache do Tiny
// Traz só dados descritivos (codigo, nome, categoria, unidade). Estoque e preço NÃO
// vêm do Tiny: estoque é nosso (contagem) e preço entra no cadastro/edição.
router.post('/importar-tiny', (req, res) => {
    try {
        const cache = readJSON(CACHE_FILE, {produtos: []});
        const tinyProdutos = cache.produtos || [];
        if (tinyProdutos.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Cache do Tiny vazio — aguarde a sincronização do catálogo'
            });
        }

        const db = lerProdutos();
        const porCodigo = new Map(db.produtos.map(p => [p.codigo, p]));
        let novos = 0;
        let atualizados = 0;

        for (const t of tinyProdutos) {
            const codigo = (t.codigo || '').trim();
            if (!codigo) continue;

            if (porCodigo.has(codigo)) {
                const p = porCodigo.get(codigo);
                p.nome = t.nome || p.nome;
                p.categoria = t.categoria || p.categoria;
                p.unidade = t.unidade || p.unidade;
                atualizados++;
            } else {
                const novo = {
                    id: db.proximo_id++,
                    codigo,
                    nome: t.nome || '',
                    categoria: t.categoria || 'Sem categoria',
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
        res.json({success: true, novos, atualizados, total: db.produtos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;