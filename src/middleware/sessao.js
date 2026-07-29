// ===================== SESSÃO — cookie assinado HMAC =====================
// Sessão stateless: o cookie carrega usuario + expiracao, assinados com
// SESSION_SECRET. Sem armazenamento server-side, sem dependências novas.

const crypto = require('crypto');

const SECRET = process.env.SESSION_SECRET || process.env.BOT_API_KEY || 'mf-manager-dev-secret';
const SESSAO_DIAS = 30;
const COOKIE_NAME = 'mf_sessao';

function assinar(payload) {
    const hmac = crypto.createHmac('sha256', SECRET);
    hmac.update(payload);
    return hmac.digest('base64url');
}

function criarToken(usuario) {
    const exp = Date.now() + SESSAO_DIAS * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ u: usuario, e: exp })).toString('base64url');
    return `${payload}.${assinar(payload)}`;
}

function validarToken(token) {
    if (!token) return null;
    const [payload, assinatura] = token.split('.');
    if (!payload || !assinatura) return null;

    const esperada = assinar(payload);
    // Comparação em tempo constante
    if (assinatura.length !== esperada.length ||
        !crypto.timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada))) return null;

    try {
        const dados = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!dados.u || !dados.e || Date.now() > dados.e) return null;
        return dados;
    } catch {
        return null;
    }
}

function lerCookie(req) {
    const raw = req.headers.cookie || '';
    const match = raw.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`));
    return match ? match.slice(COOKIE_NAME.length + 1) : null;
}

function setCookie(res, token) {
    const maxAge = SESSAO_DIAS * 24 * 60 * 60;
    res.setHeader('Set-Cookie',
        `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax`);
}

function limparCookie(res) {
    res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
}

// ── Middleware de proteção ──
// Rotas públicas: login, QR redirect (/p), bot (tem API key própria), assets
const ROTAS_PUBLICAS = [
    '/login',
    '/api/auth/login',
    '/p',
    '/bot',
    '/public',
    '/favicon.ico',
];

function requireAuth(req, res, next) {
    const publica = ROTAS_PUBLICAS.some(rota =>
        req.path === rota || req.path.startsWith(rota + '/') || req.path.startsWith(rota + '?')
    );
    if (publica) return next();

    const sessao = validarToken(lerCookie(req));
    if (sessao) {
        req.usuario = sessao.u;
        return next();
    }

    // API → 401 JSON; página → redirect para /login
    if (req.path.startsWith('/api/') || req.path.startsWith('/data/')) {
        return res.status(401).json({ success: false, error: 'Não autenticado' });
    }
    res.redirect('/login');
}

module.exports = { criarToken, validarToken, lerCookie, setCookie, limparCookie, requireAuth };
