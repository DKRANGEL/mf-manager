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
            // Nasce "staged": só vira base do estoque quando o usuário aplicar.
            aplicada: false,
            data_aplicacao: null,
            itens: itens || []
        };

        writeJSONAtomic(path.join(CONTAGENS_DIR, `${numero}.json`), contagem);
        res.json({success: true, data: contagem});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/contagens/:numero/aplicar — torna a contagem a base oficial do estoque
// (aplicada:true). O corte continua sendo a data_criacao da contagem, então tudo
// que saiu ANTES dela fica congelado e nunca mais é descontado.
router.put('/:numero/aplicar', (req, res) => {
    try {
        garantirDir();
        const arq = path.join(CONTAGENS_DIR, `${req.params.numero}.json`);
        if (!fs.existsSync(arq)) return res.status(404).json({success: false, error: 'Contagem não encontrada'});
        const contagem = readJSON(arq, null);
        if (!contagem) return res.status(404).json({success: false, error: 'Contagem não encontrada'});

        const ativar = req.body.aplicar !== false; // default true; permite "desaplicar"
        contagem.aplicada = ativar;
        contagem.data_aplicacao = ativar ? new Date().toISOString() : null;
        writeJSONAtomic(arq, contagem);
        res.json({success: true, data: {numero: contagem.numero, aplicada: contagem.aplicada}});
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

// DELETE /api/contagens/:numero — exclui uma contagem
router.delete('/:numero', (req, res) => {
    try {
        garantirDir();
        const arq = path.join(CONTAGENS_DIR, `${req.params.numero}.json`);
        if (!fs.existsSync(arq)) return res.status(404).json({success: false, error: 'Contagem não encontrada'});
        fs.unlinkSync(arq);
        res.json({success: true});
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
                data_criacao: c.data_criacao,
                // Legado (sem o campo) conta como aplicada, pra não quebrar o estoque atual
                aplicada: c.aplicada !== false,
                data_aplicacao: c.data_aplicacao || null,
                total_itens: (c.itens || []).length
            } : null;
        }).filter(Boolean);
        res.json({success: true, data});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;