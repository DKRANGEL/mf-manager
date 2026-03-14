// src/server.js
require('dotenv').config();
const {createApp} = require('./app');
const {initData} = require('./utils/initData');
const {aquecerCache} = require('./utils/catalogoCache');

initData();
aquecerCache();

const app = createApp();
const PORT = process.env.PORT || 3003;

app.listen(PORT, () => {
    console.log(`\n🧾 Tiny Recibo Pro rodando em http://localhost:${PORT}\n`);
});