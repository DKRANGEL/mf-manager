// ===================== DOCUMENTO (TEMPLATE + RENDER) =====================
// Este arquivo controla SOMENTE o conteúdo do documento gerado.
// Mexer aqui = mexer no que aparece no pedido/recibo.

let _templateCache = null;

/**
 * Carrega o template HTML do pedido (uma vez, cacheia).
 */
async function carregarTemplate() {
    if (_templateCache) return _templateCache;
    const res = await fetch('/public/templates/pedido.html');
    _templateCache = await res.text();
    return _templateCache;
}

/**
 * Injeta o template no container e preenche com os dados do pedido.
 */
async function renderDocumento(pedido, config) {
    const template = await carregarTemplate();
    const container = document.getElementById('recibo');
    container.innerHTML = template;

    const emp = config.empresa || {};
    const rc = config.recibo || {};
    const cli = pedido.cliente || {};

    // 1. Dados da Empresa
    setText('rEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('rEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('rEmpresaEnd', 'Brasília - DF');

    // 2. Cabeçalho do Pedido
    setText('rDocTitulo', 'PEDIDO DE VENDA');
    setText('rDocNum', pedido.numero || pedido.id || '000');
    setText('rData', formatDate(pedido.data_pedido || pedido.data_criacao));

    // 3. Dados do Cliente
    const nomeCliente = cli.nome_fantasia || cli.nome || 'Consumidor Final';

    const enderecoCompleto = [
        cli.endereco,
        cli.numero,
        cli.bairro,
        cli.cidade ? `${cli.cidade}/${cli.uf}` : ''
    ].filter(Boolean).join(', ');

    const contato = [cli.fone, cli.celular, cli.email].filter(Boolean).join(' / ') || '-';

    const tabelaDadosHTML = `
    <table class="client-data-table-title">
        <tr>            
            <td class="bg-black-title">VENDEDOR</td>
            <td class="data-cell">${(pedido.nome_vendedor || pedido.vendedor || '-').toUpperCase()}</td>
            
            <td class="bg-black-title">Nº PEDIDO</td>
            <td class="data-cell">${pedido.numero || pedido.id || '-'}</td>
        </tr>
    </table>

    <table class="client-data-table">
        <tr>
            <td class="bg-gray-title">CLIENTE</td>
            <td class="data-cell highlight" colspan="3">${nomeCliente.toUpperCase()}</td>
        </tr>
    
        <tr>
            <td class="bg-gray-title">CNPJ/CPF</td>
            <td class="data-cell">${formatDoc(cli.cpf_cnpj)}</td>
        </tr>

        <tr>
            <td class="bg-gray-title">ENDEREÇO</td>
            <td class="data-cell" colspan="3">${enderecoCompleto.toUpperCase()}</td>
        </tr>

        <tr>
            <td class="bg-gray-title">CONTATO</td>
            <td class="data-cell" colspan="3">${contato.toUpperCase()}</td>
        </tr>
    </table>
    `;

    document.getElementById('rDadosClienteContainer').innerHTML = tabelaDadosHTML;

    // 4. Itens da Tabela
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
            <td class="c-img">
                ${imgUrl ? `<img src="${imgUrl}" class="prod-thumb">` : ''}
            </td>
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

    // 5. Totais
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

    // 6. Parcelas
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

    // 7. Rodapé e Obs
    const obs = pedido.obs || pedido.observacoes || pedido.observacao || '';
    if (obs) {
        setText('rObs', obs);
        show('rObsSection');
    } else {
        hide('rObsSection');
    }
    setText('rMensagem', rc.mensagemRodape || 'MAGIC FIREWORKS - QUALIDADE E SEGURANÇA');
}

// ---- Helpers de formatação (usados pelo documento) ----

function fmtMoney(v) {
    return v.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

function formatQtd(v) {
    return v % 1 === 0 ? v.toString() : v.toFixed(1).replace('.', ',');
}

function formatDate(d) {
    if (!d) return new Date().toLocaleDateString('pt-BR');
    if (d.includes('/')) return d;
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
