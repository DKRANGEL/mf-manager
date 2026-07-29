// ===================== ROTAS: AUTENTICAÇÃO =====================
// Usuários em data/usuarios.json com hash scrypt.
// POST /api/auth/login  { usuario, senha }
// POST /api/auth/logout
// GET  /api/auth/me

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { readJSON, writeJSONAtomic } = require('../utils/storage');
const { criarToken, setCookie, limparCookie, validarToken, lerCookie } = require('../middleware/sessao');

const router = express.Router();
const USUARIOS_FILE = path.join(__dirname, '..', 'data', 'usuarios.json');

// ── Hash de senha via scrypt (built-in, sem dependências) ──
function hashSenha(senha, salt = null) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verificarSenha(senha, hashArmazenado) {
    const [salt, hashEsperado] = (hashArmazenado || '').split(':');
    if (!salt || !hashEsperado) return false;
    const hash = crypto.scryptSync(senha, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(hashEsperado));
}

function lerUsuarios() {
    return readJSON(USUARIOS_FILE, { usuarios: [] });
}

// ── Rate limit simples em memória: 5 tentativas por 15 min por IP ──
const tentativas = new Map();
function rateLimitOk(ip) {
    const agora = Date.now();
    const registro = tentativas.get(ip) || { count: 0, resetAt: agora + 15 * 60 * 1000 };
    if (agora > registro.resetAt) {
        tentativas.set(ip, { count: 1, resetAt: agora + 15 * 60 * 1000 });
        return true;
    }
    registro.count++;
    tentativas.set(ip, registro);
    return registro.count <= 5;
}

// POST /api/auth/login
router.post('/login', (req, res) => {
    try {
        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
        if (!rateLimitOk(ip)) {
            return res.status(429).json({ success: false, error: 'Muitas tentativas. Aguarde 15 minutos.' });
        }

        const { usuario, senha } = req.body;
        if (!usuario || !senha) {
            return res.status(400).json({ success: false, error: 'Usuário e senha obrigatórios' });
        }

        const db = lerUsuarios();
        const u = db.usuarios.find(x => x.usuario.toLowerCase() === usuario.toLowerCase().trim());

        if (!u || !verificarSenha(senha, u.senha_hash)) {
            return res.status(401).json({ success: false, error: 'Usuário ou senha incorretos' });
        }

        // Reset rate limit em sucesso
        tentativas.delete(ip);

        const token = criarToken(u.usuario);
        setCookie(res, token);
        res.json({ success: true, usuario: u.usuario, nome: u.nome });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    limparCookie(res);
    res.json({ success: true });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
    const sessao = validarToken(lerCookie(req));
    if (!sessao) return res.status(401).json({ success: false });
    const db = lerUsuarios();
    const u = db.usuarios.find(x => x.usuario === sessao.u);
    res.json({ success: true, usuario: sessao.u, nome: u?.nome || sessao.u });
});

// ── Inicialização: cria usuário admin padrão se não existir nenhum ──
function initUsuarios() {
    const db = lerUsuarios();
    if (db.usuarios.length === 0) {
        const senhaInicial = process.env.ADMIN_SENHA || 'magic2026';
        db.usuarios.push({
            usuario: 'admin',
            nome: 'Administrador',
            senha_hash: hashSenha(senhaInicial),
            criado_em: new Date().toISOString(),
        });
        writeJSONAtomic(USUARIOS_FILE, db);
        console.log('[auth] Usuário admin criado (senha via ADMIN_SENHA no .env ou padrão)');
    }
}

module.exports = router;
module.exports.initUsuarios = initUsuarios;
module.exports.hashSenha = hashSenha;
