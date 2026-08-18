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
    // Flags mínimas e comprovadas — já lançaram com sucesso na VPS.
    // (--no-zygote e afins causam travas/falha de launch em container; fora)
    _lancando = puppeteer.launch({
        executablePath,
        headless: true,
        protocolTimeout: 60000,
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
        try {
            // Remove @import de fontes externas — o PDF NÃO pode depender de rede
            // (senão o Chrome fica esperando fonts.googleapis.com e trava/timeout)
            _docCss = fs.readFileSync(CSS_DOC, 'utf8').replace(/@import\s+url\([^)]*\)\s*;/g, '');
        } catch { _docCss = ''; }
    }
    return _docCss;
}

function montarPagina(corpoHTML, tipo) {
    const recibo = tipo === 'recibo';
    // ZERO rede: sem <link>/@import de fontes. Usa as fontes do sistema
    // (as próprias CSS já têm fallback sans-serif/monospace).
    const estilo = recibo
        ? `@page { size: A4; margin: 0; }
           html,body { margin:0; padding:0; background:#fff; }
           .doc-wrap { display:flex; justify-content:center; }`
        : `html,body { margin:0; padding:0; background:#fff; }
           body { -webkit-print-color-adjust:exact; print-color-adjust:exact; --mono:'JetBrains Mono',monospace; }
           ${documentoCss()}`;
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<style>${estilo}</style></head><body><div class="doc-wrap">${corpoHTML}</div></body></html>`;
}

// Gera o PDF a partir do corpo HTML já renderizado. tipo: 'pedido' | 'recibo'
async function gerarPDFDeHTML(corpoHTML, { tipo = 'pedido' } = {}) {
    const t0 = Date.now();
    const html = montarPagina(inlineImagens(corpoHTML), tipo);
    const tBrowser = Date.now();
    const browser = await getBrowser();
    const page = await browser.newPage();
    console.log(`[pdf] browser pronto em ${Date.now() - tBrowser}ms (${tipo})`);
    try {
        // 'load' (não 'networkidle0'): sem rede externa, dispara em ms.
        await page.setContent(html, { waitUntil: 'load', timeout: 20000 });
        await page.emulateMediaType('print');
        // fontes do sistema já estão prontas; corrida com timeout por segurança
        try {
            await Promise.race([
                page.evaluate(() => document.fonts && document.fonts.ready),
                new Promise(r => setTimeout(r, 2000)),
            ]);
        } catch {}
        const margin = tipo === 'recibo'
            ? { top: 0, right: 0, bottom: 0, left: 0 }
            : { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' };
        // page.pdf() retorna Uint8Array no puppeteer v23 — Express só envia Buffer
        const buf = Buffer.from(await page.pdf({ format: 'A4', printBackground: true, margin }));
        console.log(`[pdf] ${tipo} gerado em ${Date.now() - t0}ms (${buf.length} bytes)`);
        return buf;
    } finally {
        await page.close().catch(() => {});
    }
}

function pdfDisponivel() {
    return !!puppeteer && !!acharChrome();
}

// Pré-aquece o Chromium no boot para o primeiro PDF não pagar o cold start
function warmup() {
    if (!pdfDisponivel()) return;
    getBrowser().catch(err => console.warn('[pdf] warmup falhou:', err.message));
}

module.exports = { gerarPDFDeHTML, inlineImagens, pdfDisponivel, warmup };
