const fs = require('fs');
const path = require('path');

const MULT_FILE = path.join(__dirname, '..', '..', 'multiplicadores.json');

function carregarMultiplicadores() {
    try {
        return JSON.parse(fs.readFileSync(MULT_FILE, 'utf8').replace(/^\uFEFF/, ''));
    } catch (e) {
        console.error('[Multiplicador] Erro ao ler multiplicadores.json:', e.message);
        return {classes: {}, overrides: {}};
    }
}

function obterFator(codigo) {
    if (!codigo) return 1;
    const mult = carregarMultiplicadores();

    if (mult.overrides && mult.overrides[codigo] !== undefined) {
        return mult.overrides[codigo] || 1;
    }

    const prefixos = Object.keys(mult.classes || {}).sort((a, b) => b.length - a.length);
    for (const prefixo of prefixos) {
        if (codigo.toUpperCase().startsWith(prefixo.toUpperCase())) {
            return mult.classes[prefixo].por_caixa || 1;
        }
    }

    return 1;
}

module.exports = {obterFator, carregarMultiplicadores};