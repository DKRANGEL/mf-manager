// src/utils/catalogoCache.js
// Catálogo para o bot FastZap — 100% local (produtos.json + saldo real).
// O saldo usa a mesma lógica do /api/estoque/atual: baseline da última
// contagem + movimentos posteriores.

const fs = require('fs');
const path = require('path');
const { readJSON } = require('./storage');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE  = path.join(DATA_DIR, 'produtos.json');
const CONTAGENS_DIR  = path.join(DATA_DIR, 'contagens');
const MOVIMENTOS_DIR = path.join(DATA_DIR, 'movimentos');

function ultimaContagem() {
    if (!fs.existsSync(CONTAGENS_DIR)) return null;
    const arquivos = fs.readdirSync(CONTAGENS_DIR)
        .filter(f => f.endsWith('.json')).sort().reverse();
    if (!arquivos.length) return null;
    return readJSON(path.join(CONTAGENS_DIR, arquivos[0]), null);
}

function todosMovimentos() {
    if (!fs.existsSync(MOVIMENTOS_DIR)) return [];
    const todos = [];
    for (const arq of fs.readdirSync(MOVIMENTOS_DIR).filter(f => f.endsWith('.json'))) {
        const log = readJSON(path.join(MOVIMENTOS_DIR, arq), { movimentos: [] });
        todos.push(...(log.movimentos || []));
    }
    return todos;
}

async function getCatalogoBot() {
    const db = readJSON(PRODUTOS_FILE, { produtos: [] });
    const contagem = ultimaContagem();

    // Saldos por código
    const saldos = new Map();
    if (contagem) {
        for (const item of (contagem.itens || [])) {
            saldos.set(item.codigo, item.total_un || 0);
        }
        const baselineDate = new Date(contagem.data_criacao || contagem.data);
        for (const mov of todosMovimentos()) {
            if (new Date(mov.data) <= baselineDate) continue;
            const atual = saldos.get(mov.codigo) ?? 0;
            saldos.set(mov.codigo, mov.tipo === 'saida'
                ? atual - (mov.qtd_un || 0)
                : atual + (mov.qtd_un || 0));
        }
    }

    return db.produtos.map(p => {
        const quantidade = saldos.get(p.codigo) ?? 0;
        return {
            codigo:     p.codigo,
            nome:       p.nome,
            categoria:  p.categoria || 'Sem categoria',
            disponivel: quantidade > 0,
            quantidade,
            unidade:    p.unidade || 'UN',
        };
    });
}

module.exports = { getCatalogoBot };
