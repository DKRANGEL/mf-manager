// ===================== MIDDLEWARE: CONTROLE DE ACESSO =====================
// Roda depois do requireAuth. Carrega as permissões do usuário logado e
// bloqueia páginas/APIs que ele não pode acessar. A segurança é aplicada
// AQUI no servidor — o frontend só esconde botões por cortesia.

const path = require('path');
const { readJSON } = require('../utils/storage');
const { resolverPermissoes } = require('../utils/permissoes');

const USUARIOS_FILE = path.join(__dirname, '..', 'data', 'usuarios.json');

// Página → tela necessária
const PAGINAS = {
    '/pedidos':      'pedidos',
    '/emitir':       'emitir',
    '/estoque':      'estoque',
    '/contagem':     'contagem',
    '/contagens':    'contagem',
    '/produtos':     'produtos',
    '/clientes':     'clientes',
    '/equipamentos': 'equipamentos',
    '/etiquetas':    'etiquetas',
    '/coletor':      'coletor',
    '/logs':         'movimentos',
};

function permissoesMiddleware(req, res, next) {
    // Sem usuário = rota pública (o requireAuth já deixou passar)
    if (!req.usuario) return next();

    const db = readJSON(USUARIOS_FILE, { usuarios: [] });
    const u = db.usuarios.find(x => x.usuario === req.usuario);
    const perm = resolverPermissoes(u);
    req.permissoes = perm;

    if (!perm) return next(); // usuário sumiu do arquivo — deixa o fluxo seguir e falhar adiante

    if (perm.admin) return next(); // admin passa por tudo

    const negarApi    = () => res.status(403).json({ success: false, error: 'Sem permissão para esta operação' });
    const negarPagina = () => res.redirect('/');

    const p = req.path;
    const m = req.method;

    // ── Páginas ──
    if (PAGINAS[p] !== undefined) {
        return perm.telas[PAGINAS[p]] ? next() : negarPagina();
    }
    if (p === '/auditoria') return negarPagina(); // só admin

    // ── APIs ──
    if (p.startsWith('/api/auditoria')) return negarApi(); // só admin (a rota valida de novo)

    if (p.startsWith('/api/pedidos')) {
        if (!perm.telas.pedidos) return negarApi();
        if (m === 'GET') return next();
        if (m === 'DELETE') return perm.pedidos.excluir ? next() : negarApi();
        if (/\/(baixa|concluir)$/.test(p)) return perm.pedidos.mudar_status ? next() : negarApi();
        // POST / e /parse, PUT /:numero — criação e edição
        return perm.pedidos.criar_editar ? next() : negarApi();
    }

    if (p.startsWith('/api/catalogo')) {
        // Leitura serve várias telas (emitir, etiquetas, contagem, coletor, produtos)
        if (m === 'GET') {
            const t = perm.telas;
            return (t.produtos || t.emitir || t.etiquetas || t.contagem || t.coletor) ? next() : negarApi();
        }
        // Etiquetas salva video_id via PUT /item/:id — permite com etiquetas OU produtos
        return (perm.telas.produtos || perm.telas.etiquetas) ? next() : negarApi();
    }

    if (p.startsWith('/api/clientes')) {
        // Leitura serve o emitir (autocomplete/preços) e o hall (agrupamento por cliente)
        if (m === 'GET') {
            const t = perm.telas;
            return (t.clientes || t.emitir || t.pedidos) ? next() : negarApi();
        }
        return perm.telas.clientes ? next() : negarApi();
    }

    if (p.startsWith('/api/estoque'))
        return (perm.telas.estoque || perm.telas.coletor) ? next() : negarApi();

    if (p.startsWith('/api/contagens'))
        return perm.telas.contagem ? next() : negarApi();

    if (p.startsWith('/api/equipamentos'))
        return perm.telas.equipamentos ? next() : negarApi();

    if (p.startsWith('/api/movimentos')) {
        if (m === 'POST') return perm.telas.coletor ? next() : negarApi();
        return perm.telas.movimentos ? next() : negarApi();
    }

    // Home, /perfil, /api/auth, estáticos, /data/produtos: liberados para logados
    next();
}

module.exports = { permissoesMiddleware };
