const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const {readJSON, writeJSONAtomic, listJSON} = require('../utils/storage');

const CONTAGENS_DIR = path.join(__dirname, '..', 'data', 'contagens');
const PEDIDOS_DIR = path.join(__dirname, '..', 'data', 'pedidos');
const PRODUTOS_FILE = path.join(__dirname, '..', 'data', 'produtos.json');

function garantirDir() {
    if (!fs.existsSync(CONTAGENS_DIR)) fs.mkdirSync(CONTAGENS_DIR, {recursive: true});
}

// Quantidade em UNIDADES de um item de pedido.
// Ordem: qtd_un explícito > cx_100*100 > cx_master*fator > qtd (respeitando a unidade).
// IMPORTANTE: o fator SÓ multiplica quando a linha está em caixa (Cx). Quando a
// unidade é "UN/Unidades" a qtd já está em unidades — multiplicar pelo fator
// (ex.: single shot fator 100) inflava a conta em 100x.
function itemQtdUn(item) {
    if (item.qtd_un) return item.qtd_un;
    if (item.cx_100) return item.cx_100 * 100;
    if (item.cx_master) return item.cx_master * (item.fator || 1);
    const u = String(item.unidade || '').trim().toUpperCase();
    const qtd = Number(item.qtd) || 0;
    return u.startsWith('UN') ? qtd : qtd * (item.fator || 1);
}

// Dia (YYYY-MM-DD) de uma data que pode vir como "2026-07-13" ou ISO completo
function diaDe(valor) {
    return (valor || '').slice(0, 10);
}

// ── Grupos de interesse da comparação ──
// A reconciliação só olha estes 3 grupos; o resto do catálogo é ignorado.
// Micromine: tudo com prefixo MFSSS- MAIS o genérico INS-001 (usado no pedido
// quando o efeito exato não é informado — soma no total do grupo).
const GRUPO_NOMES = {
    micromine: 'Micromine',
    single12:  'Singleshot 1.2',
    single12a: 'Singleshot 1.2 Antigo',
};
const GRUPOS_ORDEM = ['micromine', 'single12', 'single12a'];

// Classifica por PREFIXO do código (critério principal, estável) com fallback pelo
// nome da categoria (como aparece na produção). INS-001 é o micro mine genérico
// usado no pedido quando o efeito exato não é informado.
function grupoDe(codigo, categoria) {
    const cod = String(codigo || '').toUpperCase();
    const cat = String(categoria || '').toUpperCase();
    if (cod.startsWith('MFSSS') || cod === 'INS-001' || cat === 'MICRO MINE') return 'micromine';
    if (cod.startsWith('MFSS1.2') || cat === 'SINGLE SHOT 1.2') return 'single12';
    if (cod.startsWith('KSRC') || cat === 'SINGLE SHOT 1.2 ANTIGO') return 'single12a';
    return null;
}

// Lê todos os pedidos (pasta principal + arquivo/), inclusive os arquivados.
function lerTodosPedidos() {
    const pedidos = [];
    const dirs = [PEDIDOS_DIR, path.join(PEDIDOS_DIR, 'arquivo')];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) continue;
        for (const f of fs.readdirSync(dir)) {
            if (!f.endsWith('.json') || !f.startsWith('PED-')) continue;
            const p = readJSON(path.join(dir, f), null);
            if (p && p.numero) pedidos.push(p);
        }
    }
    return pedidos;
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

// GET /api/contagens/comparar?de=CONT-...&ate=CONT-... — reconciliação entre duas contagens
//
// Como o fluxo de baixa/status de pedido não é usado na prática, o que "saiu" do
// estoque no intervalo só pode ser inferido por: (a) a diferença física entre as
// duas contagens e (b) os pedidos emitidos (data_emissao) nessa janela.
//
// Retorna: metadados das duas contagens, lista de pedidos no período, o resumo de
// itens somados desses pedidos e a reconciliação item a item (diferença física vs
// pedidos → divergência).
router.get('/comparar', (req, res) => {
    try {
        garantirDir();
        const { de, ate } = req.query;
        if (!de || !ate) return res.status(400).json({ success: false, error: 'Informe as duas contagens (de, ate)' });
        if (de === ate) return res.status(400).json({ success: false, error: 'Escolha duas contagens diferentes' });

        const cA = readJSON(path.join(CONTAGENS_DIR, `${de}.json`), null);
        const cB = readJSON(path.join(CONTAGENS_DIR, `${ate}.json`), null);
        if (!cA || !cB) return res.status(404).json({ success: false, error: 'Contagem não encontrada' });

        // Ordena: antiga primeiro (pela data física; desempate pela data_criacao)
        const chave = (c) => (c.data || '') + 'T' + (c.data_criacao || '');
        let [antiga, nova] = chave(cA) <= chave(cB) ? [cA, cB] : [cB, cA];

        const diaIni = diaDe(antiga.data);
        const diaFim = diaDe(nova.data);

        // Catálogo: fator/nome/categoria por código
        const prodDb = readJSON(PRODUTOS_FILE, { produtos: [] });
        const catalogo = new Map();
        for (const p of (prodDb.produtos || [])) catalogo.set(p.codigo, p);

        // ── Pedidos no intervalo (inclusivo nas duas pontas) ──
        const pedidosPeriodo = lerTodosPedidos()
            .filter(p => {
                const d = diaDe(p.data_emissao);
                return d && d >= diaIni && d <= diaFim;
            })
            .sort((a, b) => diaDe(a.data_emissao).localeCompare(diaDe(b.data_emissao)));

        // Categoria de um código (item do pedido pode não trazê-la — resolve pelo catálogo)
        const categoriaDe = (codigo, item) => item?.categoria || catalogo.get(codigo)?.categoria || '';

        // Agrega itens dos pedidos por código — SÓ os que caem em um dos 3 grupos.
        const porPedido = {};   // codigo → { qtd_un, pedidos:Set, grupo }
        const listaPedidos = [];
        for (const p of pedidosPeriodo) {
            const itens = (p.secoes || []).flatMap(s => s.itens || []);
            let itensNoGrupo = 0;
            for (const item of itens) {
                if (!item.codigo) continue;
                const grupo = grupoDe(item.codigo, categoriaDe(item.codigo, item));
                if (!grupo) continue; // fora dos 3 grupos → ignora
                itensNoGrupo++;
                const qtd = itemQtdUn(item) || 0;
                if (!porPedido[item.codigo]) porPedido[item.codigo] = { qtd_un: 0, pedidos: new Set(), grupo };
                porPedido[item.codigo].qtd_un += qtd;
                porPedido[item.codigo].pedidos.add(p.numero);
            }
            // Só lista pedidos que tocaram algum dos grupos
            if (itensNoGrupo === 0) continue;
            listaPedidos.push({
                numero: p.numero,
                cliente: p.nome || p.cabecalho?.cliente || p.cliente || '',
                tipo: p.tipo || '',
                status: p.status || 'rascunho',
                data_emissao: diaDe(p.data_emissao),
                total_itens: itensNoGrupo,
            });
        }

        // Mapa das contagens por código — só itens dos 3 grupos
        const unAntiga = new Map();
        const unNova = new Map();
        for (const i of (antiga.itens || [])) if (grupoDe(i.codigo, i.categoria)) unAntiga.set(i.codigo, { total_un: i.total_un || 0, nome: i.nome, categoria: i.categoria, fator: i.fator });
        for (const i of (nova.itens || [])) if (grupoDe(i.codigo, i.categoria)) unNova.set(i.codigo, { total_un: i.total_un || 0, nome: i.nome, categoria: i.categoria, fator: i.fator });

        // União de todos os códigos envolvidos (só grupos)
        const codigos = new Set([...unAntiga.keys(), ...unNova.keys(), ...Object.keys(porPedido)]);

        // Buckets por grupo (o nível onde a comparação realmente faz sentido)
        const buckets = {};
        const ensureG = (gid) => (buckets[gid] = buckets[gid] || {
            id: gid, nome: GRUPO_NOMES[gid],
            un_antiga: 0, un_nova: 0, qtd_pedidos: 0, n_itens_contados: 0,
        });

        const itens = [];
        for (const codigo of codigos) {
            const info = catalogo.get(codigo) || {};
            const refA = unAntiga.get(codigo);
            const refB = unNova.get(codigo);
            const categoria = info.categoria || refB?.categoria || refA?.categoria || '';
            const grupo = grupoDe(codigo, categoria);
            if (!grupo) continue;
            const nome = info.nome || refB?.nome || refA?.nome || codigo;
            const fator = info.fator || refB?.fator || refA?.fator || 1;

            const un_antiga = refA ? refA.total_un : null;
            const un_nova = refB ? refB.total_un : null;
            const temAmbas = refA != null && refB != null;
            const diferenca_fisica = temAmbas ? (refA.total_un - refB.total_un) : null;
            const qtd_pedidos = porPedido[codigo]?.qtd_un || 0;
            const n_pedidos = porPedido[codigo]?.pedidos.size || 0;
            const divergencia = temAmbas ? (diferenca_fisica - qtd_pedidos) : null;

            // Acumula no grupo (totais somam tudo, mesmo item só-contagem ou só-pedido)
            const b = ensureG(grupo);
            b.un_antiga += (un_antiga || 0);
            b.un_nova   += (un_nova   || 0);
            b.qtd_pedidos += qtd_pedidos;
            if (refA || refB) b.n_itens_contados++;

            // Linha de detalhe só se teve algum movimento
            if ((diferenca_fisica || 0) === 0 && qtd_pedidos === 0) continue;

            itens.push({
                codigo, nome, categoria, fator, grupo,
                un_antiga, un_nova,
                diferenca_fisica,
                qtd_pedidos,
                n_pedidos,
                divergencia,
                cx_pedidos: fator > 1 ? +(qtd_pedidos / fator).toFixed(2) : null,
            });
        }

        // Fecha os totais por grupo
        const grupos = GRUPOS_ORDEM.map(gid => {
            const b = buckets[gid] || { id: gid, nome: GRUPO_NOMES[gid], un_antiga: 0, un_nova: 0, qtd_pedidos: 0, n_itens_contados: 0 };
            const diferenca_fisica = b.un_antiga - b.un_nova;
            return {
                ...b,
                diferenca_fisica,
                divergencia: diferenca_fisica - b.qtd_pedidos,
            };
        });

        // Ordena detalhe por grupo (na ordem fixa) e dentro, maior divergência absoluta
        const ordemGrupo = { micromine: 0, single12: 1, single12a: 2 };
        itens.sort((a, b) => {
            if (ordemGrupo[a.grupo] !== ordemGrupo[b.grupo]) return ordemGrupo[a.grupo] - ordemGrupo[b.grupo];
            const da = Math.abs(a.divergencia ?? 0), db2 = Math.abs(b.divergencia ?? 0);
            if (db2 !== da) return db2 - da;
            return (a.codigo || '').localeCompare(b.codigo || '');
        });

        const totalUnPedidos = Object.values(porPedido).reduce((s, v) => s + v.qtd_un, 0);

        res.json({
            success: true,
            de: { numero: antiga.numero, data: antiga.data, responsavel: antiga.responsavel, aplicada: antiga.aplicada !== false },
            ate: { numero: nova.numero, data: nova.data, responsavel: nova.responsavel, aplicada: nova.aplicada !== false },
            periodo: { inicio: diaIni, fim: diaFim },
            resumo: {
                total_pedidos: listaPedidos.length,
                total_itens_distintos: Object.keys(porPedido).length,
                total_un_pedidos: totalUnPedidos,
            },
            grupos,
            pedidos: listaPedidos,
            itens,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/contagens/:numero — obtém uma contagem completa (para editar)
router.get('/:numero', (req, res) => {
    try {
        garantirDir();
        const arq = path.join(CONTAGENS_DIR, `${req.params.numero}.json`);
        if (!fs.existsSync(arq)) return res.status(404).json({success: false, error: 'Contagem não encontrada'});
        const c = readJSON(arq, null);
        if (!c) return res.status(404).json({success: false, error: 'Contagem não encontrada'});
        res.json({success: true, data: c});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/contagens/:numero — atualiza uma contagem (edição)
// Mantém numero, data_criacao e o estado aplicada/data_aplicacao.
router.put('/:numero', (req, res) => {
    try {
        garantirDir();
        const arq = path.join(CONTAGENS_DIR, `${req.params.numero}.json`);
        if (!fs.existsSync(arq)) return res.status(404).json({success: false, error: 'Contagem não encontrada'});
        const c = readJSON(arq, null);
        if (!c) return res.status(404).json({success: false, error: 'Contagem não encontrada'});

        const {data, responsavel, observacoes, itens} = req.body;
        if (data !== undefined) c.data = data;
        if (responsavel !== undefined) c.responsavel = responsavel || '';
        if (observacoes !== undefined) c.observacoes = observacoes || '';
        if (itens !== undefined) c.itens = itens || [];
        c.data_edicao = new Date().toISOString();

        writeJSONAtomic(arq, c);
        res.json({success: true, data: c});
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