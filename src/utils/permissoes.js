// ===================== PERMISSÕES — papéis e presets =====================
// Papéis: admin (tudo), owner (tudo exceto usuários/auditoria), operador
// (só pedidos, sem valores). Cada usuário guarda papel + permissoes; o
// admin pode customizar as permissões individualmente depois do preset.

const TELAS = ['pedidos', 'emitir', 'estoque', 'contagem', 'produtos', 'clientes', 'equipamentos', 'etiquetas', 'coletor', 'movimentos'];

const PAPEIS = {
    admin:    'Administrador',
    owner:    'Owner',
    operador: 'Operador',
};

function presetPermissoes(papel) {
    const telas = {};
    if (papel === 'admin' || papel === 'owner') {
        TELAS.forEach(t => telas[t] = true);
        return {
            telas,
            pedidos: { ver_valores: true, criar_editar: true, excluir: true, mudar_status: true },
        };
    }
    // operador — só a tela de pedidos, somente visualização, sem valores
    TELAS.forEach(t => telas[t] = false);
    telas.pedidos = true;
    return {
        telas,
        pedidos: { ver_valores: false, criar_editar: false, excluir: false, mudar_status: false },
    };
}

// Resolve as permissões efetivas de um usuário (objeto do usuarios.json).
// - admin (flag ou login 'admin'): sempre tudo, ignorando customizações
// - usuários legados sem papel: tratados como owner (nada quebra)
// - customizações em u.permissoes sobrescrevem o preset do papel
function resolverPermissoes(u) {
    if (!u) return null;
    const ehAdmin = u.admin === true || u.usuario === 'admin';
    if (ehAdmin) {
        return { papel: 'admin', admin: true, ...presetPermissoes('admin') };
    }
    const papel = PAPEIS[u.papel] ? u.papel : 'owner';
    const base = presetPermissoes(papel);
    const custom = u.permissoes || {};
    return {
        papel,
        admin: false,
        telas:   { ...base.telas,   ...(custom.telas   || {}) },
        pedidos: { ...base.pedidos, ...(custom.pedidos || {}) },
    };
}

module.exports = { TELAS, PAPEIS, presetPermissoes, resolverPermissoes };
