const fs = require('fs');
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
        const {cliente, secoes, blocos, observacoes} = req.body;

        // Valida que tem pelo menos uma seção com itens
        const todasSecoes = secoes || [];
        const totalItens = todasSecoes.reduce((s, sec) => s + (sec.itens || []).length, 0);
        if (totalItens === 0) {
            return res.status(400).json({success: false, error: 'Pedido precisa de pelo menos um item'});
        }

        // Calcula preco_total por item em cada seção
        const secoesComTotal = todasSecoes.map(sec => ({
            titulo: sec.titulo || '',
            itens: (sec.itens || []).map(item => ({
                ...item,
                preco_total: (item.qtd_entrada || 0) * (item.preco_unit || 0)
            }))
        }));

        const numero = proximoNumero();
        const pedido = {
            numero,
            tipo: 'pedido',
            status: 'rascunho',
            data_emissao: new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            blocos: blocos || {
                cliente: {nome: cliente || '', campos: []},
                nf: {ativo: false, percent: 18},
                desconto: {ativo: false, label: 'DESCONTO', valor: 0},
                parcelas: {ativo: false, lista: []},
                observacoes: observacoes || ''
            },
            secoes: secoesComTotal,
            movimentos: []
        };

        writeJSONAtomic(pedidoPath(numero), pedido);
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/pedidos — lista com dados reais
router.get('/', (req, res) => {
    try {
        const dir = path.join(__dirname, '..', 'data', 'pedidos');
        if (!fs.existsSync(dir)) return res.json({success: true, data: [], total: 0});

        const arquivos = fs.readdirSync(dir)
            .filter(f => f.endsWith('.json') && f.startsWith('PED-'))
            .sort()
            .reverse(); // mais recentes primeiro

        const data = arquivos.map(f => {
            try {
                const pedido = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
                const blocos = pedido.blocos || {};
                const cliente = blocos.cliente?.nome || '';
                const secoes = pedido.secoes || [];
                const itens = secoes.flatMap(s => s.itens || []);
                const subtotal = itens.reduce((s, i) => s + (i.preco_total || (i.qtd_entrada * i.preco_unit) || 0), 0);

                return {
                    numero: pedido.numero,
                    status: pedido.status || 'rascunho',
                    data_emissao: pedido.data_emissao,
                    data_atualizacao: pedido.data_atualizacao,
                    cliente,
                    total_itens: itens.length,
                    total_valor: subtotal
                };
            } catch {
                return null;
            }
        }).filter(Boolean);

        res.json({success: true, data, total: data.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/pedidos/:numero — obtém um pedido
router.get('/:numero', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});

        // Normaliza pedidos antigos (lista plana → secoes)
        if (!pedido.secoes && pedido.itens) {
            pedido.secoes = [{titulo: '', itens: pedido.itens}];
            pedido.blocos = pedido.blocos || {
                cliente: {nome: pedido.cliente || '', campos: []},
                nf: {ativo: false, percent: 18},
                desconto: {ativo: false, label: 'DESCONTO', valor: 0},
                parcelas: {ativo: false, lista: []},
                observacoes: pedido.observacoes || ''
            };
        }

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
                error: `Pedido com status "${pedido.status}" não pode ser editado`
            });
        }

        const {secoes, blocos} = req.body;

        if (secoes !== undefined) {
            pedido.secoes = secoes.map(sec => ({
                titulo: sec.titulo || '',
                itens: (sec.itens || []).map(item => ({
                    ...item,
                    preco_total: (item.qtd_entrada || 0) * (item.preco_unit || 0)
                }))
            }));
        }

        if (blocos !== undefined) pedido.blocos = blocos;
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