// ===================== MIGRAÇÃO DE TIPOS DE DOCUMENTO =====================
// Consolida os tipos antigos em apenas dois:
//   - PEDIDO DE VENDA        (recebe "Orçamento de Pedido" e demais legados)
//   - PRESTAÇÃO DE SERVIÇO   (recebe "Rider Artístico")
// Roda no boot (server.js) reescrevendo os arquivos uma única vez.

const fs = require('fs');
const path = require('path');
const { writeJSONAtomic } = require('./storage');

const VALIDOS = ['PEDIDO DE VENDA', 'PRESTAÇÃO DE SERVIÇO'];

const MAPA = {
    'RIDER ARTÍSTICO': 'PRESTAÇÃO DE SERVIÇO',
    'ORÇAMENTO DE PEDIDO': 'PEDIDO DE VENDA',
    'ORÇAMENTO DE SERVIÇO': 'PEDIDO DE VENDA',
    'ORÇAMENTO DE EQUIPAMENTOS': 'PEDIDO DE VENDA',
    'ORÇAMENTO DE COMPRA DE MATERIAIS': 'PEDIDO DE VENDA',
    'ORÇAMENTO': 'PEDIDO DE VENDA',
};

// Normaliza um tipo qualquer para um dos dois válidos
function normalizarTipo(tipo) {
    const t = (tipo || '').trim();
    if (VALIDOS.includes(t)) return t;
    return MAPA[t] || 'PEDIDO DE VENDA';
}

// Migra os tipos de cliente: escritorio permanece; produtora/outro/legado → empresa.
// (evento é atribuído manualmente pelo usuário)
function migrarTiposClientes() {
    const fp = path.join(__dirname, '..', 'data', 'clientes.json');
    if (!fs.existsSync(fp)) return;
    try {
        const db = JSON.parse(fs.readFileSync(fp, 'utf8'));
        let mudou = 0;
        (db.clientes || []).forEach(c => {
            if (!['escritorio', 'empresa', 'evento'].includes(c.tipo)) {
                c.tipo = 'empresa';
                mudou++;
            }
        });
        if (mudou > 0) { writeJSONAtomic(fp, db); console.log(`[migracaoTipos] ${mudou} cliente(s) migrado(s) para empresa`); }
    } catch { /* ignora */ }
}

// Reescreve os arquivos de pedido cujo tipo mudou
function migrarTiposPedidos() {
    const dir = path.join(__dirname, '..', 'data', 'pedidos');
    if (!fs.existsSync(dir)) return;

    let migrados = 0;
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.json') || !f.startsWith('PED-')) continue;
        const fp = path.join(dir, f);
        try {
            const pedido = JSON.parse(fs.readFileSync(fp, 'utf8'));
            const novo = normalizarTipo(pedido.tipo);
            if (novo !== pedido.tipo) {
                pedido.tipo = novo;
                writeJSONAtomic(fp, pedido);
                migrados++;
            }
        } catch { /* arquivo corrompido — ignora */ }
    }
    if (migrados > 0) console.log(`[migracaoTipos] ${migrados} pedido(s) migrado(s) para 2 tipos`);
}

module.exports = { normalizarTipo, migrarTiposPedidos, migrarTiposClientes, VALIDOS };
