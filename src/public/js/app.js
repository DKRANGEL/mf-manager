// ============================================
// TINY RECIBO PRO — Frontend App
// ============================================

let config = {};
let tipoBusca = 'pedido'; // 'pedido' ou 'pdv'
let ultimoPedido = null;

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  // Load config
  try {
    const res = await fetch('/config');
    config = await res.json();
  } catch (e) {
    console.warn('Config não carregado, usando defaults');
    config = {
      empresa: { nome: 'Empresa', cnpj: '', endereco: '', telefone: '' },
      recibo: { mensagemRodape: 'Obrigado pela preferência!' }
    };
  }

  // Enter key to generate
  document.getElementById('pedidoId').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gerarRecibo();
  });

  // Focus input
  document.getElementById('pedidoId').focus();
});

// ---- Toggle tipo de busca ----
function setTipo(el) {
  document.querySelectorAll('.toggle').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  tipoBusca = el.dataset.type;
}

// ---- Gerar Recibo ----
async function gerarRecibo() {
  const idInput = document.getElementById('pedidoId');
  const id = idInput.value.trim();

  if (!id) {
    showError('Digite o número do pedido.');
    idInput.focus();
    return;
  }

  hideError();
  setLoading(true);

  try {
    const endpoint = tipoBusca === 'pdv' 
      ? `/api/pdv/pedido/${id}` 
      : `/api/pedido/${id}`;
    
    const res = await fetch(endpoint);
    const json = await res.json();

    if (!json.success) {
      throw new Error(json.error || 'Erro ao buscar pedido');
    }

    ultimoPedido = json.data;
    renderRecibo(json.data);
    
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('reciboWrapper').style.display = 'block';
    document.getElementById('exportActions').style.display = 'flex';

  } catch (err) {
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

// ---- Render Recibo ----
function renderRecibo(pedido) {
  const empresa = config.empresa || {};
  const reciboConfig = config.recibo || {};

  // Empresa info
  setText('reciboEmpresaNome', empresa.nome);
  setText('reciboEmpresaCnpj', formatCNPJ(empresa.cnpj));
  
  if (reciboConfig.mostrarEndereco && empresa.endereco) {
    setText('reciboEmpresaEndereco', empresa.endereco);
    show('reciboEmpresaEndereco');
  }
  
  if (reciboConfig.mostrarTelefone && empresa.telefone) {
    setText('reciboEmpresaTelefone', empresa.telefone);
    show('reciboEmpresaTelefone');
  }

  // Logo
  if (empresa.logo) {
    const logoEl = document.getElementById('reciboLogo');
    logoEl.src = empresa.logo;
    logoEl.style.display = 'block';
  }

  // Pedido info
  setText('reciboNumero', pedido.numero || pedido.id || '-');
  setText('reciboData', formatDate(pedido.data_pedido || pedido.data_criacao));

  // Cliente
  const cliente = pedido.cliente || {};
  if (cliente.nome) {
    setText('reciboClienteNome', cliente.nome);
    
    const doc = cliente.cpf_cnpj || '';
    if (doc) {
      setText('reciboClienteDoc', formatDoc(doc));
      show('reciboClienteDoc');
    }
    
    show('reciboClienteSection');
  } else {
    hide('reciboClienteSection');
  }

  // Itens
  const itensContainer = document.getElementById('reciboItens');
  itensContainer.innerHTML = '';

  const itens = pedido.itens || [];
  let subtotal = 0;

  itens.forEach(wrapper => {
    const item = wrapper.item || wrapper;
    const desc = item.descricao || item.nome_produto || '-';
    const qtd = parseFloat(item.quantidade) || 0;
    const unitario = parseFloat(item.valor_unitario) || 0;
    const total = qtd * unitario;
    subtotal += total;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="col-desc">${escapeHtml(desc)}</td>
      <td class="col-qtd">${formatQtd(qtd)}</td>
      <td class="col-unit">${formatMoney(unitario)}</td>
      <td class="col-total">${formatMoney(total)}</td>
    `;
    itensContainer.appendChild(tr);
  });

  // Totais
  const desconto = parseFloat(pedido.desconto) || 0;
  const totalPedido = parseFloat(pedido.totalPedido || pedido.total_pedido || pedido.valor) || subtotal - desconto;

  setText('reciboSubtotal', formatMoney(subtotal));

  if (desconto > 0) {
    setText('reciboDesconto', `- ${formatMoney(desconto)}`);
    show('reciboDescontoRow');
  } else {
    hide('reciboDescontoRow');
  }

  setText('reciboTotal', formatMoney(totalPedido));

  // Forma de pagamento
  const formaPag = pedido.forma_pagamento || 
    (pedido.parcelas && pedido.parcelas.length > 0 ? pedido.parcelas[0].parcela?.forma_pagamento : '') || 
    '';
  
  if (formaPag) {
    setText('reciboPagamento', `💳 ${formaPag}`);
    show('reciboPagamentoSection');
  } else {
    hide('reciboPagamentoSection');
  }

  // Observações
  const obs = pedido.obs || pedido.observacoes || '';
  if (obs) {
    setText('reciboObs', obs);
    show('reciboObsSection');
  } else {
    hide('reciboObsSection');
  }

  // Mensagem rodapé
  setText('reciboMensagem', reciboConfig.mensagemRodape || '');

  // Aplicar cores do config
  if (reciboConfig.corPrimaria) {
    document.documentElement.style.setProperty('--recibo-accent', reciboConfig.corPrimaria);
  }
  if (reciboConfig.corAcento) {
    document.documentElement.style.setProperty('--recibo-accent-color', reciboConfig.corAcento);
  }
}

// ---- Export: Imagem ----
async function exportarImagem() {
  const recibo = document.getElementById('recibo');
  
  try {
    const canvas = await html2canvas(recibo, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const link = document.createElement('a');
    const numero = ultimoPedido?.numero || 'recibo';
    link.download = `recibo-${numero}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    showError('Erro ao gerar imagem: ' + err.message);
  }
}

// ---- Export: PDF ----
async function exportarPDF() {
  const recibo = document.getElementById('recibo');
  
  try {
    const canvas = await html2canvas(recibo, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const { jsPDF } = window.jspdf;
    
    const imgWidth = canvas.width;
    const imgHeight = canvas.height;
    
    // A4 proportions, fit width
    const pdfWidth = 210; // mm
    const pdfHeight = (imgHeight * pdfWidth) / imgWidth;
    
    const pdf = new jsPDF({
      orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
      unit: 'mm',
      format: [pdfWidth, pdfHeight + 20], // +20 for margins
    });

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 10, pdfWidth, pdfHeight);

    const numero = ultimoPedido?.numero || 'recibo';
    pdf.save(`recibo-${numero}.pdf`);
  } catch (err) {
    showError('Erro ao gerar PDF: ' + err.message);
  }
}

// ---- Utility Functions ----

function formatMoney(value) {
  return 'R$ ' + value.toFixed(2).replace('.', ',');
}

function formatQtd(value) {
  return value % 1 === 0 ? value.toString() : value.toFixed(2).replace('.', ',');
}

function formatDate(dateStr) {
  if (!dateStr) return new Date().toLocaleDateString('pt-BR');
  
  // Handle dd/mm/yyyy
  if (dateStr.includes('/')) return dateStr;
  
  // Handle yyyy-mm-dd
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  
  return dateStr;
}

function formatCNPJ(cnpj) {
  if (!cnpj) return '';
  const clean = cnpj.replace(/\D/g, '');
  if (clean.length === 14) {
    return clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return cnpj;
}

function formatDoc(doc) {
  if (!doc) return '';
  const clean = doc.replace(/\D/g, '');
  if (clean.length === 11) {
    return 'CPF: ' + clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (clean.length === 14) {
    return 'CNPJ: ' + formatCNPJ(doc);
  }
  return doc;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text || '';
}

function show(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function hide(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showError(msg) {
  const box = document.getElementById('errorBox');
  box.textContent = msg;
  box.style.display = 'block';
}

function hideError() {
  document.getElementById('errorBox').style.display = 'none';
}

function setLoading(loading) {
  const btn = document.getElementById('btnGerar');
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-loading');
  
  btn.disabled = loading;
  text.style.display = loading ? 'none' : '';
  spinner.style.display = loading ? 'inline-flex' : 'none';
}
