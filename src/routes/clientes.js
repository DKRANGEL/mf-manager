// ===================== ROTAS: CLIENTES =====================
// Escritórios, produtoras e clientes recorrentes, com tabela de
// preços própria (por categoria + exceções por produto).
// /api/clientes

const express = require('express');
const path = require('path');
const { readJSON, writeJSONAtomic } = require('../utils/storage');

const router = express.Router();
const CLIENTES_FILE = path.join(__dirname, '..', 'data', 'clientes.json');

function lerClientes() {
    return readJSON(CLIENTES_FILE, { proximo_id: 1, clientes: [] });
}

// GET /api/clientes — lista completa
router.get('/', (req, res) => {
    try {
        const db = lerClientes();
        const lista = [...db.clientes].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        res.json({ success: true, data: lista, total: lista.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/clientes/buscar?q= — autocomplete (máx 10)
router.get('/buscar', (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const db = lerClientes();
        let lista = db.clientes;
        if (q) lista = lista.filter(c => (c.nome || '').toLowerCase().includes(q));
        lista = [...lista].sort((a, b) => (a.nome || '').localeCompare(b.nome || '')).slice(0, 10);
        res.json({ success: true, data: lista });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/clientes/:id — um cliente (com tabela de preços)
router.get('/:id', (req, res) => {
    try {
        const db = lerClientes();
        const c = db.clientes.find(x => x.id === parseInt(req.params.id));
        if (!c) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        res.json({ success: true, data: c });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

function normalizarPrecos(precos) {
    const out = { categorias: {}, produtos: {} };
    if (precos && typeof precos === 'object') {
        Object.entries(precos.categorias || {}).forEach(([k, v]) => {
            const n = parseFloat(v);
            if (k.trim() && n > 0) out.categorias[k.trim().toUpperCase()] = n;
        });
        Object.entries(precos.produtos || {}).forEach(([k, v]) => {
            const n = parseFloat(v);
            if (k.trim() && n > 0) out.produtos[k.trim().toUpperCase()] = n;
        });
    }
    return out;
}

// POST /api/clientes/item — cria cliente
router.post('/item', (req, res) => {
    try {
        const nome = (req.body.nome || '').trim();
        if (!nome) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });

        const db = lerClientes();
        if (db.clientes.find(c => (c.nome || '').toLowerCase() === nome.toLowerCase())) {
            return res.status(400).json({ success: false, error: `Cliente "${nome}" já existe` });
        }

        const novo = {
            id: db.proximo_id || 1,
            nome,
            tipo: ['escritorio', 'empresa', 'evento'].includes(req.body.tipo) ? req.body.tipo : 'escritorio',
            contato: (req.body.contato || '').trim(),
            cidade: (req.body.cidade || '').trim(),
            observacoes: (req.body.observacoes || '').trim(),
            cor: /^#[0-9a-fA-F]{6}$/.test(req.body.cor || '') ? req.body.cor : null,
            precos: normalizarPrecos(req.body.precos),
            data_cadastro: new Date().toISOString().split('T')[0],
        };
        db.clientes.push(novo);
        db.proximo_id = (db.proximo_id || 1) + 1;
        writeJSONAtomic(CLIENTES_FILE, db);
        res.json({ success: true, data: novo });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/clientes/item/:id — atualiza cliente
router.put('/item/:id', (req, res) => {
    try {
        const db = lerClientes();
        const c = db.clientes.find(x => x.id === parseInt(req.params.id));
        if (!c) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });

        if (req.body.nome !== undefined) {
            const nome = req.body.nome.trim();
            if (!nome) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
            if (db.clientes.find(x => x.id !== c.id && (x.nome || '').toLowerCase() === nome.toLowerCase())) {
                return res.status(400).json({ success: false, error: `Cliente "${nome}" já existe` });
            }
            c.nome = nome;
        }
        if (req.body.tipo !== undefined && ['escritorio', 'empresa', 'evento'].includes(req.body.tipo)) c.tipo = req.body.tipo;
        if (req.body.contato !== undefined) c.contato = req.body.contato.trim();
        if (req.body.cidade !== undefined) c.cidade = req.body.cidade.trim();
        if (req.body.observacoes !== undefined) c.observacoes = req.body.observacoes.trim();
        if (req.body.cor !== undefined) c.cor = /^#[0-9a-fA-F]{6}$/.test(req.body.cor || '') ? req.body.cor : null;
        if (req.body.precos !== undefined) c.precos = normalizarPrecos(req.body.precos);

        writeJSONAtomic(CLIENTES_FILE, db);
        res.json({ success: true, data: c });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/clientes/item/:id — remove cliente (pedidos antigos mantêm o nome)
router.delete('/item/:id', (req, res) => {
    try {
        const db = lerClientes();
        const idx = db.clientes.findIndex(x => x.id === parseInt(req.params.id));
        if (idx === -1) return res.status(404).json({ success: false, error: 'Cliente não encontrado' });
        db.clientes.splice(idx, 1);
        writeJSONAtomic(CLIENTES_FILE, db);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
