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