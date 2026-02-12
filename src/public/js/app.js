// ===================== TINY RECIBO PRO v2.1 - CLEAN FONT =====================

let config = {};
let tipoBusca = 'numero';
let docType = 'pedido';
let ultimoPedido = null;
const imgCache = {};

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
    try {
        const res = await fetch('/config');
        config = await res.json();
    } catch (e) {
        config = {
            empresa: {nome: 'Magic Fireworks'},
            recibo: {mensagemRodape: 'Magic Fireworks - Qualidade e Segurança'}
        };
    }
    document.getElementById('pedidoId').addEventListener('keydown', e => {
        if (e.key === 'Enter') gerarRecibo();
    });
    document.getElementById('pedidoId').focus();
    loadUploadedImages();

    // Drag & drop
    const dz = document.getElementById('dropzone');
    dz.addEventListener('dragover', e => {
        e.preventDefault();
        dz.classList.add('dragover');
    });
    dz.addEventListener('dragleave', () => dz.classList.remove('dragover'));
    dz.addEventListener('drop', e => {
        e.preventDefault();
        dz.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
});

function setTipo(el) {
    document.querySelectorAll('.toggle[data-type="numero"],.toggle[data-type="id"]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    tipoBusca = el.dataset.type;
}

function setDocType(el) {
    document.querySelectorAll('.toggle[data-type="pedido"],.toggle[data-type="recibo"]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    docType = el.dataset.type;
}

// ---- Gerar ----
async function gerarRecibo() {
    const id = document.getElementById('pedidoId').value.trim();
    if (!id) {
        showError('Digite o número do pedido.');
        return;
    }
    hideError();
    hideSuccess();
    setLoading(true);

    try {
        const endpoint = tipoBusca === 'numero' ? `/api/pedido/numero/${id}` : `/api/pedido/${id}`;
        const res = await fetch(endpoint);
        const json = await res.json();
        if (!json.success) throw new Error(json.error || 'Erro ao buscar pedido');

        ultimoPedido = json.data;
        await renderRecibo(json.data);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ---- Render (Ajustado para Fontes Normais) ----
async function renderRecibo(pedido) {
    const emp = config.empresa || {};
    const rc = config.recibo || {};

    // Empresa
    setText('rEmpresaNome', emp.nome || 'MAGIC FIREWORKS');
    setText('rEmpresaCnpj', `CNPJ: ${formatCNPJ(emp.cnpj)}`);
    setText('rEmpresaEnd', emp.endereco || '');

    // Cabeçalho Pedido
    const titulo = docType === 'recibo' ? 'RECIBO' : 'PEDIDO DE VENDA';
    setText('rDocTitulo', titulo);
    setText('rDocNum', pedido.numero || pedido.id || '000');
    setText('rData', formatDate(pedido.data_pedido || pedido.data_criacao));

    // Cliente
    const cliente = pedido.cliente || {};
    setText('rCliente', (cliente.nome || 'Consumidor Final').toUpperCase());
    setText('rClienteDoc', formatDoc(cliente.cpf_cnpj || ''));
    setText('rVendedor', (pedido.nome_vendedor || pedido.vendedor || '-').toUpperCase());
    setText('rNumero', pedido.numero || pedido.id || '-');

    // Tabela Itens
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
        // AQUI: Garantindo que não há tags <b> ou <strong> dentro da tabela
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

    // Totais
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

    // Parcelas
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

    // Rodapé
    const obs = pedido.obs || pedido.observacoes || pedido.observacao || '';
    if (obs) {
        setText('rObs', obs);
        show('rObsSection');
    } else {
        hide('rObsSection');
    }
    setText('rMensagem', rc.mensagemRodape || 'MAGIC FIREWORKS - QUALIDADE E SEGURANÇA');
}

// ---- Exportar (Nativo) ----
function exportarPDF() {
    window.print();
}

async function exportarImagem() {
    const el = document.getElementById('recibo');
    try {
        const canvas = await html2canvas(el, {scale: 2, backgroundColor: '#fff', useCORS: true, logging: false});
        const link = document.createElement('a');
        link.download = `${docType}-${ultimoPedido?.numero || 'doc'}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    } catch (err) {
        showError('Erro: ' + err.message);
    }
}

// Helpers
async function getProductImage(sku) {
    if (!sku) return null;
    if (imgCache[sku] !== undefined) return imgCache[sku];
    try {
        const res = await fetch(`/api/produto/imagem/${encodeURIComponent(sku)}`);
        const json = await res.json();
        return (json.success ? json.url : null);
    } catch {
        return null;
    }
}

async function handleFiles(files) {
    for (const file of files) {
        const name = file.name;
        const sku = name.substring(0, name.lastIndexOf('.')) || name;
        const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')) : '.png';
        const buffer = await file.arrayBuffer();
        try {
            const res = await fetch(`/upload/produto?sku=${encodeURIComponent(sku)}&ext=${encodeURIComponent(ext)}`, {
                method: 'POST', headers: {'Content-Type': file.type}, body: buffer,
            });
            const json = await res.json();
            if (json.success) {
                imgCache[sku] = json.path;
                addUploadedItem(sku);
            }
        } catch (err) {
            showError(err.message);
        }
    }
}

async function loadUploadedImages() {
    try {
        const res = await fetch('/upload/produtos');
        const json = await res.json();
        if (json.files) json.files.forEach(f => {
            const sku = f.substring(0, f.lastIndexOf('.'));
            imgCache[sku] = `/public/produtos/${f}`;
            addUploadedItem(sku);
        });
    } catch {
    }
}

function addUploadedItem(sku) {
    const list = document.getElementById('uploadedList');
    if (list.querySelector(`[data-sku="${sku}"]`)) return;
    const el = document.createElement('span');
    el.className = 'uploaded-item';
    el.dataset.sku = sku;
    el.textContent = `✓ ${sku}`;
    list.appendChild(el);
}

async function testarConexao() { /* ... */
}

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

function showError(m) {
    const b = document.getElementById('errorBox');
    b.textContent = m;
    b.style.display = 'block';
    hideSuccess();
}

function hideError() {
    document.getElementById('errorBox').style.display = 'none';
}

function showSuccess(m) {
    const b = document.getElementById('successBox');
    b.textContent = m;
    b.style.display = 'block';
    hideError();
}

function hideSuccess() {
    document.getElementById('successBox').style.display = 'none';
}

function setLoading(l) {
    const b = document.getElementById('btnGerar');
    b.disabled = l;
    b.querySelector('.btn-text').style.display = l ? 'none' : '';
    b.querySelector('.btn-loading').style.display = l ? 'inline-flex' : 'none';
}