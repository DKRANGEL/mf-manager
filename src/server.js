require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure products image directory exists
const produtosDir = path.join(__dirname, 'public', 'produtos');
if (!fs.existsSync(produtosDir)) {
  fs.mkdirSync(produtosDir, { recursive: true });
}

// Middleware
app.use(express.json());

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve config.json (sem o token)
app.get('/config', (req, res) => {
  const config = require(path.join(__dirname, '..', 'config.json'));
  res.json(config);
});

// Upload de imagens de produtos (por SKU)
app.post('/upload/produto', express.raw({ type: 'image/*', limit: '5mb' }), (req, res) => {
  const sku = req.query.sku;
  const ext = req.query.ext || '.png';

  if (!sku) return res.status(400).json({ error: 'SKU obrigatório' });

  const filePath = path.join(produtosDir, `${sku}${ext}`);
  fs.writeFileSync(filePath, req.body);

  // Invalida cache de match de imagens
  fetch(`http://localhost:${PORT}/api/invalidate-image-cache`, { method: 'POST' }).catch(() => {});

  res.json({ success: true, path: `/public/produtos/${sku}${ext}` });
});

// Listar imagens de produtos existentes
app.get('/upload/produtos', (req, res) => {
  const files = fs.readdirSync(produtosDir);
  res.json({ success: true, files });
});

// API routes (proxy para Tiny)
app.use('/api', apiRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🧾 Tiny Recibo Pro rodando em http://localhost:${PORT}\n`);
});
