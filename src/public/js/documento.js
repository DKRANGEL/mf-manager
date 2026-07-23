// ===================== DOCUMENTO (TEMPLATE + RENDER) =====================
// Este arquivo controla SOMENTE o conteúdo do documento gerado.
// Mexer aqui = mexer no que aparece no pedido/recibo.

let _templateCache = null;
let _templateOECache = null;
let _templateInvCache = null;
let _templateInvProdCache = null;

async function carregarTemplate() {
    if (_templateCache) return _templateCache;
    const res = await fetch('/public/templates/pedido.html');
    _templateCache = await res.text();
    return _templateCache;
}

async function carregarTemplateOE() {
    if (_templateOECache) return _templateOECache;
    const res = await fetch('/public/templates/ordem-equipamento.html');
    _templateOECache = await res.text();
    return _templateOECache;
}

async function carregarTemplateInv() {
    if (_templateInvCache) return _templateInvCache;
    const res = await fetch('/public/templates/inventario.html');
    _templateInvCache = await res.text();
    return _templateInvCache;
}

async function carregarTemplateInvProd() {
    if (_templateInvProdCache) return _templateInvProdCache;
    const res = await fetch('/public/templates/inventario-produtos.html');
    _templateInvProdCache = await res.text();
    return _templateInvProdCache;
}

async function renderDocumento(pedido, config) {
    const template = await carregarTemplate();
    const container = document.getElementById('recibo');
    container.innerHTML = template;

    const emp = config.empresa || {};
    const rc = config.recibo || {};
    const cli = pedido.cliente || {};

    setText('rEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('rEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('rEmpresaEnd', 'Brasília - DF');

    setText('rDocTitulo', 'PEDIDO DE VENDA');
    setText('rDocNum', pedido.numero || pedido.id || '000');
    setText('rData', formatDate(pedido.data_pedido || pedido.data_criacao));

    const nomeCliente = cli.nome_fantasia || cli.nome || 'Consumidor Final';
    const vendedor = (pedido.nome_vendedor || pedido.vendedor || '-').toUpperCase();
    const numPedido = pedido.numero || pedido.id || '-';

    const enderecoCompleto = [
        cli.endereco, cli.numero, cli.bairro,
        cli.cidade ? `${cli.cidade}/${cli.uf}` : ''
    ].filter(Boolean).join(', ');

    const contato = [cli.fone, cli.celular, cli.email].filter(Boolean).join(' / ') || '-';

    document.getElementById('rDadosClienteContainer').innerHTML = `
    <table class="client-data-table-title">
        <tr>
            <td class="bg-black-title">VENDEDOR</td>
            <td class="data-cell">${esc(vendedor)}</td>
            <td class="bg-black-title">Nº PEDIDO</td>
            <td class="data-cell">${esc(numPedido)}</td>
        </tr>
    </table>
    <table class="client-data-table">
        <tr>
            <td class="bg-gray-title">CLIENTE</td>
            <td class="data-cell highlight" colspan="3">${esc(nomeCliente.toUpperCase())}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">CNPJ/CPF</td>
            <td class="data-cell" colspan="3">${formatDoc(cli.cpf_cnpj)}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">ENDEREÇO</td>
            <td class="data-cell" colspan="3">${esc(enderecoCompleto.toUpperCase())}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">CONTATO</td>
            <td class="data-cell" colspan="3">${esc(contato.toUpperCase())}</td>
        </tr>
    </table>`;

    const tbody = document.getElementById('rItens');
    tbody.innerHTML = '';
    const itens = pedido.itens || [];
    let subtotal = 0;
    let itemIndex = 1;

    for (const wrapper of itens) {
        const item = wrapper.item || wrapper;
        const desc = item.descricao || item.nome_produto || '-';
        const sku = item.codigo || item.codigo_produto || '';
        const qtd = parseFloat(item.quantidade) || 0;
        const un = item.unidade || 'UN';
        const unitario = parseFloat(item.valor_unitario) || 0;
        const total = qtd * unitario;
        subtotal += total;

        const imgUrl = await getProductImage(sku);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="c-img">${imgUrl ? `<img src="${imgUrl}" class="prod-thumb">` : ''}</td>
            <td class="c-item">${itemIndex++}</td>
            <td class="c-sku">${esc(sku)}</td>
            <td class="c-desc">${esc(desc)}</td>
            <td class="c-qtd">${formatQtd(qtd)}</td>
            <td class="c-un">${esc(un)}</td>
            <td class="c-preco">${fmtMoney(unitario)}</td>
            <td class="c-total">${fmtMoney(total)}</td>
        `;
        tbody.appendChild(tr);
    }

    const desconto = parseFloat(pedido.desconto) || 0;
    const totalPedido = parseFloat(pedido.totalPedido || pedido.valor) || (subtotal - desconto);

    setText('rSubtotal', fmtMoney(subtotal));
    setText('rTotal', fmtMoney(totalPedido));

    if (desconto > 0) {
        setText('rDesconto', `- ${fmtMoney(desconto)}`);
        show('rDescontoRow');
    } else {
        hide('rDescontoRow');
    }

    const parcelasBody = document.getElementById('rParcelas');
    parcelasBody.innerHTML = '';
    const parcelas = pedido.parcelas || [];

    if (parcelas.length > 0) {
        parcelas.forEach(p => {
            const parc = p.parcela || p;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${parc.dias || '0'}</td>
                <td style="font-family:var(--mono)">${parc.data_vencimento || formatDate(pedido.data_pedido)}</td>
                <td>${(parc.forma_pagamento || parc.meio_pagamento || '-').toUpperCase()}</td>
                <td style="text-align:right; font-family:var(--mono)">${fmtMoney(parseFloat(parc.valor) || totalPedido)}</td>
                <td style="font-size:10px">${parc.obs || parc.observacao || ''}</td>
            `;
            parcelasBody.appendChild(tr);
        });
    } else {
        const fp = pedido.forma_pagamento || '';
        if (fp) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>0</td><td>${formatDate(pedido.data_pedido)}</td><td>${fp.toUpperCase()}</td><td style="text-align:right">${fmtMoney(totalPedido)}</td><td></td>`;
            parcelasBody.appendChild(tr);
        }
    }

    const obs = pedido.obs || pedido.observacoes || pedido.observacao || '';
    if (obs) {
        setText('rObs', obs);
        show('rObsSection');
    } else {
        hide('rObsSection');
    }
    setText('rMensagem', rc.mensagemRodape || 'MAGIC FIREWORKS - QUALIDADE E SEGURANÇA');
}

// ===================== ORDEM DE EQUIPAMENTO (RENDER) =====================

async function renderOrdemEquipamento(ordem, config) {
    const template = await carregarTemplateOE();
    const container = document.getElementById('recibo');
    container.innerHTML = template;

    const emp = config.empresa || {};

    setText('oeEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('oeEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('oeEmpresaEnd', 'Brasília - DF');

    const numCurto = (ordem.numero || '000').replace(/^OS-\d{4}-/, '');
    setText('oeDocTitulo', 'ORDEM DE EQUIPAMENTO');
    setText('oeDocNum', numCurto);
    setText('oeDocData', formatDate(ordem.data_criacao));

    document.getElementById('oeDadosEventoContainer').innerHTML = `
    <table class="client-data-table-title">
        <tr>
            <td class="bg-black-title">EVENTO</td>
            <td class="data-cell highlight" colspan="3">${esc((ordem.evento || '-').toUpperCase())}</td>
        </tr>
    </table>
    <table class="client-data-table">
        <tr>
            <td class="bg-gray-title">LOCAL</td>
            <td class="data-cell" colspan="3">${esc((ordem.local || '-').toUpperCase())}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">SAÍDA</td>
            <td class="data-cell">${formatDate(ordem.data_saida)}</td>
            <td class="bg-gray-title">RETORNO</td>
            <td class="data-cell">${formatDate(ordem.data_retorno)}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">RESP. ENTREGA</td>
            <td class="data-cell" colspan="3">${esc((ordem.responsavel_entrega || '-').toUpperCase())}</td>
        </tr>
        <tr>
            <td class="bg-gray-title">RESP. EQUIP.</td>
            <td class="data-cell" colspan="3">${esc((ordem.responsavel_equipamento || '-').toUpperCase())}</td>
        </tr>
    </table>`;

    const tbody = document.getElementById('oeItens');
    tbody.innerHTML = '';
    const itens = ordem.itens || [];
    let totalItens = 0;
    let pendentes = 0;

    itens.forEach((item, i) => {
        const qtdSaida = parseInt(item.qtd_saida) || 0;
        const qtdRetorno = parseInt(item.qtd_retorno) || 0;
        const diff = qtdSaida - qtdRetorno;
        totalItens += qtdSaida;
        pendentes += Math.max(0, diff);

        let status = 'PENDENTE';
        let statusStyle = 'color: #c0392b; font-weight: 700;';
        if (diff === 0 && qtdSaida > 0) {
            status = 'OK';
            statusStyle = 'color: #27ae60; font-weight: 700;';
        } else if (qtdRetorno > 0 && diff > 0) {
            status = 'PARCIAL';
            statusStyle = 'color: #e67e22; font-weight: 700;';
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="c-item">${i + 1}</td>
            <td class="c-sku">${esc(item.sku || '-')}</td>
            <td class="c-desc">${esc(item.descricao || '-')}</td>
            <td class="c-qtd">${qtdSaida}</td>
            <td class="c-qtd">${qtdRetorno}</td>
            <td style="text-align: center; font-size: 10px; ${statusStyle}">${status}</td>
        `;
        tbody.appendChild(tr);
    });

    setText('oeTotalItens', totalItens.toString());
    setText('oePendentes', pendentes.toString());
    setText('oeAssinaEntrega', `RESP. ENTREGA: ${(ordem.responsavel_entrega || '').toUpperCase()}`);
    setText('oeAssinaEquip', `RESP. EQUIPAMENTO: ${(ordem.responsavel_equipamento || '').toUpperCase()}`);

    if (ordem.observacoes) {
        setText('oeObs', ordem.observacoes);
        show('oeObsSection');
    } else {
        hide('oeObsSection');
    }
}

// ===================== INVENTÁRIO DE EQUIPAMENTOS (RENDER) =====================

async function renderInventario(catalogo, config) {
    const template = await carregarTemplateInv();
    const container = document.getElementById('recibo');
    container.innerHTML = template;

    const emp = config.empresa || {};

    setText('invEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('invEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('invEmpresaEnd', 'Brasília - DF');
    setText('invDocData', new Date().toLocaleDateString('pt-BR'));

    const categorias = Object.keys(catalogo).sort();
    let totalItens = 0, totalUnidades = 0, totalManut = 0;

    categorias.forEach(cat => {
        catalogo[cat].forEach(e => {
            totalItens++;
            totalUnidades += (e.quantidade || 0);
            totalManut += (e.em_manutencao || 0);
        });
    });

    setText('invTotalItens', totalItens.toString());
    setText('invTotalUnidades', totalUnidades.toString());
    setText('invTotalManut', totalManut.toString());
    setText('invTotalCategorias', categorias.length.toString());

    const catContainer = document.getElementById('invCategoriasContainer');
    let html = '';

    categorias.forEach(cat => {
        const itens = catalogo[cat];
        const catQtd = itens.reduce((s, e) => s + (e.quantidade || 0), 0);
        const catManut = itens.reduce((s, e) => s + (e.em_manutencao || 0), 0);

        html += `
        <table class="client-data-table-title" style="margin-top: 20px; margin-bottom: 0;">
            <tr>
                <td class="bg-black-title" style="width: auto; text-align: left; padding: 8px 14px;">${esc(cat.toUpperCase())}</td>
                <td class="data-cell" style="text-align: right; font-size: 11px; color: #888;">
                    ${itens.length} itens &nbsp;•&nbsp; ${catQtd} un.${catManut > 0 ? ' &nbsp;•&nbsp; ' + catManut + ' em manut.' : ''}
                </td>
            </tr>
        </table>
        <table class="r-table" style="margin-bottom: 15px;">
            <thead><tr>
                <th class="c-item">Nº</th>
                <th class="c-sku">CÓDIGO</th>
                <th class="c-desc">DESCRIÇÃO</th>
                <th class="c-qtd">QTD</th>
                <th class="c-qtd">MANUT.</th>
                <th style="text-align: left; width: 180px;">OBS</th>
            </tr></thead>
            <tbody>`;

        itens.forEach((e, i) => {
            const manutStr = (e.em_manutencao > 0) ? e.em_manutencao.toString() : '-';
            const manutStyle = (e.em_manutencao > 0) ? 'color: #c0392b; font-weight: 700;' : 'color: #999;';
            html += `
                <tr>
                    <td class="c-item">${i + 1}</td>
                    <td class="c-sku">${esc(e.sku || '-')}</td>
                    <td class="c-desc">${esc(e.nome || '-')}</td>
                    <td class="c-qtd" style="font-weight: 700;">${e.quantidade || 0}</td>
                    <td class="c-qtd" style="${manutStyle}">${manutStr}</td>
                    <td style="font-size: 10px; color: #666;">${esc(e.observacoes || '')}</td>
                </tr>`;
        });

        html += '</tbody></table>';
    });

    catContainer.innerHTML = html;
}

// ===================== INVENTÁRIO DE PRODUTOS TINY (RENDER) =====================

const SKU_CATEGORIAS = [
    ['MFCSM', 'Smoke Mine'],
    ['MFSCW', 'Smoke Cake Waterfall'],
    ['MFSCH', 'Smoke Cake Hydra'],
    ['MFSCM', 'Smoke Mine'],
    ['MFSSS', 'Single Shot 0.8"'],
    ['MFSS1', 'Single Shot 1.2"'],
    ['MFS3I', 'Display Shell 3"'],
    ['MFS4I', 'Display Shell 4"'],
    ['MFS5I', 'Display Shell 5"'],
    ['MFS6I', 'Display Shell 6"'],
    ['MFCX', 'Cake X'],
    ['MFCW', 'Cake W'],
    ['MFCS', 'Cake S'],
];

const ORDEM_CATEGORIAS_PRODUTOS = [
    'Single Shot 0.8"',
    'Single Shot 1.2"',
    'Cake S',
    'Cake X',
    'Cake W',
    'Smoke Mine',
    'Smoke Cake Waterfall',
    'Smoke Cake Hydra',
    'Display Shell 3"',
    'Display Shell 4"',
    'Display Shell 5"',
    'Display Shell 6"',
];

function categoriaDeSku(sku) {
    if (!sku) return 'Outros';
    const skuBase = sku.toUpperCase().replace(/_U$/, '');
    for (const [prefixo, cat] of SKU_CATEGORIAS) {
        if (skuBase.startsWith(prefixo.toUpperCase())) return cat;
    }
    return 'Outros';
}

function limparNomeProduto(nome) {
    if (!nome) return '';
    return nome.replace(/\[\s*(caixa|unidade|cx|un)\s*\]/gi, '').replace(/\s{2,}/g, ' ').trim();
}

function isSkuUnidade(sku) {
    return sku ? sku.toUpperCase().endsWith('_U') : false;
}

async function renderInventarioProdutos(catalogoBruto, config) {
    const template = await carregarTemplateInvProd();
    const container = document.getElementById('recibo');
    container.innerHTML = template;

    const emp = config.empresa || {};

    setText('invProdEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('invProdEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('invProdEmpresaEnd', 'Brasília - DF');
    setText('invProdDocData', new Date().toLocaleDateString('pt-BR'));

    // Achata e reclassifica por SKU
    const agrupado = {};

    Object.values(catalogoBruto).forEach(lista => {
        lista.forEach(p => {
            if (isSkuUnidade(p.sku) && (p.quantidade || 0) === 0) return;
            const cat = categoriaDeSku(p.sku);
            if (!agrupado[cat]) agrupado[cat] = [];
            agrupado[cat].push({
                ...p,
                nome: limparNomeProduto(p.nome || p.descricao || ''),
                isUnidade: isSkuUnidade(p.sku),
            });
        });
    });

    Object.values(agrupado).forEach(lista =>
        lista.sort((a, b) => (a.sku || '').localeCompare(b.sku || ''))
    );

    const categoriasOrdenadas = [
        ...ORDEM_CATEGORIAS_PRODUTOS.filter(c => agrupado[c]),
        ...Object.keys(agrupado).filter(c => !ORDEM_CATEGORIAS_PRODUTOS.includes(c)).sort(),
    ];

    let totalItens = 0, totalUnidades = 0, totalValor = 0;
    categoriasOrdenadas.forEach(cat => {
        agrupado[cat].forEach(p => {
            totalItens++;
            totalUnidades += (p.quantidade || 0);
            totalValor += (p.quantidade || 0) * (p.preco || 0);
        });
    });

    setText('invProdTotalItens', totalItens.toString());
    setText('invProdTotalUnidades', totalUnidades.toString());
    setText('invProdTotalCategorias', categoriasOrdenadas.length.toString());
    setText('invProdValorTotal', fmtMoney(totalValor));

    // Gerar tabelas por categoria — com imagem
    const catContainer = document.getElementById('invProdCategoriasContainer');
    let html = '';

    for (const cat of categoriasOrdenadas) {
        const itens = agrupado[cat];
        const catQtd = itens.reduce((s, p) => s + (p.quantidade || 0), 0);
        const catValor = itens.reduce((s, p) => s + (p.quantidade || 0) * (p.preco || 0), 0);

        html += `
        <table class="client-data-table-title" style="margin-top: 20px; margin-bottom: 0;">
            <tr>
                <td class="bg-black-title" style="text-align: left; padding: 8px 14px;">${esc(cat.toUpperCase())}</td>
                <td class="data-cell" style="text-align: right; font-size: 11px; color: #888;">
                    ${itens.length} itens &nbsp;•&nbsp; ${catQtd} un.
                    ${catValor > 0 ? ' &nbsp;•&nbsp; R$ ' + fmtMoney(catValor) : ''}
                </td>
            </tr>
        </table>
        <table class="r-table" style="margin-bottom: 15px;">
            <thead><tr>
                <th class="c-img">FOTO</th>
                <th class="c-sku">CÓDIGO</th>
                <th class="c-desc">DESCRIÇÃO</th>
                <th class="c-un" style="width: 44px; text-align: center;">UN</th>
                <th class="c-qtd">QTD</th>
                <th class="c-preco">PREÇO</th>
                <th class="c-total">TOTAL</th>
            </tr></thead>
            <tbody>`;

        for (let i = 0; i < itens.length; i++) {
            const p = itens[i];
            const qtd = p.quantidade || 0;
            const total = qtd * (p.preco || 0);
            const qtdStyle = qtd === 0 ? 'color: #c0392b; font-weight: 700;' : 'font-weight: 700;';

            const skuDisplay = p.isUnidade
                ? `${esc(p.sku)} <span style="background:#e67e22;color:#fff;font-size:8px;padding:1px 4px;border-radius:3px;font-weight:700;-webkit-print-color-adjust:exact;print-color-adjust:exact;">UN</span>`
                : esc(p.sku || '-');

            // Busca imagem local pelo SKU — placeholder se não encontrar
            const imgUrl = await getProductImage(p.sku) || '/public/placeholder-produto.svg';

            html += `
                <tr>
                    <td class="c-img"><img src="${imgUrl}" class="prod-thumb"></td>
                    <td class="c-sku">${skuDisplay}</td>
                    <td class="c-desc">${esc(p.nome || '-')}</td>
                    <td class="c-un" style="text-align: center;">${esc(p.unidade || 'UN')}</td>
                    <td class="c-qtd" style="${qtdStyle}">${formatQtd(qtd)}</td>
                    <td class="c-preco">${(p.preco || 0) > 0 ? fmtMoney(p.preco) : '-'}</td>
                    <td class="c-total">${total > 0 ? fmtMoney(total) : '-'}</td>
                </tr>`;
        }

        html += '</tbody></table>';
    }

    catContainer.innerHTML = html;
}

// ---- Helpers de formatação ----

function fmtMoney(v) {
    return v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatQtd(v) {
    return v % 1 === 0 ? v.toString() : v.toFixed(1).replace('.', ',');
}

function formatDate(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    if (d.includes('/')) return d;
    if (d.includes('T')) d = d.split('T')[0];
    const p = d.split('-');
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}

function formatCNPJ(c) {
    if (!c) return '';
    return c.replace(/\D/g, '').replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
}

function formatDoc(d) {
    if (!d) return '';
    const n = d.replace(/\D/g, '');
    if (n.length === 11) return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    if (n.length === 14) return formatCNPJ(d);
    return d;
}

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

function setText(id, t) {
    const e = document.getElementById(id);
    if (e) e.textContent = t || '';
}

function show(id) {
    const e = document.getElementById(id);
    if (e) e.style.display = '';
}

function hide(id) {
    const e = document.getElementById(id);
    if (e) e.style.display = 'none';
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
            tds += `<td style="${tdC}padding:4px 6px;">${item.imagem ? `<img src="/data/produtos/${esc(item.imagem)}" style="width:56px;height:56px;object-fit:contain;border-radius:4px;" onerror="this.style.visibility='hidden'">` : ''}</td>`;
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
    if (res.pagamentos) {
        (res.pagamentos_itens || []).filter(p => p.valor > 0).forEach(p => {
            linhas += `<tr>
                <td style="padding:8px 16px;font-size:11px;color:#c0392b;font-weight:600;">${esc((p.label || 'PAGAMENTO').toUpperCase())} (VALOR JÁ PAGO)</td>
                <td style="padding:8px 16px;text-align:right;font-size:11px;color:#c0392b;font-weight:600;font-family:monospace;">- R$ ${_mfFmt(p.valor)}</td>
            </tr>`;
        });
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

    return `<table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead><tr><td colspan="2" class="bg-black-title" style="text-align:center;font-size:11px;letter-spacing:1px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">RESUMO DO PEDIDO</td></tr></thead>
        <tbody>${linhas}</tbody>
    </table>${extras}`;
}

function _mfFmt(v) {
    return (parseFloat(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}