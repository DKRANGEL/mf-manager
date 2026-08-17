// ===================== DOCUMENTO — RENDERER DE PEDIDOS =====================
// gerarPedidoMFHTML(pedido) — usado por emitir.html e pedidos.html.
// Retrocompatível com schema antigo (blocos) e novo (cabecalho/resumo/secoes).

function formatDate(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    if (d.includes('/')) return d;
    if (d.includes('T')) d = d.split('T')[0];
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function esc(s) {
    if (s === null || s === undefined) return '';
    // Node (geração de PDF no servidor) não tem DOM — escapa via string
    if (typeof document === 'undefined') {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}

// ══════════════════════════════════════════════════════════════
// RENDERER NOVO — gerarPedidoMFHTML(pedido)
// Compatível com novo schema (cabecalho + secoes[] + resumo)
// e schema antigo (blocos + secoes[0].itens).
// Retorna HTML string pronta para injetar em qualquer container.
// ══════════════════════════════════════════════════════════════

function gerarPedidoMFHTML(pedido) {
    const cab   = pedido.cabecalho || { cliente: pedido.blocos?.cliente?.nome || pedido.cliente || '', data: pedido.data_emissao?.split('T')[0] || '' };
    const res   = pedido.resumo   || {};
    const tipo  = pedido.tipo     || 'PEDIDO DE VENDA';
    const dataFmt = cab.data ? cab.data.split('-').reverse().join('/') : formatDate(pedido.data_emissao);

    // Cabeçalho do cliente
    let camposHTML = `<tr>
        <td class="bg-gray-title" style="width:140px;">CLIENTE</td>
        <td class="data-cell highlight" colspan="3">${esc((cab.cliente || '').toUpperCase())}</td>
    </tr>`;
    const LABEL_MAP = { escritorio:'ESCRITÓRIO', cidade:'CIDADE', evento:'EVENTO', local:'LOCAL', condicao:'COND. PAGAMENTO', datas_shows:'DATAS DOS SHOWS' };
    Object.entries(cab.campos || {}).forEach(([k, ativo]) => {
        if (ativo && cab.valores?.[k]) {
            camposHTML += `<tr>
                <td class="bg-gray-title">${LABEL_MAP[k] || k.toUpperCase()}</td>
                <td class="data-cell" colspan="3">${esc((cab.valores[k] || '').toUpperCase())}</td>
            </tr>`;
        }
    });
    // Compatibilidade schema antigo (blocos)
    if (pedido.blocos?.cliente?.campos?.length) {
        const cli = pedido.blocos.cliente;
        const lblAnt = { artista:'ARTISTA / SHOW', cidade:'CIDADE', data_show:'DATA DO SHOW', cnpj:'CNPJ', semana:'SEMANA' };
        cli.campos.forEach(c => {
            if (cli[c]) camposHTML += `<tr>
                <td class="bg-gray-title">${lblAnt[c] || c.toUpperCase()}</td>
                <td class="data-cell" colspan="3">${esc((cli[c]||'').toUpperCase())}</td>
            </tr>`;
        });
    }

    const numDocHTML = cab.num_doc && cab.valores?.num_doc
        ? `<div style="font-size:12px;color:#666;margin-top:2px;">Nº: ${esc(cab.valores.num_doc)}</div>` : '';

    // Modo sem valores (romaneio): API removeu os preços e marcou a flag.
    // Renderiza só cliente + produtos com quantidades — sem colunas de valor,
    // sem subtotais, sem resumo, sem pagamentos, sem dados bancários.
    const semValores = !!pedido.valores_ocultos;

    // Kits vinculados por seção (para exibir a multiplicação junto ao subtotal)
    const kitsItens = (pedido.resumo?.kits && pedido.resumo?.kits_itens) ? pedido.resumo.kits_itens : [];

    // ── Cada seção vira um bloco reordenável, com chave estável (uid) ──
    const secBlocos = {};
    const nonSepKeys = [], sepKeys = [];
    const gruposVistos = new Set();
    (pedido.secoes || []).forEach(sec => {
        const key = 'sec:' + (sec.uid || sec.id || sec.titulo || nonSepKeys.length + sepKeys.length);
        let bloco = '';
        if (sec.grupo && !gruposVistos.has(sec.grupo)) {
            gruposVistos.add(sec.grupo);
            bloco += `<table style="width:100%;border-collapse:collapse;margin-top:20px;">
                <tr><td style="background:#c0392b;color:#fff;font-size:12px;font-weight:700;padding:8px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${esc(sec.grupo.toUpperCase())}</td></tr>
            </table>`;
        }
        const kit = kitsItens.find(k =>
            (k.secao_id && k.secao_id === sec.id) ||
            (k.secao_titulo && k.secao_titulo === (sec.titulo || ''))
        );
        bloco += _mfGerarSecaoHTML(sec, semValores ? null : kit, semValores);
        secBlocos[key] = bloco;
        (sec.total_separado ? sepKeys : nonSepKeys).push(key);
    });

    // ── Blocos do resumo ──
    const RB = _mfBlocosResumo(pedido);
    const blocos = semValores
        ? { ...secBlocos, pagamentos: '', resumo: '', nf_frete: '', condicao: '', banco: '',
            incluso: RB.incluso, obs: RB.obs, kits: _mfBlocoKitsRomaneio(pedido) }
        : { ...secBlocos, ...RB, kits: '' };

    // ── Ordem padrão (idêntica ao layout clássico) ──
    // Cabeçalho e DADOS DO CLIENTE ficam fixos no topo, fora da reordenação.
    const ordemPadrao = [
        ...nonSepKeys, 'pagamentos', 'resumo',
        ...sepKeys, 'kits', 'nf_frete', 'condicao', 'incluso', 'obs', 'banco'
    ];
    let ordem = (Array.isArray(pedido.ordem_blocos) && pedido.ordem_blocos.length)
        ? pedido.ordem_blocos.slice() : ordemPadrao.slice();
    // Qualquer bloco ausente da ordem salva (seção nova, bloco recém-ativado) entra no fim
    ordemPadrao.forEach(k => { if (!ordem.includes(k)) ordem.push(k); });

    const corpoHTML = ordem.map(k => blocos[k] || '').join('\n');

    return `<div class="recibo">
        <div class="recibo-header">
            <div class="recibo-logo-area">
                <img src="/public/MagicFireworksLogo.jpeg" class="recibo-logo" alt="Magic Fireworks">
                <div>
                    <div style="font-size:15px;font-weight:700;color:#000;">MAGIC FIREWORKS</div>
                    <div style="font-size:11px;color:#666;">CNPJ: 22.748.770/0001-50</div>
                    <div style="font-size:11px;color:#666;">contato@magicfireworks.com.br</div>
                </div>
            </div>
            <div class="recibo-tipo-area">
                <div style="font-size:14px;font-weight:700;color:#000;text-align:center;">${esc(tipo)}</div>
                ${numDocHTML}
                <div style="font-size:12px;color:#555;margin-top:4px;text-align:center;">DATA: ${dataFmt}</div>
            </div>
        </div>

        <table class="client-data-table" style="margin:16px 0 0;">
            <thead><tr><td colspan="4" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;">DADOS DO CLIENTE</td></tr></thead>
            <tbody>${camposHTML}</tbody>
        </table>

        ${corpoHTML}
    </div>`;
}

function _mfCalcSubtotal(sec) {
    return (sec.itens || []).reduce((s, item) => {
        // suporta novo schema (item.total) e antigo (item.preco_total / qtd_entrada * preco_unit)
        return s + (item.total || item.preco_total || (item.qtd_entrada || 0) * (item.preco_unit || 0) || 0);
    }, 0);
}

function _mfContarCols(cols) {
    if (!cols) return 4; // mínimo (ITEM + DESCRIÇÃO + QTD + TOTAL)
    let n = 2; // ITEM + TOTAL always
    if (cols.imagem) n++; if (cols.codigo) n++; if (cols.complemento) n++;
    if (cols.ncm) n++; if (cols.cx_master) n++; if (cols.cx_100) n++;
    if (cols.qtd_un) n++; if (cols.unidade) n++; if (cols.qtd) n++;
    if (cols.v_unit) n++; if (cols.total_kit) n++;
    return n + 1; // +1 for DESCRIÇÃO
}

function _mfGerarSecaoHTML(sec, kit, semValores) {
    const cols = sec.colunas;
    const totalSec = _mfCalcSubtotal(sec);
    // Sem valores: some V.UNIT, T.KIT e TOTAL da contagem de colunas
    let nCols = _mfContarCols(cols);
    if (semValores) {
        nCols -= 1; // TOTAL
        if (cols?.v_unit || !cols) nCols -= 1;
        if (cols?.total_kit) nCols -= 1;
    }
    const compact = nCols > 8;
    const p = compact ? '4px 5px' : '6px 10px';
    const fs = compact ? '9px' : '10px';

    let tituloSec = sec.titulo || '';
    if (!semValores && sec.preco_padrao_ativo && sec.preco_padrao) {
        tituloSec += ` — R$ ${_mfFmt(sec.preco_padrao)} / ${sec.preco_rotulo || 'UN'}`;
    }

    // TH
    const th = `padding:${p};text-align:left;font-size:${fs};font-weight:700;color:#fff;text-transform:uppercase;white-space:nowrap;`;
    const thR = th+'text-align:right;'; const thC = th+'text-align:center;';

    let ths = `<th style="${thC}width:24px;">Nº</th>`;
    if (cols?.imagem) ths += `<th style="${thC}width:62px;">IMG</th>`;
    if (cols?.codigo) ths += `<th style="${th}">CÓD</th>`;
    ths += `<th style="${th}">DESCRIÇÃO</th>`;
    if (cols?.complemento) ths += `<th style="${th}">COMPL.</th>`;
    if (cols?.ncm) ths += `<th style="${th}">NCM</th>`;
    if (cols?.cx_master) ths += `<th style="${thC}">CX<br>MAST.</th>`;
    if (cols?.cx_100) ths += `<th style="${thC}">CX<br>100</th>`;
    if (cols?.qtd_un) ths += `<th style="${thC}">QTD<br>UN</th>`;
    if (cols?.unidade) ths += `<th style="${thC}">UN</th>`;
    if (cols?.qtd || !cols) ths += `<th style="${thC}">QTD</th>`;
    if (!semValores) {
        if (cols?.v_unit || !cols) ths += `<th style="${thR}">V.UNIT</th>`;
        if (cols?.total_kit) ths += `<th style="${thR}">T.KIT</th>`;
        ths += `<th style="${thR}">TOTAL</th>`;
    }

    // Rows
    const fp = compact ? '5px 5px' : '8px 10px'; const ffs = compact ? '10px' : '11px';
    const td  = `padding:${fp};border-bottom:1px solid #eee;vertical-align:middle;font-size:${ffs};`;
    const tdR = td+'text-align:right;font-family:monospace;';
    const tdC = td+'text-align:center;';

    const rows = (sec.itens || []).map((item, i) => {
        const total = item.total || item.preco_total || (item.qtd_entrada||0)*(item.preco_unit||0) || 0;
        const qtd   = item.qtd ?? item.qtd_entrada ?? 1;
        const vUnit = item.v_unit ?? item.preco_unit ?? 0;
        const un    = item.unidade || item.unidade_entrada || 'UN';

        let tds = `<td style="${tdC}font-weight:700;">${i+1}</td>`;
        if (cols?.imagem) {
            tds += `<td style="${tdC}padding:4px 6px;">${item.imagem ? `<img src="/data/produtos/${esc(item.imagem)}?v=${item.imagem_v || 1}" style="width:56px;height:56px;object-fit:contain;border-radius:4px;" onerror="this.style.visibility='hidden'">` : ''}</td>`;
        }
        if (cols?.codigo) tds += `<td style="${td}font-family:monospace;font-weight:700;">${esc(item.codigo || '-')}</td>`;
        tds += `<td style="${td}">${esc(item.descricao || item.nome || '-')}</td>`;
        if (cols?.complemento) tds += `<td style="${td}color:#888;font-size:10px;">${esc(item.complemento || '')}</td>`;
        if (cols?.ncm) tds += `<td style="${td}font-family:monospace;">${esc(item.ncm || '')}</td>`;
        if (cols?.cx_master) tds += `<td style="${tdC}">${item.cx_master != null ? item.cx_master : '-'}</td>`;
        if (cols?.cx_100) tds += `<td style="${tdC}font-weight:700;">${item.cx_100 != null ? item.cx_100 : '-'}</td>`;
        if (cols?.qtd_un) tds += `<td style="${tdC}font-weight:700;">${item.qtd_un != null ? item.qtd_un.toLocaleString('pt-BR') : '-'}</td>`;
        if (cols?.unidade) tds += `<td style="${tdC}">${esc(un)}</td>`;
        if (cols?.qtd || !cols) tds += `<td style="${tdC}">${qtd}</td>`;
        if (!semValores) {
            if (cols?.v_unit || !cols) {
                tds += item.sem_valor
                    ? `<td style="${tdR}"><span style="color:#c0392b;font-size:10px;">${esc(item.sem_valor_msg || 'PAGO P/ EVENTO')}</span></td>`
                    : `<td style="${tdR}">R$ ${_mfFmt(vUnit)}</td>`;
            }
            if (cols?.total_kit) tds += `<td style="${tdR}">${item.total_kit != null ? 'R$ '+_mfFmt(item.total_kit) : '-'}</td>`;
            tds += `<td style="${tdR}font-weight:700;">${item.sem_valor ? '—' : 'R$ '+_mfFmt(total)}</td>`;
        }

        const bg = i % 2 === 0 ? 'background:#f5f5f5;' : '';
        return `<tr style="${bg}">${tds}</tr>`;
    }).join('');

    // Com kit vinculado: subtotal vira "valor por kit" + linha da multiplicação
    const temKit = !semValores && kit && kit.qtd > 0;
    const subtotalLabel = temKit ? 'SUBTOTAL (VALOR POR KIT)' : 'SUBTOTAL';

    let subtotalRow = semValores ? '' : `<tr style="background:#f5f5f5;">
        <td colspan="${nCols-1}" style="padding:8px 14px;font-size:11px;font-weight:700;color:#333;border-top:2px solid #ccc;text-transform:uppercase;">${subtotalLabel}</td>
        <td style="padding:8px 14px;text-align:right;font-weight:700;color:#000;font-size:12px;border-top:2px solid #ccc;font-family:monospace;">R$ ${_mfFmt(totalSec)}</td>
    </tr>`;

    if (temKit) {
        subtotalRow += `<tr style="background:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td colspan="${nCols-1}" style="padding:9px 14px;font-size:11px;font-weight:700;color:#fff;text-transform:uppercase;">
                TOTAL — ${kit.qtd} KIT${kit.qtd > 1 ? 'S' : ''} × R$ ${_mfFmt(totalSec)} / KIT
            </td>
            <td style="padding:9px 14px;text-align:right;font-weight:700;color:#fff;font-size:13px;font-family:monospace;">R$ ${_mfFmt(kit.qtd * totalSec)}</td>
        </tr>`;
    }

    // Banda de total próprio para seções com total separado (ex: TOTAL MÁQUINAS)
    const totalBand = (sec.total_separado && !semValores) ? `
    <table style="width:100%;border-collapse:collapse;margin-top:0;">
        <tr style="background:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
            <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#fff;">TOTAL ${esc((sec.titulo || 'SEÇÃO').toUpperCase())}</td>
            <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#fff;font-family:monospace;">R$ ${_mfFmt(totalSec)}</td>
        </tr>
    </table>` : '';

    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;table-layout:auto;word-break:break-word;">
        <thead>
            <tr><td colspan="${nCols}" style="background:#1a1a1a;color:#fff;font-size:12px;font-weight:700;padding:10px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${esc(tituloSec.toUpperCase())}</td></tr>
            <tr style="background:#2a2a2a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${ths}</tr>
        </thead>
        <tbody>${rows}${subtotalRow}</tbody>
    </table>${totalBand}`;
}

// Dados bancários (bloco reordenável)
function _mfBlocoBanco() {
    return `<div style="margin-top:14px;font-size:10px;color:#555;border-top:1px solid #eee;padding-top:10px;">
        <strong>DADOS BANCÁRIOS:</strong> C6 BANK (336) | CNPJ: 22.748.770/0001-50 | AG: 0001 | CC: 12665143-4 | PIX (CNPJ): 22.748.770/0001-50
    </div>`;
}

// Tabela de KITS do romaneio (só contagem — modo sem valores)
function _mfBlocoKitsRomaneio(pedido) {
    const r = pedido.resumo || {};
    let kitsArr = [];
    if (r.kits) {
        if (r.kits_itens?.length) kitsArr = r.kits_itens.filter(k => k.qtd > 0);
        else if (r.kits_qtd > 0) kitsArr = [{ qtd: r.kits_qtd, secao_titulo: '' }];
    }
    if (!kitsArr.length) return '';
    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead><tr><td colspan="2" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">KITS</td></tr></thead>
        <tbody>${kitsArr.map((k, i) => `<tr style="${i % 2 === 0 ? 'background:#f5f5f5;' : ''}">
            <td style="padding:9px 14px;font-size:12px;color:#333;">${k.secao_titulo ? esc(k.secao_titulo.toUpperCase()) : 'KITS'}</td>
            <td style="padding:9px 14px;text-align:right;font-size:14px;font-weight:700;color:#000;font-family:monospace;">${k.qtd} KIT${k.qtd > 1 ? 'S' : ''}</td>
        </tr>`).join('')}</tbody>
    </table>`;
}

// Compat: renderer antigo — retorna {principal, extras} montando os blocos na ordem clássica
function _mfGerarResumoHTML(pedido) {
    const b = _mfBlocosResumo(pedido);
    return { principal: b.pagamentos + b.resumo, extras: b.nf_frete + b.condicao + b.incluso + b.obs };
}

// Divide o resumo em blocos independentes (para permitir reordenar no documento)
function _mfBlocosResumo(pedido) {
    const res = pedido.resumo || {};
    // Seções com total separado (ex: Máquinas) ficam fora do resumo e do total
    const secoes = (pedido.secoes || []).filter(sec => !sec.total_separado);
    // Cálculo do total
    let total = secoes.reduce((s, sec) => s + _mfCalcSubtotal(sec), 0);
    if (res.desconto && res.desconto_valor > 0) total -= res.desconto_valor;
    if (res.pagamentos) (res.pagamentos_itens || []).forEach(p => { total -= (p.valor || 0); });

    // Compatibilidade schema antigo
    const blocos = pedido.blocos || {};
    const descAntigOk = blocos.desconto?.ativo && blocos.desconto?.valor > 0;
    if (!res.desconto && descAntigOk) total -= (blocos.desconto.valor || 0);
    if (!res.nf && blocos.nf?.ativo) total += total * ((blocos.nf.percent || 18) / 100);

    // Seções com kit vinculado não aparecem como subtotal — só a linha do kit
    // (evita parecer que o valor unitário soma no total junto com o kit)
    const kitsVinculados = (res.kits && res.kits_itens) ? res.kits_itens : [];
    const secaoTemKit = (sec) => kitsVinculados.some(k =>
        (k.secao_id && k.secao_id === sec.id) ||
        (k.secao_titulo && k.secao_titulo === (sec.titulo || ''))
    );

    let linhas = '';
    if (res.subtotais) {
        secoes.forEach(sec => {
            if (secaoTemKit(sec)) return;
            const sub = _mfCalcSubtotal(sec);
            linhas += `<tr>
                <td style="padding:8px 16px;font-size:11px;color:#555;">${esc((sec.titulo || 'SEÇÃO').toUpperCase())}</td>
                <td style="padding:8px 16px;text-align:right;font-size:11px;font-family:monospace;">R$ ${_mfFmt(sub)}</td>
            </tr>`;
        });
    }
    if (res.desconto && res.desconto_valor > 0) {
        linhas += `<tr>
            <td style="padding:8px 16px;font-size:11px;color:#c0392b;font-weight:600;">${esc((res.desconto_label || 'DESCONTO').toUpperCase())}</td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;color:#c0392b;font-weight:600;font-family:monospace;">- R$ ${_mfFmt(res.desconto_valor)}</td>
        </tr>`;
    }
    // Pagamentos já realizados: tabela separada acima do resumo,
    // no resumo entra apenas uma linha com o subtotal deduzido
    let pagamentosHTML = '';
    const pagos = res.pagamentos ? (res.pagamentos_itens || []).filter(p => p.valor > 0) : [];
    const totalPago = pagos.reduce((s, p) => s + (p.valor || 0), 0);

    if (pagos.length > 0) {
        pagamentosHTML = `
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <thead>
                <tr><td colspan="4" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">PAGAMENTOS JÁ REALIZADOS</td></tr>
                <tr style="background:#2a2a2a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                    <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;width:28px;">Nº</th>
                    <th style="padding:6px 10px;text-align:left;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;">Descrição</th>
                    <th style="padding:6px 10px;text-align:center;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;width:90px;">Data</th>
                    <th style="padding:6px 10px;text-align:right;font-size:10px;font-weight:700;color:#fff;text-transform:uppercase;width:110px;">Valor</th>
                </tr>
            </thead>
            <tbody>
                ${pagos.map((p, i) => `
                <tr style="${i % 2 === 0 ? 'background:#f5f5f5;' : ''}">
                    <td style="padding:7px 10px;text-align:center;font-size:11px;font-weight:700;border-bottom:1px solid #eee;">${i + 1}</td>
                    <td style="padding:7px 10px;font-size:11px;border-bottom:1px solid #eee;">${esc((p.label || 'PAGAMENTO').toUpperCase())}</td>
                    <td style="padding:7px 10px;text-align:center;font-size:11px;font-family:monospace;border-bottom:1px solid #eee;">${p.data ? formatDate(p.data) : '—'}</td>
                    <td style="padding:7px 10px;text-align:right;font-size:11px;font-family:monospace;font-weight:600;border-bottom:1px solid #eee;">R$ ${_mfFmt(p.valor)}</td>
                </tr>`).join('')}
                <tr style="background:#f5f5f5;">
                    <td colspan="3" style="padding:9px 10px;font-size:11px;font-weight:700;color:#c0392b;text-transform:uppercase;border-top:2px solid #ccc;">Total já pago</td>
                    <td style="padding:9px 10px;text-align:right;font-size:12px;font-family:monospace;font-weight:700;color:#c0392b;border-top:2px solid #ccc;">R$ ${_mfFmt(totalPago)}</td>
                </tr>
            </tbody>
        </table>`;

        // Linha única no resumo
        linhas += `<tr>
            <td style="padding:8px 16px;font-size:11px;color:#c0392b;font-weight:600;">PAGAMENTOS JÁ REALIZADOS (${pagos.length})</td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;color:#c0392b;font-weight:600;font-family:monospace;">- R$ ${_mfFmt(totalPago)}</td>
        </tr>`;
    }
    // Compatibilidade desconto antigo
    if (!res.desconto && descAntigOk) {
        linhas += `<tr>
            <td style="padding:8px 16px;font-size:11px;color:#c0392b;font-weight:600;">${esc((blocos.desconto.label || 'DESCONTO').toUpperCase())}</td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;color:#c0392b;font-family:monospace;">- R$ ${_mfFmt(blocos.desconto.valor)}</td>
        </tr>`;
    }

    // Kits — dentro do RESUMO, antes do total final
    // Novo formato: lista kits_itens; antigo: kits_qtd + kits_valor
    let kitsArr = [];
    if (res.kits) {
        if (res.kits_itens?.length) {
            kitsArr = res.kits_itens.filter(k => k.qtd > 0 && k.valor > 0);
        } else if (res.kits_qtd > 0 && res.kits_valor > 0) {
            kitsArr = [{ qtd: res.kits_qtd, valor: res.kits_valor, secao_titulo: '' }];
        }
    }
    const comKits = kitsArr.length > 0;
    const totalKits = kitsArr.reduce((s, k) => s + k.qtd * k.valor, 0);
    const totalFinal = comKits ? totalKits : total;

    kitsArr.forEach(k => {
        const ref = k.secao_titulo ? ` (${esc(k.secao_titulo.toUpperCase())})` : '';
        linhas += `<tr style="background:#f5f5f5;">
            <td style="padding:8px 16px;font-size:11px;color:#333;">
                ${k.qtd} KIT${k.qtd > 1 ? 'S' : ''} × R$ ${_mfFmt(k.valor)} / kit${ref}
            </td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;font-family:monospace;font-weight:700;color:#333;">R$ ${_mfFmt(k.qtd * k.valor)}</td>
        </tr>`;
    });

    linhas += `<tr style="background:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#fff;">VALOR TOTAL DO PEDIDO</td>
        <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#fff;font-family:monospace;">R$ ${_mfFmt(totalFinal)}</td>
    </tr>`;

    // ── Banda TOTAL GERAL (quando o parcelamento inclui os totais separados) ──
    const totalSeparadosVal = (pedido.secoes || [])
        .filter(sec => sec.total_separado)
        .reduce((s, sec) => s + _mfCalcSubtotal(sec), 0);
    let totalGeralHTML = '';
    if (res.pag_incluir_separado && totalSeparadosVal > 0) {
        const nomesSeparados = (pedido.secoes || [])
            .filter(sec => sec.total_separado)
            .map(sec => (sec.titulo || 'SEÇÃO').toUpperCase())
            .join(' + ');
        totalGeralHTML = `
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
            <tr style="background:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
                <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#fff;">TOTAL GERAL (PEDIDO + ${esc(nomesSeparados)})</td>
                <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#fff;font-family:monospace;">R$ ${_mfFmt(totalFinal + totalSeparadosVal)}</td>
            </tr>
        </table>`;
    }

    // ── BLOCO: NF / FRETE (a banda TOTAL GERAL entra no topo, como no layout clássico) ──
    // A NF incide sobre (total do pedido + frete).
    let nf_frete = totalGeralHTML;
    const freteVal = (res.frete && res.frete_valor > 0) ? res.frete_valor : 0;
    if (freteVal > 0) {
        nf_frete += `<div style="margin-top:10px;padding:10px 14px;background:#e3f2fd;border:1px solid #64b5f6;border-radius:6px;font-size:11px;color:#555;">
            <strong>VALOR SEM FRETE:</strong> R$ ${_mfFmt(totalFinal)} &nbsp;|&nbsp;
            <strong>FRETE:</strong> + R$ ${_mfFmt(freteVal)} &nbsp;|&nbsp;
            <strong>VALOR TOTAL COM FRETE:</strong> R$ ${_mfFmt(totalFinal + freteVal)}
        </div>`;
    }
    if (res.nf && res.nf_percent > 0) {
        const baseNF = totalFinal + freteVal;
        const nfVal = baseNF * (res.nf_percent / 100);
        const labelBase = freteVal > 0 ? 'VALOR SEM NF (PEDIDO + FRETE)' : 'VALOR SEM NF';
        nf_frete += `<div style="margin-top:10px;padding:10px 14px;background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;font-size:11px;color:#555;">
            <strong>${labelBase}:</strong> R$ ${_mfFmt(baseNF)} &nbsp;|&nbsp;
            <strong>NF FISCAL (${res.nf_percent}%):</strong> + R$ ${_mfFmt(nfVal)} &nbsp;|&nbsp;
            <strong>VALOR TOTAL COM NF:</strong> R$ ${_mfFmt(baseNF + nfVal)}
        </div>`;
    }
    // Compatibilidade NF antigo (schema sem frete)
    if (!res.nf && blocos.nf?.ativo) {
        const nfVal = totalFinal * ((blocos.nf.percent || 18) / 100);
        nf_frete += `<div style="margin-top:10px;padding:10px 14px;background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;font-size:11px;color:#555;">
            <strong>NF FISCAL (${blocos.nf.percent || 18}%):</strong> + R$ ${_mfFmt(nfVal)}
        </div>`;
    }

    // ── BLOCO: CONDIÇÃO DE PAGAMENTO / PARCELAS ──
    let condicaoHTML = '';
    const condicaoTexto = res.condicao_texto || '';
    if (condicaoTexto) condicaoHTML += `<div style="margin-top:10px;font-size:11px;color:#555;">
        <strong>CONDIÇÃO DE PAGAMENTO:</strong> ${esc(condicaoTexto.toUpperCase())}
    </div>`;
    if (res.pag_tipo === 'parcelado' && res.pag_parcelas_lista?.length > 0) {
        condicaoHTML += `<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;">
            <thead><tr style="background:#f0f0f0;">
                <th style="padding:6px 10px;text-align:left;">PARCELA</th>
                <th style="padding:6px 10px;text-align:center;">VENCIMENTO</th>
                <th style="padding:6px 10px;text-align:right;">VALOR</th>
            </tr></thead>
            <tbody>${res.pag_parcelas_lista.map(p => `
                <tr>
                    <td style="padding:6px 10px;">${p.num}ª Parcela</td>
                    <td style="padding:6px 10px;text-align:center;font-family:monospace;">${p.data ? new Date(p.data+'T12:00:00').toLocaleDateString('pt-BR') : '-'}</td>
                    <td style="padding:6px 10px;text-align:right;font-family:monospace;font-weight:700;">R$ ${_mfFmt(p.valor)}</td>
                </tr>`).join('')}
            </tbody>
        </table>`;
    }

    // ── BLOCO: INCLUSO ──
    let inclusoHTML = '';
    if (res.incluso && res.incluso_texto) {
        const linhasIncluso = res.incluso_texto.split('\n').filter(l => l.trim());
        inclusoHTML = `<table style="width:100%;border-collapse:collapse;margin-top:14px;">
            <tr><td style="background:#f0f0f0;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:0.5px;">INCLUSO</td></tr>
            <tr><td style="padding:10px 14px;font-size:11px;color:#333;">
                ${linhasIncluso.map(l => `<div style="margin-bottom:4px;">• ${esc(l.replace(/^[•·\-]\s*/, ''))}</div>`).join('')}
            </td></tr>
        </table>`;
    }

    // ── BLOCO: OBSERVAÇÕES ──
    let obsHTML = '';
    if (res.obs && res.obs_texto) {
        obsHTML = `<div style="margin-top:10px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:10px;">
            <strong>OBS:</strong> ${esc(res.obs_texto)}
        </div>`;
    } else if (!res.obs && blocos.observacoes) {
        obsHTML = `<div style="margin-top:10px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:10px;">
            <strong>OBS:</strong> ${esc(blocos.observacoes)}
        </div>`;
    }

    // ── BLOCO: RESUMO DO PEDIDO ──
    const resumoHTML = `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead><tr><td colspan="2" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">RESUMO DO PEDIDO</td></tr></thead>
        <tbody>${linhas}</tbody>
    </table>`;

    return {
        pagamentos: pagamentosHTML,
        resumo: resumoHTML,
        nf_frete,
        condicao: condicaoHTML,
        incluso: inclusoHTML,
        obs: obsHTML,
        banco: _mfBlocoBanco()
    };
}

function _mfFmt(v) {
    return (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ══════════════════════════════════════════════════════════════
// COMPARTILHAR PDF — gera o PDF no browser (html2pdf.js) e abre
// a tela nativa de compartilhamento (Web Share API). No desktop,
// baixa o arquivo diretamente.
// Requer: <script html2pdf.bundle.min.js> na página.
// ══════════════════════════════════════════════════════════════
async function compartilharDocumentoPDF(contentEl, nome) {
    nome = (nome || 'Documento').replace(/[\\/:*?"<>|]/g, '-').trim();

    // Clona o conteúdo sem o scale/margens do preview mobile
    const clone = contentEl.cloneNode(true);
    clone.style.cssText = 'transform:none;margin:0;width:760px;box-shadow:none;background:#fff;';

    // Holder no fluxo normal do documento, em 0,0 absoluto — evita os bugs
    // de offset do html2canvas com elementos fixed/fora da tela
    const holder = document.createElement('div');
    holder.style.cssText = 'position:absolute;left:0;top:0;width:760px;background:#fff;z-index:-1;overflow:hidden;';
    holder.appendChild(clone);
    document.body.prepend(holder);

    try {
        // Espera imagens do clone carregarem
        const imgs = Array.from(clone.querySelectorAll('img'));
        await Promise.all(imgs.map(img => img.complete ? Promise.resolve()
            : new Promise(r => { img.onload = r; img.onerror = r; })));
        await new Promise(r => setTimeout(r, 100)); // layout assentar

        // html2canvas ignora object-fit:contain e estica as imagens.
        // Compensa: redimensiona cada imagem para caber proporcionalmente
        // na caixa original, centralizada num wrapper do mesmo tamanho.
        imgs.forEach(img => {
            const cs = getComputedStyle(img);
            if (cs.objectFit !== 'contain') return;
            const rect = img.getBoundingClientRect();
            const boxW = rect.width, boxH = rect.height;
            const natW = img.naturalWidth, natH = img.naturalHeight;
            if (!boxW || !boxH || !natW || !natH) return;

            const ratio = Math.min(boxW / natW, boxH / natH);
            const w = natW * ratio, h = natH * ratio;

            const wrap = document.createElement('div');
            wrap.style.cssText = `width:${boxW}px;height:${boxH}px;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
            img.replaceWith(wrap);
            img.style.width = `${w}px`;
            img.style.height = `${h}px`;
            img.style.objectFit = 'fill';
            wrap.appendChild(img);
        });
        await new Promise(r => setTimeout(r, 50));

        // 1. Captura o documento inteiro num canvas único
        const canvas = await html2canvas(clone, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
        });

        // 2. Fatia o canvas em páginas A4 manualmente
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        const pageW = 210, pageH = 297;
        const imgW = pageW;
        const imgH = canvas.height * pageW / canvas.width;
        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        let restante = imgH;
        let posicao = 0;
        pdf.addImage(imgData, 'JPEG', 0, posicao, imgW, imgH);
        restante -= pageH;
        while (restante > 0) {
            posicao -= pageH;
            pdf.addPage();
            pdf.addImage(imgData, 'JPEG', 0, posicao, imgW, imgH);
            restante -= pageH;
        }

        await _mfCompartilharBlob(pdf.output('blob'), nome);
    } finally {
        holder.remove();
    }
}

// Compartilha/baixa um Blob de PDF: share sheet no mobile, download no desktop
async function _mfCompartilharBlob(blob, nome) {
    nome = (nome || 'Documento').replace(/[\\/:*?"<>|]/g, '-').trim();
    const file = new File([blob], `${nome}.pdf`, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: nome });
        } catch (err) {
            if (err.name !== 'AbortError') throw err; // usuário cancelou = ok
        }
    } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${nome}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}

// Busca o PDF VETORIAL no servidor (Chrome headless) e compartilha/baixa.
// Lança erro se o servidor não retornar um PDF — o chamador faz o fallback.
async function baixarPDFServidor(url, fetchInit, nome) {
    const res = await fetch(url, fetchInit || {});
    if (!res.ok) {
        let detalhe = 'HTTP ' + res.status;
        try { const j = await res.json(); if (j && j.error) detalhe = j.error; } catch {}
        throw new Error(detalhe);
    }
    const blob = await res.blob();
    if (blob.type && blob.type.indexOf('application/pdf') === -1) throw new Error('resposta não é PDF');
    await _mfCompartilharBlob(blob, nome);
}

// Node (geração de PDF no servidor): expõe o renderer e utilitários
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gerarPedidoMFHTML, esc, _mfFmt, formatDate };
}