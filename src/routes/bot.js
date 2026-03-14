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

module.exports = router;