const path = require('path');
const {readJSON} = require('./storage');
const {obterFator} = require('./multiplicador');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');
const CACHE_FILE = path.join(DATA_DIR, 'catalogo-cache.json');

function carregarCatalogo() {
    const nosso = readJSON(PRODUTOS_FILE, {produtos: []});
    const cache = readJSON(CACHE_FILE, {produtos: []});
    // Nosso store tem prioridade; merge pelo código
    const mapa = new Map();
    for (const p of (cache.produtos || [])) {
        if (p.codigo) mapa.set(p.codigo.toUpperCase(), p);
    }
    for (const p of (nosso.produtos || [])) {
        if (p.codigo) mapa.set(p.codigo.toUpperCase(), p);
    }
    return mapa;
}

// Busca exata → verde; substring no código/nome → amarelo; nada → vermelho
function validarItem(item, catalogo) {
    const codigo = (item.codigo || '').trim();
    const codigoUpper = codigo.toUpperCase();

    // Erro de parse — já é vermelho
    if (item.erro_parse) {
        return {
            ...item,
            status: 'vermelho',
            motivo: item.erro_parse,
            descricao: '',
            candidatos: []
        };
    }

    // Match exato
    const exato = catalogo.get(codigoUpper);
    if (exato) {
        return montarResultado(item, exato, 'verde', null);
    }

    // Fuzzy: substring no código ou no nome
    const candidatos = [];
    for (const [key, prod] of catalogo) {
        const nomeUpper = (prod.nome || '').toUpperCase();
        if (key.includes(codigoUpper) || codigoUpper.includes(key) ||
            nomeUpper.includes(codigoUpper)) {
            candidatos.push({codigo: prod.codigo, nome: prod.nome});
            if (candidatos.length >= 5) break;
        }
    }

    if (candidatos.length === 1) {
        // Um só candidato — resolve como verde
        const prod = catalogo.get(candidatos[0].codigo.toUpperCase());
        return montarResultado(item, prod, 'verde', null);
    }

    if (candidatos.length > 1) {
        return {
            ...item,
            status: 'amarelo',
            motivo: `${candidatos.length} candidatos encontrados`,
            descricao: '',
            candidatos
        };
    }

    // Nada
    return {
        ...item,
        status: 'vermelho',
        motivo: 'Código não encontrado no catálogo',
        descricao: '',
        candidatos: []
    };
}

function montarResultado(item, produto, status, motivo) {
    const fator = item.unidade_entrada === 'CX'
        ? obterFator(produto.codigo)
        : 1;
    const qtd_un = item.qtd_entrada * fator;

    return {
        codigo: produto.codigo,
        descricao: produto.nome || '',
        qtd_entrada: item.qtd_entrada,
        unidade_entrada: item.unidade_entrada,
        fator,
        qtd_un,
        preco_unit: item.preco_unit || 0,
        status,
        motivo,
        candidatos: [],
        linha_original: item.linha_original
    };
}

function validarItens(itensParsed) {
    const catalogo = carregarCatalogo();
    const resultados = itensParsed.map(item => validarItem(item, catalogo));
    const resumo = {
        verdes: resultados.filter(r => r.status === 'verde').length,
        amarelos: resultados.filter(r => r.status === 'amarelo').length,
        vermelhos: resultados.filter(r => r.status === 'vermelho').length
    };
    return {itens: resultados, resumo};
}

module.exports = {validarItens};