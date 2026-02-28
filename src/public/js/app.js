// ===================== APP (INTERFACE / CONTROLES) =====================
// Este arquivo controla SOMENTE a interface: sidebar, modais, busca, upload, export.
// A renderização do documento fica em documento.js.

let config = {};
let tipoBusca = 'numero';
let modoAtual = 'pedido';
let ultimoPedido = null;
let osItens = [];
let osConfigEquip = {};
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
    document.getElementById('osBusca').addEventListener('keydown', e => {
        if (e.key === 'Enter') buscarOS();
    });
    document.getElementById('osBuscaProduto').addEventListener('keydown', e => {
        if (e.key === 'Enter') buscarProdutos();
    });

    document.getElementById('pedidoId').focus();
    loadUploadedImages();
    carregarConfigEquipamentos();

    // Fechar modais com Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            fecharModalOS();
            fecharModalBuscarOS();
        }
    });

    // Fechar clicando no backdrop
    document.getElementById('modalOS').addEventListener('click', e => {
        if (e.target === e.currentTarget) fecharModalOS();
    });
    document.getElementById('modalBuscarOS').addEventListener('click', e => {
        if (e.target === e.currentTarget) fecharModalBuscarOS();
    });

    // Se abriu com ?inventario=1, gera automaticamente
    const params = new URLSearchParams(window.location.search);
    if (params.get('inventario') === '1') {
        const btnEquip = document.querySelector('.toggle[data-mode="equipamento"]');
        if (btnEquip) setModo(btnEquip);
        setTimeout(() => gerarInventario(), 300);
    }

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

// ---- Controles da sidebar ----
function setTipo(el) {
    document.querySelectorAll('.toggle[data-type]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    tipoBusca = el.dataset.type;
}

function setModo(el) {
    document.querySelectorAll('.toggle[data-mode]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    modoAtual = el.dataset.mode;

    document.getElementById('modoPedido').style.display = modoAtual === 'pedido' ? 'block' : 'none';
    document.getElementById('modoEquipamento').style.display = modoAtual === 'equipamento' ? 'block' : 'none';

    // Reset preview
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('reciboWrapper').style.display = 'none';
    document.getElementById('exportActions').style.display = 'none';
    hideError();
    hideSuccess();
}

// ---- Gerar pedido ----
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
        await renderDocumento(json.data, config);

        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';
    } catch (err) {
        showError(err.message);
    } finally {
        setLoading(false);
    }
}

// ---- Exportar PDF ----
function exportarPDF() {
    window.print();
}

// ---- Imagens de produtos ----
async function getProductImage(sku) {
    if (!sku) return null;
    if (imgCache[sku] !== undefined) return imgCache[sku];
    try {
        const res = await fetch(`/api/produto/imagem/${encodeURIComponent(sku)}`);
        const json = await res.json();
        return json.success ? json.url : null;
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
                showSuccess(`Upload OK: ${sku}`);
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
        });
    } catch {
    }
}

// ===================== MODAIS DE OS =====================

function abrirModalNovaOS() {
    // Limpa formulário
    osItens = [];
    renderOsItensLista();
    document.getElementById('osEvento').value = '';
    document.getElementById('osLocal').value = '';
    document.getElementById('osDataSaida').value = '';
    document.getElementById('osDataRetorno').value = '';
    document.getElementById('osRespEntrega').value = '';
    document.getElementById('osRespEquip').value = '';
    document.getElementById('osObs').value = '';
    document.getElementById('osBuscaProduto').value = '';
    document.getElementById('resultadosProdutos').style.display = 'none';
    document.getElementById('modalOSTitulo').textContent = 'Nova Ordem de Equipamento';
    document.getElementById('modalOS').classList.add('active');
    setTimeout(() => document.getElementById('osEvento').focus(), 80);
}

function fecharModalOS() {
    document.getElementById('modalOS').classList.remove('active');
}

function abrirModalBuscarOS() {
    document.getElementById('osBusca').value = '';
    document.getElementById('modalBuscarOS').classList.add('active');
    setTimeout(() => document.getElementById('osBusca').focus(), 80);
}

function fecharModalBuscarOS() {
    document.getElementById('modalBuscarOS').classList.remove('active');
}

// ===================== ORDEM DE EQUIPAMENTO =====================

async function carregarConfigEquipamentos() {
    try {
        const res = await fetch('/api/equipamentos/config');
        const json = await res.json();
        if (json.success) {
            osConfigEquip = json.data;
            popularDatalist('listaEventos', osConfigEquip.eventos_recentes || []);
            popularDatalist('listaLocais', osConfigEquip.locais_frequentes || []);
            popularDatalist('listaRespEntrega', osConfigEquip.responsaveis_entrega || []);
            popularDatalist('listaRespEquip', osConfigEquip.responsaveis_equipamento || []);
        }
    } catch {
    }
}

function popularDatalist(id, valores) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = valores.map(v => `<option value="${v}">`).join('');
}

async function buscarOS() {
    let input = document.getElementById('osBusca').value.trim();
    if (!input) {
        showError('Digite o número da OS');
        return;
    }

    // Aceita só número e expande para código completo
    if (/^\d+$/.test(input)) {
        const ano = new Date().getFullYear();
        input = `OS-${ano}-${input.padStart(3, '0')}`;
    }

    fecharModalBuscarOS();
    hideError();
    hideSuccess();

    try {
        const res = await fetch(`/api/equipamentos/ordens/${encodeURIComponent(input)}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const ordem = json.data;

        // Popula modal com dados da OS
        document.getElementById('osEvento').value = ordem.evento || '';
        document.getElementById('osLocal').value = ordem.local || '';
        document.getElementById('osDataSaida').value = ordem.data_saida || '';
        document.getElementById('osDataRetorno').value = ordem.data_retorno || '';
        document.getElementById('osRespEntrega').value = ordem.responsavel_entrega || '';
        document.getElementById('osRespEquip').value = ordem.responsavel_equipamento || '';
        document.getElementById('osObs').value = ordem.observacoes || '';
        osItens = ordem.itens || [];
        renderOsItensLista();
        document.getElementById('modalOSTitulo').textContent = `OS ${ordem.numero}`;
        document.getElementById('modalOS').classList.add('active');

        // Renderiza documento no preview
        await renderOrdemEquipamento(ordem, config);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';
        showSuccess(`OS ${ordem.numero} carregada`);
    } catch (err) {
        showError(err.message);
    }
}

async function buscarProdutos() {
    const q = document.getElementById('osBuscaProduto').value.trim();
    if (!q) return;

    const container = document.getElementById('resultadosProdutos');
    container.innerHTML = '<div style="padding:8px;color:#888;font-size:11px;">Buscando...</div>';
    container.style.display = 'block';

    try {
        const res = await fetch(`/api/equipamentos/produtos?q=${encodeURIComponent(q)}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        const produtos = json.data || [];
        if (produtos.length === 0) {
            container.innerHTML = '<div style="padding:8px;color:#888;font-size:11px;">Nenhum resultado</div>';
            return;
        }

        container.innerHTML = produtos.map(p => {
            const sku = p.sku || '';
            const nome = p.nome || '';
            const qtd = p.quantidade || 0;
            return `<div class="search-result-item" onclick="adicionarEquipamento('${sku}', '${nome.replace(/'/g, "\\'")}')">
                <strong>${sku}</strong> — ${nome} <span style="color:#888;font-size:10px;">(${qtd} un.)</span>
            </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div style="padding:8px;color:#ff6b6b;font-size:11px;">${err.message}</div>`;
    }
}

function adicionarEquipamento(sku, descricao) {
    const existe = osItens.find(i => i.sku === sku);
    if (existe) {
        existe.qtd_saida++;
    } else {
        osItens.push({sku, descricao, qtd_saida: 1, qtd_retorno: 0});
    }
    renderOsItensLista();
    document.getElementById('resultadosProdutos').style.display = 'none';
    document.getElementById('osBuscaProduto').value = '';
}

function removerEquipamento(index) {
    osItens.splice(index, 1);
    renderOsItensLista();
}

function atualizarQtd(index, campo, valor) {
    osItens[index][campo] = Math.max(0, parseInt(valor) || 0);
}

function renderOsItensLista() {
    const container = document.getElementById('osItensLista');
    if (osItens.length === 0) {
        container.innerHTML = '<div style="color:#3a3a3f;font-size:11px;padding:6px 0;">Nenhum equipamento adicionado</div>';
        return;
    }
    container.innerHTML = osItens.map((item, i) => `
        <div class="os-item-card">
            <div class="os-item-header">
                <span class="os-item-sku">${item.sku}</span>
                <button class="os-item-remove" onclick="removerEquipamento(${i})">✕</button>
            </div>
            <div class="os-item-desc">${item.descricao}</div>
            <div class="os-item-qtds">
                <label>Saída: <input type="number" value="${item.qtd_saida}" min="0" onchange="atualizarQtd(${i},'qtd_saida',this.value)"></label>
                <label>Retorno: <input type="number" value="${item.qtd_retorno}" min="0" onchange="atualizarQtd(${i},'qtd_retorno',this.value)"></label>
            </div>
        </div>
    `).join('');
}

async function gerarOrdemEquipamento() {
    const evento = document.getElementById('osEvento').value.trim();
    if (!evento) {
        document.getElementById('osEvento').focus();
        document.getElementById('osEvento').style.borderColor = 'var(--sb-accent)';
        setTimeout(() => document.getElementById('osEvento').style.borderColor = '', 2000);
        return;
    }
    if (osItens.length === 0) {
        document.getElementById('osBuscaProduto').focus();
        return;
    }

    const ordem = {
        evento,
        local: document.getElementById('osLocal').value.trim(),
        data_saida: document.getElementById('osDataSaida').value,
        data_retorno: document.getElementById('osDataRetorno').value,
        responsavel_entrega: document.getElementById('osRespEntrega').value.trim(),
        responsavel_equipamento: document.getElementById('osRespEquip').value.trim(),
        itens: osItens,
        observacoes: document.getElementById('osObs').value.trim()
    };

    try {
        const res = await fetch('/api/equipamentos/ordens', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(ordem)
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        fecharModalOS();
        await renderOrdemEquipamento(json.data, config);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';
        showSuccess(`Ordem ${json.data.numero} criada`);
        carregarConfigEquipamentos();
    } catch (err) {
        showError(err.message);
    }
}

// ===================== INVENTÁRIOS =====================

async function gerarInventario() {
    hideError();
    hideSuccess();
    try {
        const res = await fetch('/api/equipamentos/catalogo');
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        await renderInventario(json.data, config);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';
        showSuccess(`Inventário gerado — ${json.total} equipamentos`);
    } catch (err) {
        showError(err.message);
    }
}

async function gerarInventarioProdutos() {
    hideError();
    hideSuccess();
    showSuccess('Carregando produtos do Tiny...');
    try {
        const res = await fetch('/api/produtos/estoque');
        const json = await res.json();
        if (!json.success) throw new Error(json.error);

        await renderInventarioProdutos(json.data, config);
        document.getElementById('emptyState').style.display = 'none';
        document.getElementById('reciboWrapper').style.display = 'block';
        document.getElementById('exportActions').style.display = 'flex';

        const totalCats = Object.keys(json.data).length;
        showSuccess(`Inventário gerado — ${json.total} produtos em ${totalCats} categorias`);
    } catch (err) {
        showError(err.message);
    }
}

// ---- Testar conexão ----
async function testarConexao() { /* ... */
}

// ---- UI helpers ----
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
    b.innerText = l ? '...' : 'GERAR';
}
