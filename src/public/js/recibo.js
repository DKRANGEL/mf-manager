// ══════════════════════════════════════════════════════════════
// RECIBO DE PAGAMENTO — gerador de HTML/PDF no estilo "Claude Design"
// gerarReciboMFHTML(dados) — usado por emitir.html.
// Reaproveita esc() e _mfFmt() de documento.js (carregado antes).
// Layout desenhado em 760px de largura (mesma base do documento),
// para casar com compartilharDocumentoPDF() e a escala do preview.
// ══════════════════════════════════════════════════════════════

// Node (geração de PDF no servidor): importa esc/_mfFmt do renderer de documento
if (typeof module !== 'undefined' && module.exports) {
    var _docUtils = require('./documento.js');
    var esc = _docUtils.esc;
    var _mfFmt = _docUtils._mfFmt;
}

// Valor por extenso (reais e centavos) — pt-BR, até centenas de milhão
function _rcPorExtensoInt(n) {
    if (n === 0) return 'zero';
    const u = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const especiais = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dez = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const cen = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const tres = (num) => {
        if (num === 0) return '';
        if (num === 100) return 'cem';
        let s = '';
        const c = Math.floor(num / 100), r = num % 100;
        if (c > 0) s += cen[c];
        if (r > 0) {
            if (s) s += ' e ';
            if (r < 10) s += u[r];
            else if (r < 20) s += especiais[r - 10];
            else { s += dez[Math.floor(r / 10)]; if (r % 10 > 0) s += ' e ' + u[r % 10]; }
        }
        return s;
    };
    const milhoes = Math.floor(n / 1000000);
    const milhares = Math.floor((n % 1000000) / 1000);
    const centena = n % 1000;
    const partes = [];
    if (milhoes > 0) partes.push(tres(milhoes) + (milhoes === 1 ? ' milhão' : ' milhões'));
    if (milhares > 0) partes.push(milhares === 1 ? 'mil' : tres(milhares) + ' mil');
    if (centena > 0) partes.push(tres(centena));
    let res = '';
    partes.forEach((p, i) => {
        if (i > 0) res += (i === partes.length - 1 && centena > 0 && (centena < 100 || centena % 100 === 0)) ? ' e ' : ', ';
        res += p;
    });
    return res;
}

function valorPorExtenso(valor) {
    const total = Math.round((parseFloat(valor) || 0) * 100);
    const reais = Math.floor(total / 100), centavos = total % 100;
    let s = '';
    if (reais > 0) s += _rcPorExtensoInt(reais) + (reais === 1 ? ' real' : ' reais');
    if (centavos > 0) { if (s) s += ' e '; s += _rcPorExtensoInt(centavos) + (centavos === 1 ? ' centavo' : ' centavos'); }
    return s || 'zero real';
}

function _rcDataExtenso(iso) {
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const [y, m, d] = (iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return `${d} de ${meses[m - 1]} de ${y}`;
}

const _RC_CSS = `
.mf-recibo{--ink:#0c0c0e;--gray:#7a7a80;--body:#4a4a52;--hair:#e6e6ea;--blue:#2e8fe6;--purple:#b65cc0;--red:#ff2e2e;--sans:'Space Grotesk',-apple-system,Helvetica,Arial,sans-serif;--mono:'Space Mono',ui-monospace,monospace;font-family:var(--sans);color:var(--ink);-webkit-font-smoothing:antialiased;}
.mf-recibo *{box-sizing:border-box;margin:0;}
.mf-recibo strong{font-weight:500;}
.mf-recibo .receipt-sheet{width:760px;min-height:1075px;padding:58px 54px;background:#fff;display:flex;flex-direction:column;}
.mf-recibo .rc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:43px;}
.mf-recibo .rc-issuer{display:flex;flex-direction:column;gap:11px;}
.mf-recibo .rc-lockup{display:flex;align-items:center;gap:9px;}
.mf-recibo .rc-lockup__word{font-weight:500;letter-spacing:.2em;font-size:19px;}
.mf-recibo .rc-lockup__box{background:var(--ink);color:#fff;font-family:var(--mono);font-weight:700;font-size:12px;letter-spacing:.14em;padding:6px 9px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.mf-recibo .rc-issuer__meta{font-family:var(--mono);font-size:9px;color:var(--gray);line-height:1.7;letter-spacing:.04em;}
.mf-recibo .rc-number{text-align:right;display:flex;flex-direction:column;gap:7px;}
.mf-recibo .rc-number__label{font-family:var(--mono);font-size:10px;letter-spacing:.22em;color:var(--gray);}
.mf-recibo .rc-number__value{font-family:var(--mono);font-size:18px;font-weight:700;}
.mf-recibo .rc-rule{height:3px;margin:29px 0 36px;background:linear-gradient(90deg,var(--blue),var(--purple),var(--red));-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.mf-recibo .rc-amount{display:flex;flex-direction:column;gap:7px;}
.mf-recibo .rc-kicker{font-family:var(--mono);font-size:10px;letter-spacing:.28em;color:var(--gray);}
.mf-recibo .rc-amount__value{font-size:43px;font-weight:500;letter-spacing:-.02em;line-height:1;}
.mf-recibo .rc-amount__words{font-size:14px;color:var(--gray);}
.mf-recibo .rc-grid{margin-top:40px;display:grid;grid-template-columns:1fr 1fr;gap:25px 36px;}
.mf-recibo .rc-field{display:flex;flex-direction:column;gap:5px;}
.mf-recibo .rc-field__label{font-family:var(--mono);font-size:9.6px;letter-spacing:.2em;color:var(--gray);}
.mf-recibo .rc-field__value{font-size:15px;font-weight:500;}
.mf-recibo .rc-field__note{font-family:var(--mono);font-size:11px;color:var(--gray);}
.mf-recibo .rc-field__note--ink{color:var(--ink);}
.mf-recibo .rc-field__id{font-family:var(--mono);font-size:11px;word-break:break-all;line-height:1.6;}
.mf-recibo .rc-subject{margin-top:40px;padding:25px 0;border-top:1px solid var(--hair);border-bottom:1px solid var(--hair);display:flex;flex-direction:column;gap:11px;}
.mf-recibo .rc-subject__text{font-size:16px;line-height:1.5;}
.mf-recibo .rc-statement{margin-top:29px;font-size:13px;line-height:1.65;color:var(--body);}
.mf-recibo .rc-statement strong{color:var(--ink);}
.mf-recibo .rc-foot{margin-top:auto;padding-top:80px;display:flex;justify-content:space-between;align-items:flex-end;gap:43px;}
.mf-recibo .rc-sign{display:flex;flex-direction:column;gap:7px;min-width:300px;}
.mf-recibo .rc-sign__name{border-top:1px solid var(--ink);padding-top:9px;font-size:13px;font-weight:500;}
.mf-recibo .rc-sign__doc{font-family:var(--mono);font-size:9.6px;letter-spacing:.06em;color:var(--gray);}
.mf-recibo .rc-place{text-align:right;font-family:var(--mono);font-size:9.6px;letter-spacing:.14em;color:var(--gray);line-height:1.8;}
`;

function gerarReciboMFHTML(r) {
    r = r || {};
    const emitNome = r.emitente_nome || 'MAGIC EFFECTS BRASIL IMPORTAÇÕES';
    const emitCnpj = r.emitente_cnpj || '22.748.770/0001-50';
    const emitPix = r.emitente_pix || '22748770000150';
    const valorNum = parseFloat(r.valor) || 0;
    const valorStr = 'R$ ' + _mfFmt(valorNum);
    const extenso = r.valor_extenso || valorPorExtenso(valorNum);
    const dataFmt = _rcDataExtenso(r.data);
    const dataCurta = r.data ? r.data.split('-').reverse().join('/') : '';
    const pagador = r.recebemos_de || '';
    const forma = r.forma_pagamento || '';
    const referente = r.referente_a || '';
    const cidade = r.cidade || 'BRASÍLIA/DF';

    const notaPagador = r.pagador_cnpj ? `<span class="rc-field__note rc-field__note--ink">${esc(r.pagador_cnpj)}</span>` : '';
    const notaHora = r.hora ? `<span class="rc-field__note">${esc(r.hora)}</span>` : '';
    const notaAut = r.autenticacao ? `<span class="rc-field__note">${esc(r.autenticacao)}</span>` : '';
    const fieldTransacao = r.transacao_id
        ? `<div class="rc-field"><span class="rc-field__label">ID DA TRANSAÇÃO</span><span class="rc-field__id">${esc(r.transacao_id)}</span></div>` : '';
    const subjectHTML = referente
        ? `<section class="rc-subject"><span class="rc-field__label">REFERENTE A</span><p class="rc-subject__text">${esc(referente)}</p></section>` : '';
    const declaracao = `Declaramos, para os devidos fins, que recebemos de <strong>${esc(pagador)}</strong> a importância de <strong>${esc(valorStr)}${extenso ? ' (' + esc(extenso) + ')' : ''}</strong>, dando plena, geral e irrevogável quitação do valor referente ao serviço acima descrito.`;

    return `<div class="mf-recibo"><style>${_RC_CSS}</style>
        <article class="receipt-sheet">
            <header class="rc-head">
                <div class="rc-issuer">
                    <div class="rc-lockup"><span class="rc-lockup__word">MAGIC</span><span class="rc-lockup__box">EFFECTS</span></div>
                    <div class="rc-issuer__meta">${esc(emitNome)}<br>CNPJ ${esc(emitCnpj)}<br>CHAVE PIX ${esc(emitPix)}</div>
                </div>
                <div class="rc-number"><span class="rc-number__label">RECIBO Nº</span><span class="rc-number__value">${esc(r.numero || '')}</span></div>
            </header>
            <div class="rc-rule" aria-hidden="true"></div>
            <section class="rc-amount">
                <span class="rc-kicker">RECIBO DE PAGAMENTO</span>
                <span class="rc-amount__value">${esc(valorStr)}</span>
                <span class="rc-amount__words">${esc(extenso)}</span>
            </section>
            <section class="rc-grid">
                <div class="rc-field"><span class="rc-field__label">RECEBEMOS DE</span><span class="rc-field__value">${esc(pagador)}</span>${notaPagador}</div>
                <div class="rc-field"><span class="rc-field__label">DATA DO PAGAMENTO</span><span class="rc-field__value">${esc(dataFmt)}</span>${notaHora}</div>
                <div class="rc-field"><span class="rc-field__label">FORMA DE PAGAMENTO</span><span class="rc-field__value">${esc(forma)}</span>${notaAut}</div>
                ${fieldTransacao}
            </section>
            ${subjectHTML}
            <p class="rc-statement">${declaracao}</p>
            <footer class="rc-foot">
                <div class="rc-sign"><span class="rc-sign__name">${esc(r.assinatura || 'Magic Effects Brasil Importações')}</span><span class="rc-sign__doc">CNPJ ${esc(emitCnpj)}</span></div>
                <div class="rc-place">${esc(cidade)}<br>${esc(dataCurta)}</div>
            </footer>
        </article>
    </div>`;
}

// Node (geração de PDF no servidor)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gerarReciboMFHTML, valorPorExtenso };
}
