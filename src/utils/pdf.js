// ══════════════════════════════════════════════════════════════
// GERAÇÃO DE PDF NO SERVIDOR — Chrome headless (puppeteer-core)
// Renderiza o MESMO HTML do preview (gerarPedidoMFHTML / gerarReciboMFHTML)
// no motor de impressão do Chrome → PDF vetorial, nítido, com quebras
// de página nativas (respeita o @media print do documento.css).
// Imagens são embutidas como data URI (lidas do disco) para não depender
// de rede nem de autenticação.
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

let puppeteer = null;
try { puppeteer = require('puppeteer-core'); } catch { /* opcional — há fallback no cliente */ }

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PRODUTOS_DIR = path.join(__dirname, '..', 'data', 'produtos');
const CSS_DOC = path.join(PUBLIC_DIR, 'css', 'documento.css');

// Caminho do Chromium: env (Docker) → caminhos comuns
function acharChrome() {
    if (process.env.PUPPETEER_EXECUTABLE_PATH) return process.env.PUPPETEER_EXECUTABLE_PATH;
    const candidatos = [
        '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ];
    return candidatos.find(p => { try { return fs.existsSync(p); } catch { return false; } }) || null;
}

let _browser = null;
let _lancando = null;
async function getBrowser() {
    if (!puppeteer) throw new Error('puppeteer-core não está instalado');
    if (_browser && _browser.connected !== false && _browser.isConnected?.()) return _browser;
    if (_lancando) return _lancando;
    const executablePath = acharChrome();
    if (!executablePath) throw new Error('Chromium não encontrado (defina PUPPETEER_EXECUTABLE_PATH)');
    _lancando = puppeteer.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    }).then(b => {
        _browser = b;
        _lancando = null;
        b.on('disconnected', () => { _browser = null; });
        return b;
    }).catch(err => { _lancando = null; throw err; });
    return _lancando;
}

const MIME = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

// Substitui src="/public/..." e src="/data/produtos/..." por data URI do disco
function inlineImagens(html) {
    return html.replace(/src="(\/(?:public|data\/produtos)\/[^"]+)"/g, (m, url) => {
        try {
            const rel = url.split('?')[0]; // remove ?v=
            let file;
            if (rel.startsWith('/public/')) file = path.join(PUBLIC_DIR, rel.slice('/public/'.length));
            else file = path.join(PRODUTOS_DIR, rel.slice('/data/produtos/'.length));
            file = path.normalize(file);
            // guarda contra path traversal
            if (!file.startsWith(PUBLIC_DIR) && !file.startsWith(PRODUTOS_DIR)) return m;
            if (!fs.existsSync(file)) return m;
            const mime = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
            const b64 = fs.readFileSync(file).toString('base64');
            return `src="data:${mime};base64,${b64}"`;
        } catch { return m; }
    });
}

let _docCss = null;
function documentoCss() {
    if (_docCss === null) {
        try { _docCss = fs.readFileSync(CSS_DOC, 'utf8'); } catch { _docCss = ''; }
    }
    return _docCss;
}

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@300;400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">`;

function montarPagina(corpoHTML, tipo) {
    const recibo = tipo === 'recibo';
    // Recibo é auto-suficiente (estilos inline) e desenhado em 760px → margem 0 e centralizado.
    // Pedido usa documento.css (que já traz @media print + @page A4 10mm).
    const estilo = recibo
        ? `@page { size: A4; margin: 0; }
           html,body { margin:0; padding:0; background:#fff; }
           .doc-wrap { display:flex; justify-content:center; }`
        : `html,body { margin:0; padding:0; background:#fff; }
           body { -webkit-print-color-adjust:exact; print-color-adjust:exact; --mono:'JetBrains Mono',monospace; }
           ${documentoCss()}`;
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">${FONTS}
<style>${estilo}</style></head><body><div class="doc-wrap">${corpoHTML}</div></body></html>`;
}

// Gera o PDF a partir do corpo HTML já renderizado. tipo: 'pedido' | 'recibo'
async function gerarPDFDeHTML(corpoHTML, { tipo = 'pedido' } = {}) {
    const html = montarPagina(inlineImagens(corpoHTML), tipo);
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
        try { await page.evaluate('document.fonts && document.fonts.ready'); } catch {}
        const margin = tipo === 'recibo'
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' };
        return await page.pdf({ format: 'A4', printBackground: true, margin });
    } finally {
        await page.close().catch(() => {});
    }
}

function pdfDisponivel() {
    return !!puppeteer && !!acharChrome();
}

module.exports = { gerarPDFDeHTML, inlineImagens, pdfDisponivel };
