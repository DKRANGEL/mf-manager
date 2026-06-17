const fs = require('fs');
const path = require('path');

// Leitura segura: retorna fallback se o arquivo não existir ou estiver corrompido
function readJSON(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

// Escrita atômica: grava num .tmp e renomeia por cima (rename é atômico no mesmo disco).
// Evita arquivo truncado se o processo cair no meio da escrita.
function writeJSONAtomic(filePath, data) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, filePath);
}

// Lista os arquivos .json de uma pasta; vazio se não existir
function listJSON(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(f => f.endsWith('.json'));
}

module.exports = {readJSON, writeJSONAtomic, listJSON};