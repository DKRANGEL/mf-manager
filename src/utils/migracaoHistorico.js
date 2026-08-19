// ══════════════════════════════════════════════════════════════
// MIGRAÇÃO — LIMPEZA DO HISTÓRICO DE MOVIMENTOS (v1)
// Roda UMA vez (guardada por flag no volume de dados). Motivo: o
// comportamento antigo, ao editar um pedido (Aberto→Pendente→Aberto),
// gravava saída → entrada → saída, deixando lixo no histórico.
//
// Reconstrói cada pedido a partir do STATUS atual:
//   - emitido/concluido → UMA saída limpa (itens atuais, data da baixa)
//   - rascunho / inexistente → sem movimento (arquivo apagado)
// E remove entradas de qualquer outro arquivo (ex.: coletor).
// Resultado: histórico só com saídas reais, "como se nunca tivesse
// voltado para Aberto".
// ══════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const { readJSON, writeJSONAtomic } = require('./storage');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MOV_DIR = path.join(DATA_DIR, 'movimentos');
const PED_DIR = path.join(DATA_DIR, 'pedidos');
const CONT_DIR = path.join(DATA_DIR, 'contagens');
const FLAG = path.join(DATA_DIR, '.limpeza-historico-v1');
const FLAG_CONT = path.join(DATA_DIR, '.limpeza-contagens-legado-v1');

function qtdUnDoItem(item) {
    return item.qtd_un
        || (item.cx_100 ? item.cx_100 * 100 : null)
        || ((item.qtd || 1) * (item.fator || 1));
}

function saidasDoPedido(pedido) {
    const itens = (pedido.secoes || []).flatMap(s => s.itens || []);
    const data = pedido.data_baixa || pedido.data_emissao || pedido.data_atualizacao || new Date().toISOString();
    return itens
        .filter(i => i.codigo && !i.sem_valor)
        .map(i => ({
            codigo: i.codigo,
            descricao: i.descricao || i.nome || '',
            qtd_un: qtdUnDoItem(i),
            tipo: 'saida',
            origem: 'pedido',
            numero_pedido: pedido.numero,
            data,
        }));
}

function limparHistoricoV1() {
    try {
        if (fs.existsSync(FLAG)) return;
        if (!fs.existsSync(MOV_DIR)) { fs.writeFileSync(FLAG, new Date().toISOString()); return; }

        let reconstruidos = 0, removidos = 0, outrosLimpos = 0, entradasRemovidas = 0;

        for (const f of fs.readdirSync(MOV_DIR).filter(a => a.endsWith('.json'))) {
            const full = path.join(MOV_DIR, f);
            try {
                const mPed = f.match(/^(PED-\d{4}-\d+)\.json$/);
                if (mPed) {
                    const pedido = readJSON(path.join(PED_DIR, `${mPed[1]}.json`), null);
                    const st = pedido && pedido.status;
                    if (pedido && (st === 'emitido' || st === 'concluido')) {
                        writeJSONAtomic(full, { movimentos: saidasDoPedido(pedido) });
                        reconstruidos++;
                    } else {
                        fs.unlinkSync(full);
                        removidos++;
                    }
                } else {
                    // Coletor / outros: mantém só saídas
                    const log = readJSON(full, { movimentos: [] });
                    const antes = (log.movimentos || []).length;
                    const soSaidas = (log.movimentos || []).filter(m => m.tipo !== 'entrada');
                    if (soSaidas.length !== antes) {
                        entradasRemovidas += antes - soSaidas.length;
                        writeJSONAtomic(full, { movimentos: soSaidas });
                        outrosLimpos++;
                    }
                }
            } catch (e) {
                console.error(`[limpeza-historico-v1] erro em ${f}:`, e.message);
            }
        }

        fs.writeFileSync(FLAG, new Date().toISOString());
        console.log(`[limpeza-historico-v1] OK — pedidos reconstruídos: ${reconstruidos}, arquivos removidos: ${removidos}, coletor limpos: ${outrosLimpos}, entradas removidas: ${entradasRemovidas}`);
    } catch (err) {
        console.error('[limpeza-historico-v1] falhou:', err.message);
    }
}

// Apaga as contagens LEGADAS (a "meia boca" antiga, salva antes do recurso
// de contagem staged — não tem o campo `aplicada`). Contagens novas
// (aplicada: true/false) são preservadas. Roda uma vez.
function limparContagensLegadoV1() {
    try {
        if (fs.existsSync(FLAG_CONT)) return;
        if (!fs.existsSync(CONT_DIR)) { fs.writeFileSync(FLAG_CONT, new Date().toISOString()); return; }

        let apagadas = 0;
        for (const f of fs.readdirSync(CONT_DIR).filter(a => a.endsWith('.json'))) {
            try {
                const c = readJSON(path.join(CONT_DIR, f), null);
                // Legado = sem o campo `aplicada`. Novas contagens têm o campo → mantém.
                if (c && c.aplicada === undefined) { fs.unlinkSync(path.join(CONT_DIR, f)); apagadas++; }
            } catch (e) {
                console.error(`[limpeza-contagens-legado-v1] erro em ${f}:`, e.message);
            }
        }
        fs.writeFileSync(FLAG_CONT, new Date().toISOString());
        console.log(`[limpeza-contagens-legado-v1] OK — contagens legadas apagadas: ${apagadas}`);
    } catch (err) {
        console.error('[limpeza-contagens-legado-v1] falhou:', err.message);
    }
}

module.exports = { limparHistoricoV1, limparContagensLegadoV1 };
