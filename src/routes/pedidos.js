const express = require('express');
const path = require('path');
const {readJSON, writeJSONAtomic, listJSON} = require('../utils/storage');
const {parsearTexto} = require('../utils/parserPedido');
const {validarItens} = require('../utils/validadorCatalogo');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PEDIDOS_DIR = path.join(DATA_DIR, 'pedidos');
const CONFIG_FILE = path.join(DATA_DIR, 'config-pedidos.json');

// ---- Helpers ----

function lerConfig() {
    return readJSON(CONFIG_FILE, {proximo_numero: 1});
}

function proximoNumero() {
    const config = lerConfig();
    const num = config.proximo_numero || 1;
    const ano = new Date().getFullYear();
    const numero = `PED-${ano}-${String(num).padStart(3, '0')}`;
    config.proximo_numero = num + 1;
    writeJSONAtomic(CONFIG_FILE, config);
    return numero;
}

function pedidoPath(numero) {
    return path.join(PEDIDOS_DIR, `${numero}.json`);
}

// ===================== PARSE =====================

// POST /api/pedidos/parse — texto → rascunho com 3 baldes
router.post('/parse', (req, res) => {
    try {
        const {texto} = req.body;
        if (!texto || typeof texto !== 'string') {
            return res.status(400).json({success: false, error: 'Campo "texto" é obrigatório'});
        }

        const itensParsed = parsearTexto(texto);
        if (itensParsed.length === 0) {
            return res.status(400).json({success: false, error: 'Nenhum item encontrado no texto'});
        }

        const resultado = validarItens(itensParsed);
        res.json({success: true, data: resultado});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== CRUD =====================

// POST /api/pedidos — salva rascunho
router.post('/', (req, res) => {
    try {
        const {cliente, itens, observacoes} = req.body;
        if (!itens || !Array.isArray(itens) || itens.length === 0) {
            return res.status(400).json({success: false, error: 'Pedido precisa de pelo menos um item'});
        }

        const numero = proximoNumero();
        const pedido = {
            numero,
            cliente: (cliente || '').trim(),
            tipo: 'pedido',
            status: 'rascunho',
            data_emissao: new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            itens,
            movimentos: [],
            observacoes: (observacoes || '').trim()
        };

        writeJSONAtomic(pedidoPath(numero), pedido);
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/pedidos — lista (com filtro opcional de/até)
router.get('/', (req, res) => {
    try {
        const {de, ate} = req.query;
        const arquivos = listJSON(PEDIDOS_DIR);
        let pedidos = arquivos.map(f => readJSON(path.join(PEDIDOS_DIR, f), null)).filter(Boolean);

        // Filtro por período
        if (de) pedidos = pedidos.filter(p => p.data_emissao >= de);
        if (ate) pedidos = pedidos.filter(p => p.data_emissao <= ate + 'T23:59:59.999Z');

        // Ordena do mais recente pro mais antigo
        pedidos.sort((a, b) => (b.data_emissao || '').localeCompare(a.data_emissao || ''));

        // Retorna resumo (sem itens/movimentos, pra não pesar)
        const lista = pedidos.map(p => ({
            numero: p.numero,
            cliente: p.cliente,
            status: p.status,
            data_emissao: p.data_emissao,
            total_itens: (p.itens || []).length,
            total_valor: (p.itens || []).reduce((s, i) => s + (i.qtd_un || 0) * (i.preco_unit || 0), 0)
        }));

        res.json({success: true, data: lista, total: lista.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/pedidos/:numero — obtém um pedido
router.get('/:numero', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/pedidos/:numero — edita (só rascunho)
router.put('/:numero', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});
        if (pedido.status !== 'rascunho') {
            return res.status(400).json({
                success: false,
                error: `Pedido com status "${pedido.status}" não pode ser editado — reverta primeiro`
            });
        }

        const {cliente, itens, observacoes} = req.body;
        if (cliente !== undefined) pedido.cliente = cliente.trim();
        if (itens !== undefined) pedido.itens = itens;
        if (observacoes !== undefined) pedido.observacoes = observacoes.trim();
        pedido.data_atualizacao = new Date().toISOString();

        writeJSONAtomic(pedidoPath(req.params.numero), pedido);
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/pedidos/:numero — exclui (só rascunho)
router.delete('/:numero', (req, res) => {
    try {
        const fs = require('fs');
        const filePath = pedidoPath(req.params.numero);
        const pedido = readJSON(filePath, null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});
        if (pedido.status !== 'rascunho') {
            return res.status(400).json({
                success: false,
                error: `Pedido com status "${pedido.status}" não pode ser excluído — reverta e depois exclua`
            });
        }

        fs.unlinkSync(filePath);
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;