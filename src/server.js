require('dotenv').config();
const express = require('express');
const path = require('path');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Static files
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve config.json (sem o token)
app.get('/config', (req, res) => {
  const config = require(path.join(__dirname, '..', 'config.json'));
  res.json(config);
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
