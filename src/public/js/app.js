// ===================== APP (INTERFACE / CONTROLES) =====================
// Este arquivo controla SOMENTE a interface: sidebar, busca, upload, export.
// A renderização do documento fica em documento.js.

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

// ---- Controles da sidebar ----
function setTipo(el) {
    document.querySelectorAll('.toggle[data-type="numero"],.toggle[data-type="id"]').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    tipoBusca = el.dataset.type;
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

        // Chama o documento.js pra renderizar
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
