const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const ORDENS_DIR = path.join(DATA_DIR, 'ordens');
const PEDIDOS_DIR = path.join(DATA_DIR, 'pedidos');
const PEDIDOS_ARQUIVO_DIR = path.join(PEDIDOS_DIR, 'arquivo');
const CONTAGENS_DIR = path.join(DATA_DIR, 'contagens');

const DEFAULTS = {
    'equipamentos.json': {
        proximo_id: 1,
        equipamentos: []
    },
    'config-equipamentos.json': {
        responsaveis_entrega: [],
        responsaveis_equipamento: [],
        locais_frequentes: [],
        eventos_recentes: [],
        proximo_numero: 1
    },
    'produtos.json': {
        proximo_id: 1, produtos: []
    },
    'config-pedidos.json': {
        proximo_numero: 1
    },
};

function initData() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});
    if (!fs.existsSync(ORDENS_DIR)) fs.mkdirSync(ORDENS_DIR, {recursive: true});

    for (const dir of [PEDIDOS_DIR, PEDIDOS_ARQUIVO_DIR, CONTAGENS_DIR]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    }

    // Só cria os JSONs base se não existirem (volume novo/vazio)
    for (const [filename, defaultData] of Object.entries(DEFAULTS)) {
        const filepath = path.join(DATA_DIR, filename);
        if (!fs.existsSync(filepath)) {
            fs.writeFileSync(filepath, JSON.stringify(defaultData, null, 2));
            console.log(`[initData] Criado: ${filename}`);
        }
    }
}

module.exports = {initData};