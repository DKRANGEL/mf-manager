// src/server.js
require('dotenv').config();
const {createApp} = require('./app');
const {initData} = require('./utils/initData');
const {initUsuarios} = require('./routes/auth');
const {migrarTiposPedidos, migrarTiposClientes} = require('./utils/migracaoTipos');
const {warmup} = require('./utils/pdf');

initData();
initUsuarios();
migrarTiposPedidos();
migrarTiposClientes();

const app = createApp();
const PORT = process.env.PORT || 3003;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎆 MF Manager rodando em http://localhost:${PORT}\n`);
    // Pré-aquece o Chromium do gerador de PDF (não bloqueia o boot)
    warmup();
});