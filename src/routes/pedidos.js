const fs = require('fs');
const express = require('express');
const path = require('path');
const {readJSON, writeJSONAtomic, listJSON} = require('../utils/storage');
const {parsearTexto} = require('../utils/parserPedido');
const {validarItens} = require('../utils/validadorCatalogo');
const {normalizarTipo} = require('../utils/migracaoTipos');

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

// ---- Ocultação de valores (usuários sem permissão ver_valores) ----
// A remoção acontece AQUI no servidor: o JSON nunca sai com preço.

function podeVerValores(req) {
    return req.permissoes?.pedidos?.ver_valores !== false;
}

function ocultarValoresPedido(original) {
    const pedido = JSON.parse(JSON.stringify(original));
    pedido.valores_ocultos = true;
    pedido.total_valor = null;

    const limparItem = (item) => {
        delete item.v_unit;
        delete item.total;
        delete item.total_kit;
        delete item.preco_unit;
        delete item.preco_total;
    };

    (pedido.secoes || []).forEach(sec => {
        delete sec.preco_padrao;
        sec.preco_padrao_ativo = false;
        delete sec.preco_rotulo;
        (sec.itens || []).forEach(limparItem);
    });
    // Schema antigo: lista plana no topo (referência quebrada pelo clone)
    if (pedido.itens) pedido.itens.forEach(limparItem);

    // Resumo carrega dinheiro (pagamentos, parcelas, NF, desconto) — some.
    // Mantém observações, "incluso" e a CONTAGEM de kits (kit é quantidade,
    // não valor), para o operador saber quantos kits o pedido tem.
    const res = pedido.resumo || {};
    pedido.resumo = {
        obs: !!res.obs, obs_texto: res.obs_texto || '',
        incluso: !!res.incluso, incluso_texto: res.incluso_texto || '',
        kits: !!res.kits,
        kits_itens: (res.kits_itens || []).map(k => ({ secao_titulo: k.secao_titulo || '', qtd: k.qtd || 0 })),
        kits_qtd: res.kits_qtd || 0,
    };
    delete pedido.blocos; // schema antigo também carrega nf/desconto/parcelas

    return pedido;
}

// Total de kits do pedido (só contagem — visível para todos)
function contarKits(pedido) {
    const r = pedido.resumo || {};
    if (r.kits_itens?.length) return r.kits_itens.reduce((s, k) => s + (k.qtd || 0), 0);
    return r.kits_qtd || 0;
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
        const {cliente, tipo, cabecalho, secoes, resumo, total_valor, total_itens, data_emissao} = req.body;

        const todasSecoes = secoes || [];
        const nItens = total_itens ?? todasSecoes.reduce((s, sec) => s + (sec.itens || []).length, 0);
        if (nItens === 0) {
            return res.status(400).json({success: false, error: 'Pedido precisa de pelo menos um item'});
        }

        const numero = proximoNumero();
        const pedido = {
            numero,
            nome: req.body.nome || '',
            tipo: normalizarTipo(tipo),
            status: 'rascunho',
            data_emissao: data_emissao || new Date().toISOString(),
            data_atualizacao: new Date().toISOString(),
            cliente_id: req.body.cliente_id || null,
            cliente: cabecalho?.cliente || cliente || '',
            cabecalho: cabecalho || {cliente: cliente || '', data: new Date().toISOString().split('T')[0]},
            secoes: todasSecoes,
            resumo: resumo || {},
            ordem_blocos: Array.isArray(req.body.ordem_blocos) ? req.body.ordem_blocos : [],
            total_valor: total_valor || 0,
            total_itens: nItens,
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
                // suporta novo schema (cabecalho.cliente) e antigo (blocos.cliente.nome)
                const clienteRaw = pedido.cabecalho?.cliente || pedido.blocos?.cliente?.nome || pedido.cliente || '';
                const cliente = pedido.nome || clienteRaw;
                const secoes = pedido.secoes || [];
                const itens = secoes.flatMap(s => s.itens || []);
                const subtotal = pedido.total_valor ||
                    itens.reduce((s, i) => s + (i.total || i.preco_total || (i.qtd_entrada * i.preco_unit) || 0), 0);

                return {
                    numero: pedido.numero,
                    tipo: normalizarTipo(pedido.tipo),
                    status: pedido.status || 'rascunho',
                    cliente_id: pedido.cliente_id || null,
                    data_emissao: pedido.data_emissao,
                    data_atualizacao: pedido.data_atualizacao,
                    cliente,
                    cliente_avulso: !!pedido.cliente_avulso,
                    total_itens: pedido.total_itens || itens.length,
                    total_kits: contarKits(pedido),
                    total_valor: podeVerValores(req) ? subtotal : null
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

        pedido.tipo = normalizarTipo(pedido.tipo);

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

        const data = podeVerValores(req) ? pedido : ocultarValoresPedido(pedido);
        res.json({success: true, data});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/pedidos/:numero/cliente — move o pedido para a pasta de um cliente
// (só organização — permitido em qualquer status)
router.put('/:numero/cliente', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});
        const cid = req.body.cliente_id || null;
        pedido.cliente_id = cid;
        // Escolha manual é autoritária: "Avulso" explícito ignora o match por nome
        pedido.cliente_avulso = cid ? false : true;
        writeJSONAtomic(pedidoPath(req.params.numero), pedido);
        res.json({success: true, cliente_id: pedido.cliente_id, cliente_avulso: pedido.cliente_avulso});
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

        const {tipo, cabecalho, secoes, resumo, total_valor, total_itens, data_emissao, blocos, cliente} = req.body;

        if (req.body.nome !== undefined) pedido.nome = req.body.nome || '';
        if (req.body.cliente_id !== undefined) pedido.cliente_id = req.body.cliente_id || null;
        if (tipo !== undefined) pedido.tipo = normalizarTipo(tipo);
        if (cabecalho !== undefined) { pedido.cabecalho = cabecalho; pedido.cliente = cabecalho.cliente || pedido.cliente; }
        if (cliente !== undefined && !cabecalho) pedido.cliente = cliente;
        if (secoes !== undefined) pedido.secoes = secoes;
        if (resumo !== undefined) pedido.resumo = resumo;
        if (req.body.ordem_blocos !== undefined) pedido.ordem_blocos = Array.isArray(req.body.ordem_blocos) ? req.body.ordem_blocos : [];
        if (total_valor !== undefined) pedido.total_valor = total_valor;
        if (total_itens !== undefined) pedido.total_itens = total_itens;
        if (data_emissao !== undefined) pedido.data_emissao = data_emissao;
        if (blocos !== undefined) pedido.blocos = blocos;
        pedido.data_atualizacao = new Date().toISOString();

        writeJSONAtomic(pedidoPath(req.params.numero), pedido);
        res.json({success: true, data: pedido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/pedidos/:numero/baixa — ativa ou reverte baixa de estoque
router.put('/:numero/baixa', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});

        const {ativar} = req.body; // true = baixar, false = reverter
        const jaEmitido = pedido.status === 'emitido';

        if (ativar && jaEmitido) return res.status(400).json({success: false, error: 'Pedido já foi baixado'});
        if (!ativar && pedido.status !== 'emitido') return res.status(400).json({
            success: false,
            error: 'Pedido não está emitido'
        });

        // Monta os movimentos de saída/entrada — itera TODAS as seções
        const itensTodos = (pedido.secoes || []).flatMap(sec => sec.itens || []);
        const movimentos = itensTodos
            .filter(item => item.codigo && !item.sem_valor)
            .map(item => {
                // Calcula qtd em unidades: qtd_un explícito > cx_100*100 > qtd*fator
                const qtdUn = item.qtd_un
                    || (item.cx_100 ? item.cx_100 * 100 : null)
                    || ((item.qtd || 1) * (item.fator || 1));
                return {
                    codigo: item.codigo,
                    descricao: item.descricao || item.nome || '',
                    qtd_un: qtdUn,
                    tipo: ativar ? 'saida' : 'entrada',
                    origem: 'pedido',
                    numero_pedido: pedido.numero,
                    data: new Date().toISOString()
                };
            });

        // Grava log de movimentos
        const LOG_DIR = path.join(__dirname, '..', 'data', 'movimentos');
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, {recursive: true});
        const logFile = path.join(LOG_DIR, `${pedido.numero}.json`);
        const logExistente = fs.existsSync(logFile) ? JSON.parse(fs.readFileSync(logFile, 'utf8')) : {movimentos: []};
        logExistente.movimentos.push(...movimentos);
        fs.writeFileSync(logFile, JSON.stringify(logExistente, null, 2));

        // Atualiza status do pedido
        pedido.status = ativar ? 'emitido' : 'rascunho';
        pedido.data_baixa = ativar ? new Date().toISOString() : null;
        pedido.data_atualizacao = new Date().toISOString();
        writeJSONAtomic(pedidoPath(req.params.numero), pedido);

        res.json({success: true, data: {status: pedido.status, movimentos}});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/pedidos/:numero/concluir — marca pagamento como concluído (ou reabre)
router.put('/:numero/concluir', (req, res) => {
    try {
        const pedido = readJSON(pedidoPath(req.params.numero), null);
        if (!pedido) return res.status(404).json({success: false, error: 'Pedido não encontrado'});

        const {ativar} = req.body;
        const statusAtual = pedido.status;

        if (ativar && statusAtual !== 'emitido') {
            return res.status(400).json({success: false, error: 'Só pedidos com baixa feita podem ser concluídos'});
        }
        if (!ativar && statusAtual !== 'concluido') {
            return res.status(400).json({success: false, error: 'Pedido não está concluído'});
        }

        pedido.status = ativar ? 'concluido' : 'emitido';
        pedido.data_conclusao = ativar ? new Date().toISOString() : null;
        pedido.data_atualizacao = new Date().toISOString();
        writeJSONAtomic(pedidoPath(req.params.numero), pedido);

        res.json({success: true, data: {status: pedido.status}});
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