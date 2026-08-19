// ===================== ROTAS: MOVIMENTOS (COLETOR) =====================
// POST /api/movimentos — registra batch de movimentos do coletor
// Os arquivos gerados ficam em data/movimentos/ e são lidos pelo /api/estoque/atual

const express = require('express');
const path = require('path');
const fs = require('fs');
const { writeJSONAtomic } = require('../utils/storage');

const router = express.Router();
const MOVIMENTOS_DIR = path.join(__dirname, '..', 'data', 'movimentos');

// GET /api/movimentos — lista movimentos com filtros combinados
// Query params: de, ate, pedido, produto, tipo
router.get('/', (req, res) => {
    try {
        if (!fs.existsSync(MOVIMENTOS_DIR)) return res.json({ success: true, data: [], total: 0 });

        const { de, ate, pedido, produto, tipo } = req.query;

        const arquivos = fs.readdirSync(MOVIMENTOS_DIR).filter(f => f.endsWith('.json'));
        let todos = [];

        for (const arq of arquivos) {
            try {
                const log = JSON.parse(fs.readFileSync(path.join(MOVIMENTOS_DIR, arq), 'utf8'));
                (log.movimentos || []).forEach(m => todos.push({ ...m, _arquivo: arq }));
            } catch {}
        }

        // Ordena por data desc
        todos.sort((a, b) => new Date(b.data) - new Date(a.data));

        // Aplica filtros
        if (de)      todos = todos.filter(m => m.data && m.data.slice(0,10) >= de);
        if (ate)     todos = todos.filter(m => m.data && m.data.slice(0,10) <= ate);
        if (pedido)  todos = todos.filter(m =>
            (m.numero_pedido || '').toLowerCase().includes(pedido.toLowerCase()) ||
            (m._arquivo || '').toLowerCase().includes(pedido.toLowerCase())
        );
        if (produto) todos = todos.filter(m =>
            (m.codigo || '').toLowerCase().includes(produto.toLowerCase()) ||
            (m.descricao || '').toLowerCase().includes(produto.toLowerCase())
        );
        if (tipo)    todos = todos.filter(m => m.tipo === tipo);

        // Totais
        const totalSaida   = todos.filter(m => m.tipo === 'saida').reduce((s, m) => s + (m.qtd_un || 0), 0);
        const totalEntrada = todos.filter(m => m.tipo === 'entrada').reduce((s, m) => s + (m.qtd_un || 0), 0);

        res.json({ success: true, data: todos, total: todos.length, totalSaida, totalEntrada });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', (req, res) => {
    try {
        const { movimentos, operador, modo } = req.body;
        if (!movimentos?.length) {
            return res.status(400).json({ success: false, error: 'Nenhum movimento informado' });
        }

        if (!fs.existsSync(MOVIMENTOS_DIR)) fs.mkdirSync(MOVIMENTOS_DIR, { recursive: true });

        const hoje = new Date().toISOString().split('T')[0];
        const arquivo = path.join(MOVIMENTOS_DIR, `COLETOR-${hoje}.json`);

        const existente = fs.existsSync(arquivo)
            ? JSON.parse(fs.readFileSync(arquivo, 'utf8'))
            : { movimentos: [] };

        const agora = new Date().toISOString();
        // O sistema só trabalha com SAÍDAS — entradas foram removidas.
        const novos = movimentos.map(m => ({
            codigo:      m.codigo,
            descricao:   m.descricao || '',
            qtd_un:      m.qtd_un,
            tipo:        'saida',
            origem:      'coletor',
            modo:        modo || 'manual',
            operador:    operador || 'Operador',
            data:        agora,
        }));

        existente.movimentos.push(...novos);
        writeJSONAtomic(arquivo, existente);

        res.json({ success: true, registrados: novos.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
