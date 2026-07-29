// ===================== ROTAS: AUDITORIA (admin) =====================
// GET /api/auditoria?de=&ate=&usuario=&tipo=&q=

const express = require('express');
const path = require('path');
const fs = require('fs');
const { AUDIT_DIR } = require('../middleware/auditoria');
const { validarToken, lerCookie } = require('../middleware/sessao');
const { readJSON } = require('../utils/storage');

const router = express.Router();
const USUARIOS_FILE = path.join(__dirname, '..', 'data', 'usuarios.json');

function isAdminReq(req) {
    const sessao = validarToken(lerCookie(req));
    if (!sessao) return false;
    const db = readJSON(USUARIOS_FILE, { usuarios: [] });
    const u = db.usuarios.find(x => x.usuario === sessao.u);
    return !!u && (u.admin === true || u.usuario === 'admin');
}

router.get('/', (req, res) => {
    try {
        if (!isAdminReq(req)) {
            return res.status(403).json({ success: false, error: 'Acesso restrito ao administrador' });
        }

        const { de, ate, usuario, tipo, q } = req.query;

        if (!fs.existsSync(AUDIT_DIR)) return res.json({ success: true, data: [], total: 0 });

        let registros = [];
        for (const arq of fs.readdirSync(AUDIT_DIR).filter(f => f.endsWith('.json'))) {
            try {
                const dados = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, arq), 'utf8'));
                registros.push(...(dados.registros || []));
            } catch {}
        }

        registros.sort((a, b) => new Date(b.data) - new Date(a.data));

        if (de)      registros = registros.filter(r => r.data && r.data.slice(0, 10) >= de);
        if (ate)     registros = registros.filter(r => r.data && r.data.slice(0, 10) <= ate);
        if (usuario) registros = registros.filter(r => (r.usuario || '').toLowerCase().includes(usuario.toLowerCase()));
        if (tipo)    registros = registros.filter(r => r.tipo === tipo);
        if (q)       registros = registros.filter(r =>
            (r.acao || '').toLowerCase().includes(q.toLowerCase()) ||
            (r.detalhe || '').toLowerCase().includes(q.toLowerCase())
        );

        const total = registros.length;
        registros = registros.slice(0, 500); // limite de resposta

        res.json({ success: true, data: registros, total });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
