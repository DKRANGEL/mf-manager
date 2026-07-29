// src/app.js

const express = require('express');
const path = require('path');
const fs = require('fs');
const equipamentosRoutes = require('./routes/equipamentos');
const botRoutes = require('./routes/bot');
const catalogoRoutes = require('./routes/catalogo');
const pedidosRoutes = require('./routes/pedidos');
const contagensRoutes = require('./routes/contagens');
const estoqueRoutes = require('./routes/estoque');
const movimentosRoutes = require('./routes/movimentos');
const authRoutes = require('./routes/auth');
const auditoriaRoutes = require('./routes/auditoria');
const { requireAuth } = require('./middleware/sessao');
const { auditoria } = require('./middleware/auditoria');

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

    // ─── Autenticação ────────────────────────────────────────────────────────────
    // Protege tudo exceto /login, /api/auth/login, /p (QR clientes), /bot, /public
    app.use('/api/auth', authRoutes);
    app.get('/login', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    });
    app.use(requireAuth);
    app.use(auditoria);
    app.use('/api/auditoria', auditoriaRoutes);

    // ─── Static ─────────────────────────────────────────────────────────────────
    app.use('/public', express.static(path.join(__dirname, 'public')));
    // Imagens: cache longo — a URL leva ?v=imagem_v que muda quando a imagem
    // muda, então o browser pode guardar por 30 dias sem revalidar nada.
    app.use('/data/produtos', express.static(path.join(__dirname, 'data', 'produtos'), {
        etag: true,
        lastModified: true,
        setHeaders: (res) => {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        }
    }));

    // ─── Rotas API ───────────────────────────────────────────────────────────────
    app.use('/api/equipamentos', equipamentosRoutes);
    app.use('/api/pedidos', pedidosRoutes);
    app.use('/api/catalogo', catalogoRoutes);
    app.use('/api/contagens', contagensRoutes);
    app.use('/api/estoque', estoqueRoutes);
    app.use('/api/movimentos', movimentosRoutes);

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

    app.get('/pedidos', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'pedidos.html'));
    });

    app.get('/emitir', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'emitir.html'));
    });

    app.get('/contagem', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'contagem.html'));
    });

    app.get('/estoque', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'estoque.html'));
    });

    app.get('/etiquetas', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'etiquetas.html'));
    });

    app.get('/coletor', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'coletor.html'));
    });

    app.get('/logs', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'logs.html'));
    });

    app.get('/perfil', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'perfil.html'));
    });

    app.get('/auditoria', (req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'auditoria.html'));
    });

    // ─── Redirecionamento de QR Code ────────────────────────────────────────────
    // GET /p?sku=MFSSS-001&cx=400
    // Cliente escaneia → redireciona para YouTube do produto
    // Operador escaneia pelo /coletor → extrai sku+cx dos params
    app.get('/p', (req, res) => {
        const { sku } = req.query;
        if (!sku) return res.status(400).send('SKU não informado');

        const PRODUTOS_FILE = path.join(__dirname, 'data', 'produtos.json');
        try {
            const db = JSON.parse(fs.readFileSync(PRODUTOS_FILE, 'utf8'));
            const produto = db.produtos.find(p => p.codigo === sku);

            if (!produto) return res.status(404).send(`Produto "${sku}" não encontrado`);

            if (produto.video_id) {
                return res.redirect(`https://www.youtube.com/watch?v=${produto.video_id}`);
            }

            // Sem vídeo: página simples com informações do produto
            res.send(`<!DOCTYPE html><html lang="pt-BR"><head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width,initial-scale=1">
                <title>${produto.nome} — Magic Fireworks</title>
                <style>body{font-family:sans-serif;text-align:center;padding:40px;background:#000;color:#fff;}
                img{width:120px;border-radius:8px;margin-bottom:16px;}
                h1{font-size:20px;}p{color:#888;}</style>
            </head><body>
                <img src="https://manager.magicfireworks.com.br/public/MagicFireworksLogo.jpeg">
                <h1>${produto.nome}</h1>
                <p>${produto.codigo}</p>
                <p style="color:#555;font-size:12px;margin-top:32px;">Magic Fireworks — Produtos Pirotécnicos</p>
            </body></html>`);
        } catch {
            res.status(500).send('Erro ao buscar produto');
        }
    });

    return app;
}

module.exports = {createApp};