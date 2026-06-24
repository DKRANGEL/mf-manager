// src/app.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const equipamentosRoutes = require('./routes/equipamentos');
const botRoutes = require('./routes/bot');
const catalogoRoutes = require('./routes/catalogo');
const pedidosRoutes = require('./routes/pedidos');

function createApp() {
    const app = express();

    // ─── Diretórios necessários ─────────────────────────────────────────────────
    const produtosDir = path.join(__dirname, 'public', 'produtos');
    if (!fs.existsSync(produtosDir)) fs.mkdirSync(produtosDir, {recursive: true});

    const ordensDir = path.join(__dirname, 'data', 'ordens');
    if (!fs.existsSync(ordensDir)) fs.mkdirSync(ordensDir, {recursive: true});

    // ─── Middleware ─────────────────────────────────────────────────────────────
    app.use(express.json());
    app.use(express.urlencoded({extended: true}));

    // ─── Static ─────────────────────────────────────────────────────────────────
    app.use('/public', express.static(path.join(__dirname, 'public')));

    // ─── Config pública ─────────────────────────────────────────────────────────
    app.get('/config', (req, res) => {
        const config = require(path.join(__dirname, '..', 'config.json'));
        res.json(config);
    });

    // ─── Upload de imagens ───────────────────────────────────────────────────────
    app.post('/upload/produto', express.raw({type: 'image/*', limit: '5mb'}), (req, res) => {
        const sku = req.query.sku;
        const ext = req.query.ext || '.png';

        if (!sku) return res.status(400).json({error: 'SKU obrigatório'});

        const filePath = path.join(produtosDir, `${sku}${ext}`);
        fs.writeFileSync(filePath, req.body);

        fetch(`http://localhost:${process.env.PORT || 3003}/api/invalidate-image-cache`, {method: 'POST'}).catch(() => {
        });

        res.json({success: true, path: `/public/produtos/${sku}${ext}`});
    });

    app.get('/upload/produtos', (req, res) => {
        const files = fs.readdirSync(produtosDir);
        res.json({success: true, files});
    });

    // ─── Rotas API ───────────────────────────────────────────────────────────────
    app.use('/api/equipamentos', equipamentosRoutes);
    app.use('/api/pedidos', pedidosRoutes);
    app.use('/api', apiRoutes);
    app.use('/api/catalogo', catalogoRoutes);

    // ─── Rotas Bot (protegidas) ──────────────────────────────────────────────────
    app.use('/bot', botRoutes);

    // ─── Páginas ─────────────────────────────────────────────────────────────────
    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    app.get('/equipamentos', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'equipamentos.html'));
    });

    app.get('/produtos', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'produtos.html'));
    });

    return app;
}

module.exports = {createApp};