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

// ── Cifra reversível AES-256-GCM (chave SENHA_CRYPT_KEY no .env) ──
// Permite ao admin visualizar senhas. Sem a chave no env, o recurso fica off
// e o arquivo de usuários permanece ilegível.
function chaveCrypt() {
    const k = process.env.SENHA_CRYPT_KEY;
    if (!k) return null;
    return crypto.createHash('sha256').update(k).digest(); // 32 bytes
}

function cifrarSenha(senha) {
    const key = chaveCrypt();
    if (!key) return null;
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(senha, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decifrarSenha(cifrada) {
    const key = chaveCrypt();
    if (!key || !cifrada) return null;
    try {
        const [ivB, tagB, encB] = cifrada.split(':');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB, 'base64'));
        decipher.setAuthTag(Buffer.from(tagB, 'base64'));
        return Buffer.concat([decipher.update(Buffer.from(encB, 'base64')), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

// Define hash + cópia cifrada de uma vez
function armazenarSenha(u, senha) {
    u.senha_hash = hashSenha(senha);
    u.senha_cifrada = cifrarSenha(senha);
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

        // Backfill: se ainda não há cópia cifrada e a chave existe, grava agora
        if (!u.senha_cifrada && chaveCrypt()) {
            const dbAtual = lerUsuarios();
            const idxU = dbAtual.usuarios.findIndex(x => x.usuario === u.usuario);
            if (idxU !== -1) {
                dbAtual.usuarios[idxU].senha_cifrada = cifrarSenha(senha);
                writeJSONAtomic(USUARIOS_FILE, dbAtual);
            }
        }

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
    res.json({ success: true, usuario: sessao.u, nome: u?.nome || sessao.u, admin: isAdmin(u) });
});

// ── Helpers de permissão ──
function isAdmin(u) {
    return !!u && (u.admin === true || u.usuario === 'admin');
}

function getUsuarioLogado(req) {
    const sessao = validarToken(lerCookie(req));
    if (!sessao) return null;
    const db = lerUsuarios();
    return db.usuarios.find(x => x.usuario === sessao.u) || null;
}

const SENHA_PADRAO = 'magic2026';

// PUT /api/auth/senha — usuário logado troca a própria senha
router.put('/senha', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!logado) return res.status(401).json({ success: false, error: 'Não autenticado' });

        const { senha_atual, senha_nova } = req.body;
        if (!senha_atual || !senha_nova) {
            return res.status(400).json({ success: false, error: 'Senha atual e nova são obrigatórias' });
        }
        if (senha_nova.length < 6) {
            return res.status(400).json({ success: false, error: 'A nova senha precisa de pelo menos 6 caracteres' });
        }
        if (!verificarSenha(senha_atual, logado.senha_hash)) {
            return res.status(401).json({ success: false, error: 'Senha atual incorreta' });
        }

        const db = lerUsuarios();
        const idx = db.usuarios.findIndex(x => x.usuario === logado.usuario);
        armazenarSenha(db.usuarios[idx], senha_nova);
        db.usuarios[idx].senha_alterada_em = new Date().toISOString();
        writeJSONAtomic(USUARIOS_FILE, db);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/auth/usuarios — lista usuários (admin)
router.get('/usuarios', (req, res) => {
    const logado = getUsuarioLogado(req);
    if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

    const db = lerUsuarios();
    const lista = db.usuarios.map(u => ({
        usuario: u.usuario,
        nome: u.nome,
        admin: isAdmin(u),
        criado_em: u.criado_em,
        senha_alterada_em: u.senha_alterada_em || null,
    }));
    res.json({ success: true, data: lista });
});

// POST /api/auth/usuarios — cria usuário com senha padrão (admin)
router.post('/usuarios', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

        const usuario = (req.body.usuario || '').toLowerCase().trim().replace(/\s+/g, '');
        const nome = (req.body.nome || '').trim();

        if (!usuario || !nome) return res.status(400).json({ success: false, error: 'Usuário e nome são obrigatórios' });
        if (!/^[a-z0-9._-]{3,20}$/.test(usuario)) {
            return res.status(400).json({ success: false, error: 'Usuário: 3-20 caracteres, apenas letras minúsculas, números, ponto, hífen' });
        }

        const db = lerUsuarios();
        if (db.usuarios.find(x => x.usuario === usuario)) {
            return res.status(400).json({ success: false, error: `Usuário "${usuario}" já existe` });
        }

        const novoUsuario = {
            usuario,
            nome,
            admin: !!req.body.admin,
            criado_em: new Date().toISOString(),
        };
        armazenarSenha(novoUsuario, SENHA_PADRAO);
        db.usuarios.push(novoUsuario);
        writeJSONAtomic(USUARIOS_FILE, db);

        res.json({ success: true, usuario, senha_padrao: SENHA_PADRAO });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/auth/usuarios/:usuario/senha — revela a senha do usuário (admin)
// Requer SENHA_CRYPT_KEY no .env. Sem a chave, retorna indisponível.
router.get('/usuarios/:usuario/senha', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

        if (!chaveCrypt()) {
            return res.status(503).json({ success: false, error: 'SENHA_CRYPT_KEY não configurada no servidor' });
        }

        const db = lerUsuarios();
        const u = db.usuarios.find(x => x.usuario === req.params.usuario);
        if (!u) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        const senha = decifrarSenha(u.senha_cifrada);
        if (senha === null) {
            return res.status(404).json({
                success: false,
                error: 'Senha não disponível — será registrada no próximo login ou troca de senha deste usuário'
            });
        }

        res.json({ success: true, senha });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/auth/usuarios/:usuario — edita usuário: nome, login, admin, senha (admin)
router.put('/usuarios/:usuario', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

        const db = lerUsuarios();
        const idx = db.usuarios.findIndex(x => x.usuario === req.params.usuario);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        const u = db.usuarios[idx];
        const { nome, novo_usuario, admin, senha } = req.body;

        // Renomear login
        if (novo_usuario !== undefined && novo_usuario !== u.usuario) {
            const novoLogin = novo_usuario.toLowerCase().trim().replace(/\s+/g, '');
            if (u.usuario === 'admin') {
                return res.status(400).json({ success: false, error: 'O login do usuário admin não pode ser alterado' });
            }
            if (!/^[a-z0-9._-]{3,20}$/.test(novoLogin)) {
                return res.status(400).json({ success: false, error: 'Login inválido: 3-20 caracteres, letras minúsculas, números, ponto, hífen' });
            }
            if (db.usuarios.find(x => x.usuario === novoLogin)) {
                return res.status(400).json({ success: false, error: `Login "${novoLogin}" já existe` });
            }
            u.usuario = novoLogin;
        }

        // Nome
        if (nome !== undefined && nome.trim()) u.nome = nome.trim();

        // Flag admin (não pode remover admin do usuário 'admin' nem de si mesmo)
        if (admin !== undefined) {
            if (u.usuario === 'admin' && !admin) {
                return res.status(400).json({ success: false, error: 'O usuário admin não pode perder privilégios' });
            }
            if (u.usuario === logado.usuario && !admin) {
                return res.status(400).json({ success: false, error: 'Você não pode remover seus próprios privilégios' });
            }
            u.admin = !!admin;
        }

        // Nova senha (opcional — em branco mantém a atual)
        if (senha !== undefined && senha !== '') {
            if (senha.length < 6) {
                return res.status(400).json({ success: false, error: 'A senha precisa de pelo menos 6 caracteres' });
            }
            armazenarSenha(u, senha);
            u.senha_alterada_em = new Date().toISOString();
        }

        writeJSONAtomic(USUARIOS_FILE, db);
        res.json({ success: true, usuario: u.usuario });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/auth/usuarios/:usuario/reset-senha — reseta para senha padrão (admin)
router.put('/usuarios/:usuario/reset-senha', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

        const db = lerUsuarios();
        const idx = db.usuarios.findIndex(x => x.usuario === req.params.usuario);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        armazenarSenha(db.usuarios[idx], SENHA_PADRAO);
        db.usuarios[idx].senha_alterada_em = null;
        writeJSONAtomic(USUARIOS_FILE, db);

        res.json({ success: true, senha_padrao: SENHA_PADRAO });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/auth/usuarios/:usuario — remove usuário (admin)
router.delete('/usuarios/:usuario', (req, res) => {
    try {
        const logado = getUsuarioLogado(req);
        if (!isAdmin(logado)) return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });

        const alvo = req.params.usuario;
        if (alvo === logado.usuario) return res.status(400).json({ success: false, error: 'Você não pode excluir a si mesmo' });
        if (alvo === 'admin') return res.status(400).json({ success: false, error: 'O usuário admin não pode ser excluído' });

        const db = lerUsuarios();
        const idx = db.usuarios.findIndex(x => x.usuario === alvo);
        if (idx === -1) return res.status(404).json({ success: false, error: 'Usuário não encontrado' });

        db.usuarios.splice(idx, 1);
        writeJSONAtomic(USUARIOS_FILE, db);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Inicialização: cria usuário admin padrão se não existir nenhum ──
function initUsuarios() {
    const db = lerUsuarios();
    if (db.usuarios.length === 0) {
        const senhaInicial = process.env.ADMIN_SENHA || 'magic2026';
        const adminUser = {
            usuario: 'admin',
            nome: 'Administrador',
            criado_em: new Date().toISOString(),
        };
        armazenarSenha(adminUser, senhaInicial);
        db.usuarios.push(adminUser);
        writeJSONAtomic(USUARIOS_FILE, db);
        console.log('[auth] Usuário admin criado (senha via ADMIN_SENHA no .env ou padrão)');
    }
}

module.exports = router;
module.exports.initUsuarios = initUsuarios;
module.exports.hashSenha = hashSenha;
