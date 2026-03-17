const express = require('express');
const router = express.Router();
const {requireApiKey} = require('../middleware/auth');
const {getCatalogoBot} = require('../utils/catalogoCache');

/**
 * GET /bot/catalogo
 * Retorna catálogo de produtos Tiny formatado para o FastZap.
 * Resposta em ~50ms via cache (TTL 10 minutos).
 */
router.get('/catalogo', requireApiKey, async (req, res) => {
    try {
        const produtos = await getCatalogoBot();
        res.json({success: true, total: produtos.length, produtos});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

/**
 * GET /bot/catalogo.txt
 * Retorna catálogo formatado em texto simples para consumo da IA.
 * SEM autenticação — URL pública para upload em plataformas de IA.
 */
router.get('/catalogo.txt', async (req, res) => {
    try {
        const produtos = await getCatalogoBot();

        // Agrupa por categoria
        const categorias = {};
        for (const p of produtos) {
            if (!categorias[p.categoria]) categorias[p.categoria] = [];
            categorias[p.categoria].push(p);
        }

        let texto = `CATÁLOGO DE PRODUTOS — MAGIC EFFECTS BRASIL\n`;
        texto += `Atualizado em: ${new Date().toLocaleDateString('pt-BR')}\n`;
        texto += `Total: ${produtos.length} produtos\n\n`;

        for (const [cat, itens] of Object.entries(categorias).sort()) {
            texto += `== ${cat.toUpperCase()} ==\n`;
            for (const p of itens) {
                const status = p.disponivel ? `Disponível (${p.quantidade} ${p.unidade})` : 'Indisponível';
                texto += `- ${p.nome} | Cód: ${p.codigo} | ${status}\n`;
            }
            texto += '\n';
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(texto);
    } catch (err) {
        res.status(500).send(`Erro ao gerar catálogo: ${err.message}`);
    }
});

router.get('/catalogo.html', async (req, res) => {
    try {
        const produtos = await getCatalogoBot();
        const categorias = {};
        for (const p of produtos) {
            const cat = p.categoria || 'Sem categoria';
            if (!categorias[cat]) categorias[cat] = [];
            categorias[cat].push(p);
        }

        let html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>Catálogo Magic Effects Brasil</title></head>
<body>
<h1>Catálogo de Produtos — Magic Effects Brasil</h1>
<p>Atualizado em: ${new Date().toLocaleDateString('pt-BR')} — Total: ${produtos.length} produtos</p>`;

        for (const [cat, itens] of Object.entries(categorias).sort()) {
            html += `<h2>${cat}</h2><ul>`;
            for (const p of itens) {
                const status = p.disponivel
                    ? `Disponível — ${p.quantidade} ${p.unidade}`
                    : 'Indisponível';
                html += `<li><strong>${p.nome}</strong> — Código: ${p.codigo} — ${status}</li>`;
            }
            html += `</ul>`;
        }

        html += `</body></html>`;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(500).send(`<p>Erro: ${err.message}</p>`);
    }
});

module.exports = router;