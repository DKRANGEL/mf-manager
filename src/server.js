// src/server.js
require('dotenv').config();
const {createApp} = require('./app');
const {initData} = require('./utils/initData');
const {aquecerCache} = require('./utils/catalogoCache');
const {initUsuarios} = require('./routes/auth');

initData();
initUsuarios();
aquecerCache();

const app = createApp();
const PORT = process.env.PORT || 3003;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🧾 Tiny Recibo Pro rodando em http://localhost:${PORT}\n`);
});