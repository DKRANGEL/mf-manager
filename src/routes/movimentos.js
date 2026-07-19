// ===================== ROTAS: MOVIMENTOS (COLETOR) =====================
// POST /api/movimentos — registra batch de movimentos do coletor
// Os arquivos gerados ficam em data/movimentos/ e são lidos pelo /api/estoque/atual

const express = require('express');
const path = require('path');
const fs = require('fs');
const { writeJSONAtomic } = require('../utils/storage');

const router = express.Router();
const MOVIMENTOS_DIR = path.join(__dirname, '..', 'data', 'movimentos');

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
        const novos = movimentos.map(m => ({
            codigo:      m.codigo,
            descricao:   m.descricao || '',
            qtd_un:      m.qtd_un,
            tipo:        m.tipo,      // 'saida' ou 'entrada'
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
