const BOT_API_KEY = process.env.BOT_API_KEY;

function requireApiKey(req, res, next) {
    if (!BOT_API_KEY) {
        return res.status(503).json({
            success: false,
            error: 'Serviço não configurado'
        });
    }

    const key = req.headers['x-api-key'];

    if (!key || key !== BOT_API_KEY) {
        return res.status(401).json({
            success: false,
            error: 'Não autorizado'
        });
    }

    next();
}

module.exports = { requireApiKey };