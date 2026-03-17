const express = require('express');
const router = express.Router();
const {requireApiKey} = require('../middleware/auth');
const {getCatalogoBot} = require('../utils/catalogoCache');

// Aplica autenticação em todas as rotas deste arquivo
router.use(requireApiKey);

/**
 * GET /bot/catalogo
 * Retorna catálogo de produtos Tiny formatado para o FastZap.
 * Resposta em ~50ms via cache (TTL 10 minutos).
 */
router.get('/catalogo', async (req, res) => {
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

module.exports = router;