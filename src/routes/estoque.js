// ===================== ROTAS: ESTOQUE EM TEMPO REAL =====================
// GET /api/estoque/atual
//
// Calcula o saldo atual de cada produto usando:
//   baseline = última contagem APLICADA (cx * fator + un_avulsas)
//   movimentos = saídas de pedidos/coletor após a data da contagem
//   saldo_un = baseline - saídas   (o estoque só cai; não há entradas)
//
// Se não houver contagem aplicada, retorna baseline null e saldo 0 para todos.

const express = require('express');
const path = require('path');
const fs = require('fs');
const { readJSON } = require('../utils/storage');

const router = express.Router();

const DATA_DIR       = path.join(__dirname, '..', 'data');
const CONTAGENS_DIR  = path.join(DATA_DIR, 'contagens');
const MOVIMENTOS_DIR = path.join(DATA_DIR, 'movimentos');
const PRODUTOS_FILE  = path.join(DATA_DIR, 'produtos.json');

// ---- Helpers ----

// Base do estoque = contagem mais recente que já foi APLICADA.
// Contagens "staged" (aplicada:false) ficam guardadas mas não afetam o saldo.
// Contagem legada (sem o campo) conta como aplicada.
function ultimaContagem() {
    if (!fs.existsSync(CONTAGENS_DIR)) return null;
    const arquivos = fs.readdirSync(CONTAGENS_DIR)
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse();
    for (const f of arquivos) {
        const c = readJSON(path.join(CONTAGENS_DIR, f), null);
        if (c && c.aplicada !== false) return c;
    }
    return null;
}

function lerTodosMovimentos() {
    if (!fs.existsSync(MOVIMENTOS_DIR)) return [];
    const arquivos = fs.readdirSync(MOVIMENTOS_DIR).filter(f => f.endsWith('.json'));
    const todos = [];
    for (const arq of arquivos) {
        const log = readJSON(path.join(MOVIMENTOS_DIR, arq), { movimentos: [] });
        todos.push(...(log.movimentos || []));
    }
    return todos;
}

// ===================== GET /api/estoque/atual =====================

router.get('/atual', (req, res) => {
    try {
        const db = readJSON(PRODUTOS_FILE, { produtos: [] });
        const contagem = ultimaContagem();

        // Monta mapa de saldo baseado na contagem (baseline)
        // { codigo → { nome, categoria, fator, saldo_un } }
        const saldos = new Map();

        for (const p of db.produtos) {
            saldos.set(p.codigo, {
                codigo:    p.codigo,
                nome:      p.nome,
                categoria: p.categoria,
                fator:     p.fator || 1,
                saldo_un:  0,
            });
        }

        let totalMovimentos = 0;

        if (contagem) {
            // Aplica baseline da contagem
            for (const item of (contagem.itens || [])) {
                const entrada = saldos.get(item.codigo);
                if (entrada) {
                    entrada.saldo_un = item.total_un || 0;
                    if (item.fator) entrada.fator = item.fator;
                } else {
                    // Produto que estava na contagem mas saiu do catálogo
                    saldos.set(item.codigo, {
                        codigo:    item.codigo,
                        nome:      item.nome || item.codigo,
                        categoria: item.categoria || 'Sem categoria',
                        fator:     item.fator || 1,
                        saldo_un:  item.total_un || 0,
                    });
                }
            }

            // Aplica movimentos posteriores à data da contagem
            const baselineDate = new Date(contagem.data_criacao || contagem.data);
            const movimentos = lerTodosMovimentos().filter(m => new Date(m.data) > baselineDate);
            totalMovimentos = movimentos.length;

            // Só saídas descontam — o estoque só cai (entradas foram removidas do sistema).
            for (const mov of movimentos) {
                const entrada = saldos.get(mov.codigo);
                if (!entrada) continue;
                if (mov.tipo === 'saida') entrada.saldo_un -= (mov.qtd_un || 0);
            }
        }

        // Monta resposta final
        const produtos = Array.from(saldos.values()).map(p => ({
            ...p,
            saldo_cx_estimado: p.fator > 1 ? Math.floor(p.saldo_un / p.fator) : null,
            saldo_negativo:    p.saldo_un < 0,
        }));

        // Ordena: negativos primeiro, depois por categoria e código
        produtos.sort((a, b) => {
            if (a.saldo_negativo !== b.saldo_negativo) return a.saldo_negativo ? -1 : 1;
            const catCmp = (a.categoria || '').localeCompare(b.categoria || '');
            if (catCmp !== 0) return catCmp;
            return (a.codigo || '').localeCompare(b.codigo || '');
        });

        res.json({
            success: true,
            baseline: contagem ? {
                numero:         contagem.numero,
                data:           contagem.data,
                data_criacao:   contagem.data_criacao,
                responsavel:    contagem.responsavel,
            } : null,
            total_movimentos: totalMovimentos,
            total_produtos:   produtos.length,
            produtos,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
