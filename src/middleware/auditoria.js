// ===================== AUDITORIA — trilha de ações por usuário =====================
// Middleware que registra automaticamente:
//  - Acessos às telas (GET nas páginas)
//  - Ações (POST/PUT/DELETE nas APIs) com rótulo humano
// Arquivos mensais em data/auditoria/AUDIT-YYYY-MM.json

const path = require('path');
const fs = require('fs');

const AUDIT_DIR = path.join(__dirname, '..', 'data', 'auditoria');

const PAGINAS = {
    '/':             'Home',
    '/pedidos':      'Pedidos',
    '/emitir':       'Emissão de Pedido',
    '/estoque':      'Estoque',
    '/contagem':     'Contagem',
    '/produtos':     'Produtos',
    '/equipamentos': 'Equipamentos',
    '/etiquetas':    'Etiquetas',
    '/coletor':      'Coletor',
    '/logs':         'Log de Movimentos',
    '/perfil':       'Perfil',
    '/auditoria':    'Auditoria',
};

// Regras: [método, regex da rota, função que gera rótulo/detalhe]
const REGRAS = [
    ['POST',   /^\/api\/pedidos\/?$/,                     (req) => ({ acao: 'Criou pedido', detalhe: req.body?.nome || req.body?.cliente || '' })],
    ['PUT',    /^\/api\/pedidos\/([^/]+)\/baixa$/,        (req, m) => ({ acao: req.body?.ativar ? 'Baixou estoque do pedido' : 'Reverteu baixa do pedido', detalhe: m[1] })],
    ['PUT',    /^\/api\/pedidos\/([^/]+)\/concluir$/,     (req, m) => ({ acao: req.body?.ativar ? 'Concluiu pedido' : 'Reabriu pedido', detalhe: m[1] })],
    ['PUT',    /^\/api\/pedidos\/([^/]+)$/,               (req, m) => ({ acao: 'Editou pedido', detalhe: m[1] })],
    ['DELETE', /^\/api\/pedidos\/([^/]+)$/,               (req, m) => ({ acao: 'Excluiu pedido', detalhe: m[1] })],

    ['POST',   /^\/api\/catalogo\/item$/,                 (req) => ({ acao: 'Criou produto', detalhe: `${req.body?.codigo || ''} ${req.body?.nome || ''}`.trim() })],
    ['PUT',    /^\/api\/catalogo\/item\/(\d+)\/imagem$/,  (req, m) => ({ acao: 'Alterou imagem de produto', detalhe: `id ${m[1]}` })],
    ['DELETE', /^\/api\/catalogo\/item\/(\d+)\/imagem$/,  (req, m) => ({ acao: 'Removeu imagem de produto', detalhe: `id ${m[1]}` })],
    ['PUT',    /^\/api\/catalogo\/item\/(\d+)$/,          (req, m) => ({ acao: 'Editou produto', detalhe: `${req.body?.codigo || 'id ' + m[1]}` })],
    ['DELETE', /^\/api\/catalogo\/item\/(\d+)$/,          (req, m) => ({ acao: 'Excluiu produto', detalhe: `id ${m[1]}` })],
    ['POST',   /^\/api\/catalogo\/importar-tiny$/,        () => ({ acao: 'Importou produtos do Tiny', detalhe: '' })],
    ['PUT',    /^\/api\/catalogo\/categoria\/renomear$/,  (req) => ({ acao: 'Renomeou categoria', detalhe: `${req.body?.categoria_atual || ''} → ${req.body?.categoria_nova || ''}` })],

    ['POST',   /^\/api\/contagens\/?$/,                   (req) => ({ acao: 'Registrou contagem de estoque', detalhe: `${(req.body?.itens || []).length} itens` })],
    ['POST',   /^\/api\/movimentos\/?$/,                  (req) => ({ acao: 'Registrou movimentos no coletor', detalhe: `${(req.body?.movimentos || []).length} itens` })],

    ['POST',   /^\/api\/equipamentos\/item$/,             (req) => ({ acao: 'Criou equipamento', detalhe: `${req.body?.sku || ''} ${req.body?.nome || ''}`.trim() })],
    ['PUT',    /^\/api\/equipamentos\/item\/(\d+)$/,      (req, m) => ({ acao: 'Editou equipamento', detalhe: `${req.body?.sku || 'id ' + m[1]}` })],
    ['DELETE', /^\/api\/equipamentos\/item\/(\d+)$/,      (req, m) => ({ acao: 'Excluiu equipamento', detalhe: `id ${m[1]}` })],

    ['PUT',    /^\/api\/auth\/senha$/,                    () => ({ acao: 'Trocou a própria senha', detalhe: '' })],
    ['POST',   /^\/api\/auth\/usuarios$/,                 (req) => ({ acao: 'Criou usuário', detalhe: req.body?.usuario || '' })],
    ['PUT',    /^\/api\/auth\/usuarios\/([^/]+)\/reset-senha$/, (req, m) => ({ acao: 'Resetou senha de usuário', detalhe: m[1] })],
    ['PUT',    /^\/api\/auth\/usuarios\/([^/]+)$/,        (req, m) => ({ acao: 'Editou usuário', detalhe: m[1] })],
    ['DELETE', /^\/api\/auth\/usuarios\/([^/]+)$/,        (req, m) => ({ acao: 'Excluiu usuário', detalhe: m[1] })],
    ['GET',    /^\/api\/auth\/usuarios\/([^/]+)\/senha$/, (req, m) => ({ acao: 'Visualizou senha de usuário', detalhe: m[1] })],
    ['POST',   /^\/api\/auth\/logout$/,                   () => ({ acao: 'Saiu do sistema', detalhe: '' })],
];

function registrar(entrada) {
    try {
        if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });
        const mes = new Date().toISOString().slice(0, 7); // YYYY-MM
        const arquivo = path.join(AUDIT_DIR, `AUDIT-${mes}.json`);
        const dados = fs.existsSync(arquivo)
            ? JSON.parse(fs.readFileSync(arquivo, 'utf8'))
            : { registros: [] };
        dados.registros.push(entrada);
        fs.writeFileSync(arquivo, JSON.stringify(dados));
    } catch (e) {
        console.error('[auditoria] erro ao registrar:', e.message);
    }
}

function auditoria(req, res, next) {
    // Sem usuário identificado (rota pública) — não audita
    if (!req.usuario) return next();

    const metodo = req.method;
    const rota = req.path;

    let evento = null;

    // Acesso a tela
    if (metodo === 'GET' && PAGINAS[rota]) {
        evento = { tipo: 'acesso', acao: `Acessou tela: ${PAGINAS[rota]}`, detalhe: '' };
    } else {
        // Ação de API
        for (const [m, regex, gerar] of REGRAS) {
            if (m !== metodo) continue;
            const match = rota.match(regex);
            if (match) {
                const { acao, detalhe } = gerar(req, match);
                evento = { tipo: 'acao', acao, detalhe };
                break;
            }
        }
    }

    if (!evento) return next();

    // Registra apenas se a operação teve sucesso
    res.on('finish', () => {
        if (res.statusCode < 400) {
            registrar({
                usuario: req.usuario,
                tipo: evento.tipo,
                acao: evento.acao,
                detalhe: evento.detalhe,
                metodo,
                rota,
                data: new Date().toISOString(),
            });
        }
    });

    next();
}

// Registra login manualmente (a rota de login é pública, req.usuario não existe)
function registrarLogin(usuario) {
    registrar({
        usuario,
        tipo: 'acao',
        acao: 'Entrou no sistema',
        detalhe: '',
        metodo: 'POST',
        rota: '/api/auth/login',
        data: new Date().toISOString(),
    });
}

module.exports = { auditoria, registrar, registrarLogin, AUDIT_DIR };
