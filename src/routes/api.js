const express = require('express');
const TinyClient = require('../utils/tinyClient');

const router = express.Router();

const getTinyClient = () => {
  return new TinyClient(process.env.TINY_API_TOKEN);
};

// Obter pedido de venda por ID
router.get('/pedido/:id', async (req, res) => {
  try {
    const client = getTinyClient();
    const pedido = await client.obterPedido(req.params.id);
    res.json({ success: true, data: pedido });
  } catch (error) {
    console.error('Erro ao obter pedido:', error.message);
    res.status(error.message.includes('API Tiny') ? 400 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

// Obter pedido do PDV por ID
router.get('/pdv/pedido/:id', async (req, res) => {
  try {
    const client = getTinyClient();
    const pedido = await client.obterPedidoPDV(req.params.id);
    res.json({ success: true, data: pedido });
  } catch (error) {
    console.error('Erro ao obter pedido PDV:', error.message);
    res.status(error.message.includes('API Tiny') ? 400 : 500).json({
      success: false,
      error: error.message,
    });
  }
});

// Pesquisar pedidos (útil para busca por número)
router.get('/pedidos', async (req, res) => {
  try {
    const client = getTinyClient();
    const pedidos = await client.pesquisarPedidos(req.query);
    res.json({ success: true, data: pedidos });
  } catch (error) {
    console.error('Erro ao pesquisar pedidos:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
