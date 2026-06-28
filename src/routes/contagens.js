const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {readJSON, writeJSONAtomic, listJSON} = require('../utils/storage');

const CONTAGENS_DIR = path.join(__dirname, '..', 'data', 'contagens');

function garantirDir() {
    if (!fs.existsSync(CONTAGENS_DIR)) fs.mkdirSync(CONTAGENS_DIR, {recursive: true});
}

function proximoNumero() {
    garantirDir();
    const arquivos = fs.readdirSync(CONTAGENS_DIR).filter(f => f.endsWith('.json'));
    return `CONT-${new Date().getFullYear()}-${String(arquivos.length + 1).padStart(3, '0')}`;
}

// POST /api/contagens — salva nova contagem
router.post('/', (req, res) => {
    try {
        garantirDir();
        const {data, responsavel, observacoes, itens} = req.body;
        if (!data) return res.status(400).json({success: false, error: 'Data obrigatória'});

        const numero = proximoNumero();
        const contagem = {
            numero,
            data,
            responsavel: responsavel || '',
            observacoes: observacoes || '',
            data_criacao: new Date().toISOString(),
            itens: itens || []
        };

        writeJSONAtomic(path.join(CONTAGENS_DIR, `${numero}.json`), contagem);
        res.json({success: true, data: contagem});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/contagens/ultima — retorna a contagem mais recente
router.get('/ultima', (req, res) => {
    try {
        garantirDir();
        const arquivos = fs.readdirSync(CONTAGENS_DIR)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse();

        if (!arquivos.length) return res.json({success: true, data: null});

        const ultima = readJSON(path.join(CONTAGENS_DIR, arquivos[0]), null);
        res.json({success: true, data: ultima});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/contagens — lista todas
router.get('/', (req, res) => {
    try {
        garantirDir();
        const arquivos = fs.readdirSync(CONTAGENS_DIR)
            .filter(f => f.endsWith('.json'))
            .sort().reverse();
        const data = arquivos.map(f => {
            const c = readJSON(path.join(CONTAGENS_DIR, f), null);
            return c ? {
                numero: c.numero,
                data: c.data,
                responsavel: c.responsavel,
                total_itens: (c.itens || []).length
            } : null;
        }).filter(Boolean);
        res.json({success: true, data});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;