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

    // Seções
    let secoesHTML = '';
    const secoes = pedido.secoes || [];
    const gruposVistos = new Set();

    for (const sec of secoes) {
        if (sec.grupo && !gruposVistos.has(sec.grupo)) {
            gruposVistos.add(sec.grupo);
            secoesHTML += `<table style="width:100%;border-collapse:collapse;margin-top:20px;">
                <tr><td style="background:#c0392b;color:#fff;font-size:12px;font-weight:700;padding:8px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${esc(sec.grupo.toUpperCase())}</td></tr>
            </table>`;
        }
        secoesHTML += _mfGerarSecaoHTML(sec);
    }

    // Resumo
    const resumoHTML = _mfGerarResumoHTML(pedido);

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

        ${secoesHTML}
        ${resumoHTML}

        <div style="margin-top:14px;font-size:10px;color:#555;border-top:1px solid #eee;padding-top:10px;">
            <strong>DADOS BANCÁRIOS:</strong> C6 BANK (336) | CNPJ: 22.748.770/0001-50 | AG: 0001 | CC: 12665143-4 | PIX (CNPJ): 22.748.770/0001-50
        </div>
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

function _mfGerarSecaoHTML(sec) {
    const cols = sec.colunas;
    const totalSec = _mfCalcSubtotal(sec);
    const nCols = _mfContarCols(cols);
    const compact = nCols > 8;
    const p = compact ? '4px 5px' : '6px 10px';
    const fs = compact ? '9px' : '10px';

    let tituloSec = sec.titulo || '';
    if (sec.preco_padrao_ativo && sec.preco_padrao) {
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
    if (cols?.v_unit || !cols) ths += `<th style="${thR}">V.UNIT</th>`;
    if (cols?.total_kit) ths += `<th style="${thR}">T.KIT</th>`;
    ths += `<th style="${thR}">TOTAL</th>`;

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
        if (cols?.v_unit || !cols) {
            tds += item.sem_valor
                ? `<td style="${tdR}"><span style="color:#c0392b;font-size:10px;">PAGO P/<br>EVENTO</span></td>`
                : `<td style="${tdR}">R$ ${_mfFmt(vUnit)}</td>`;
        }
        if (cols?.total_kit) tds += `<td style="${tdR}">${item.total_kit != null ? 'R$ '+_mfFmt(item.total_kit) : '-'}</td>`;
        tds += `<td style="${tdR}font-weight:700;">${item.sem_valor ? '—' : 'R$ '+_mfFmt(total)}</td>`;

        const bg = i % 2 === 0 ? 'background:#f5f5f5;' : '';
        return `<tr style="${bg}">${tds}</tr>`;
    }).join('');

    const subtotalRow = `<tr style="background:#f5f5f5;">
        <td colspan="${nCols-1}" style="padding:8px 14px;font-size:11px;font-weight:700;color:#333;border-top:2px solid #ccc;text-transform:uppercase;">SUBTOTAL</td>
        <td style="padding:8px 14px;text-align:right;font-weight:700;color:#000;font-size:12px;border-top:2px solid #ccc;font-family:monospace;">R$ ${_mfFmt(totalSec)}</td>
    </tr>`;

    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;table-layout:auto;word-break:break-word;">
        <thead>
            <tr><td colspan="${nCols}" style="background:#1a1a1a;color:#fff;font-size:12px;font-weight:700;padding:10px 14px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${esc(tituloSec.toUpperCase())}</td></tr>
            <tr style="background:#2a2a2a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">${ths}</tr>
        </thead>
        <tbody>${rows}${subtotalRow}</tbody>
    </table>`;
}

function _mfGerarResumoHTML(pedido) {
    const res = pedido.resumo || {};
    const secoes = pedido.secoes || [];
    // Cálculo do total
    let total = secoes.reduce((s, sec) => s + _mfCalcSubtotal(sec), 0);
    if (res.desconto && res.desconto_valor > 0) total -= res.desconto_valor;
    if (res.pagamentos) (res.pagamentos_itens || []).forEach(p => { total -= (p.valor || 0); });

    // Compatibilidade schema antigo
    const blocos = pedido.blocos || {};
    const descAntigOk = blocos.desconto?.ativo && blocos.desconto?.valor > 0;
    if (!res.desconto && descAntigOk) total -= (blocos.desconto.valor || 0);
    if (!res.nf && blocos.nf?.ativo) total += total * ((blocos.nf.percent || 18) / 100);

    let linhas = '';
    if (res.subtotais) {
        secoes.forEach(sec => {
            const sub = _mfCalcSubtotal(sec);
            linhas += `<tr>
                <td style="padding:8px 16px;font-size:11px;color:#555;">${esc((sec.titulo || 'SEÇÃO').toUpperCase())}</td>
                <td style="padding:8px 16px;text-align:right;font-size:11px;font-family:monospace;">R$ ${_mfFmt(sub)}</td>
            </tr>`;
        });
    }
    if (res.desconto && res.desconto_valor > 0) {
        linhas += `<tr>
            <td style="padding:8px 16px;font-size:11px;color:#c0392b;font-weight:600;">${esc((res.desconto_label || 'DESCONTO').toUpperCase())} (VALOR JÁ PAGO)</td>
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
    const comKits = res.kits && res.kits_qtd > 0 && res.kits_valor > 0;
    const totalKits = comKits ? res.kits_qtd * res.kits_valor : 0;
    const totalFinal = comKits ? totalKits : total;

    if (comKits) {
        linhas += `<tr style="background:#f5f5f5;">
            <td style="padding:8px 16px;font-size:11px;color:#333;">
                ${res.kits_qtd} KIT${res.kits_qtd > 1 ? 'S' : ''} × R$ ${_mfFmt(res.kits_valor)} / kit
            </td>
            <td style="padding:8px 16px;text-align:right;font-size:11px;font-family:monospace;font-weight:700;color:#333;">R$ ${_mfFmt(totalKits)}</td>
        </tr>`;
    }

    linhas += `<tr style="background:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
        <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#fff;">VALOR TOTAL DO PEDIDO</td>
        <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:700;color:#fff;font-family:monospace;">R$ ${_mfFmt(totalFinal)}</td>
    </tr>`;

    let extras = '';

    // NF Fiscal — calculada sobre o total final
    if (res.nf && res.nf_percent > 0) {
        const nfVal = totalFinal * (res.nf_percent / 100);
        extras += `<div style="margin-top:10px;padding:10px 14px;background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;font-size:11px;color:#555;">
            <strong>VALOR SEM NF:</strong> R$ ${_mfFmt(totalFinal)} &nbsp;|&nbsp;
            <strong>NF FISCAL (${res.nf_percent}%):</strong> + R$ ${_mfFmt(nfVal)} &nbsp;|&nbsp;
            <strong>VALOR TOTAL COM NF:</strong> R$ ${_mfFmt(totalFinal + nfVal)}
        </div>`;
    }
    // Compatibilidade NF antigo
    if (!res.nf && blocos.nf?.ativo) {
        const nfVal = totalFinal * ((blocos.nf.percent || 18) / 100);
        extras += `<div style="margin-top:10px;padding:10px 14px;background:#fff8e1;border:1px solid #ffd54f;border-radius:6px;font-size:11px;color:#555;">
            <strong>NF FISCAL (${blocos.nf.percent || 18}%):</strong> + R$ ${_mfFmt(nfVal)}
        </div>`;
    }

    // Condição / Pagamento
    const condicao = res.condicao_texto || '';
    if (condicao) extras += `<div style="margin-top:10px;font-size:11px;color:#555;">
        <strong>CONDIÇÃO DE PAGAMENTO:</strong> ${esc(condicao.toUpperCase())}
    </div>`;

    // Parcelas
    if (res.pag_tipo === 'parcelado' && res.pag_parcelas_lista?.length > 0) {
        extras += `<table style="width:100%;border-collapse:collapse;margin-top:10px;font-size:11px;">
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

    // Bloco INCLUSO
    if (res.incluso && res.incluso_texto) {
        const linhasIncluso = res.incluso_texto.split('\n').filter(l => l.trim());
        extras += `<table style="width:100%;border-collapse:collapse;margin-top:14px;">
            <tr><td style="background:#f0f0f0;padding:8px 14px;font-size:11px;font-weight:700;letter-spacing:0.5px;">INCLUSO</td></tr>
            <tr><td style="padding:10px 14px;font-size:11px;color:#333;">
                ${linhasIncluso.map(l => `<div style="margin-bottom:4px;">• ${esc(l.replace(/^[•·\-]\s*/, ''))}</div>`).join('')}
            </td></tr>
        </table>`;
    }

    // Observações
    if (res.obs && res.obs_texto) {
        extras += `<div style="margin-top:10px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:10px;">
            <strong>OBS:</strong> ${esc(res.obs_texto)}
        </div>`;
    }
    // Compatibilidade obs antigo
    if (!res.obs && blocos.observacoes) {
        extras += `<div style="margin-top:10px;font-size:11px;color:#555;border-top:1px solid #eee;padding-top:10px;">
            <strong>OBS:</strong> ${esc(blocos.observacoes)}
        </div>`;
    }

    return `${pagamentosHTML}<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead><tr><td colspan="2" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">RESUMO DO PEDIDO</td></tr></thead>
        <tbody>${linhas}</tbody>
    </table>${extras}`;
}

function _mfFmt(v) {
    return (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}