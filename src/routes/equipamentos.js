// ===================== ROTAS: ORDENS DE EQUIPAMENTO =====================
// CRUD de ordens (salvas em JSON) + config de responsáveis/locais
// + pesquisa de produtos/equipamentos no Tiny

const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDENS_DIR = path.join(DATA_DIR, 'ordens');
const CONFIG_FILE = path.join(DATA_DIR, 'config-equipamentos.json');

// Garante que as pastas existem
if (!fs.existsSync(ORDENS_DIR)) fs.mkdirSync(ORDENS_DIR, {recursive: true});

// ---- Helpers ----

function lerConfig() {
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch {
        const padrao = {
            responsaveis_entrega: [],
            responsaveis_equipamento: [],
            locais_frequentes: [],
            eventos_recentes: [],
            proximo_numero: 1
        };
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(padrao, null, 2));
        return padrao;
    }
}

function salvarConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

function gerarNumeroOS(cfg) {
    const ano = new Date().getFullYear();
    const num = String(cfg.proximo_numero).padStart(3, '0');
    cfg.proximo_numero++;
    salvarConfig(cfg);
    return `OS-${ano}-${num}`;
}

function adicionarSeNovo(lista, valor) {
    if (valor && !lista.includes(valor)) {
        lista.push(valor);
        // Mantém no máximo 50 itens recentes
        if (lista.length > 50) lista.shift();
    }
}

// ===================== CONFIG =====================

// GET /api/equipamentos/config — retorna listas pra popular selects
router.get('/config', (req, res) => {
    const cfg = lerConfig();
    res.json({
        success: true,
        data: {
            responsaveis_entrega: cfg.responsaveis_entrega,
            responsaveis_equipamento: cfg.responsaveis_equipamento,
            locais_frequentes: cfg.locais_frequentes,
            eventos_recentes: cfg.eventos_recentes
        }
    });
});

// POST /api/equipamentos/config — atualiza listas
router.post('/config', (req, res) => {
    try {
        const cfg = lerConfig();
        const body = req.body;
        if (body.responsaveis_entrega) cfg.responsaveis_entrega = body.responsaveis_entrega;
        if (body.responsaveis_equipamento) cfg.responsaveis_equipamento = body.responsaveis_equipamento;
        if (body.locais_frequentes) cfg.locais_frequentes = body.locais_frequentes;
        if (body.eventos_recentes) cfg.eventos_recentes = body.eventos_recentes;
        salvarConfig(cfg);
        res.json({success: true});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== ORDENS (CRUD) =====================

// POST /api/equipamentos/ordens — cria nova ordem
router.post('/ordens', (req, res) => {
    try {
        const cfg = lerConfig();
        const numero = gerarNumeroOS(cfg);
        const ordem = {
            numero,
            evento: req.body.evento || '',
            local: req.body.local || '',
            data_saida: req.body.data_saida || '',
            data_retorno: req.body.data_retorno || '',
            responsavel_entrega: req.body.responsavel_entrega || '',
            responsavel_equipamento: req.body.responsavel_equipamento || '',
            status: 'aberta',
            itens: req.body.itens || [],
            observacoes: req.body.observacoes || '',
            data_criacao: new Date().toISOString(),
            data_atualizacao: new Date().toISOString()
        };

        // Salva JSON
        const arquivo = path.join(ORDENS_DIR, `${numero}.json`);
        fs.writeFileSync(arquivo, JSON.stringify(ordem, null, 2));

        // Atualiza listas de config com novos valores
        adicionarSeNovo(cfg.responsaveis_entrega, ordem.responsavel_entrega);
        adicionarSeNovo(cfg.responsaveis_equipamento, ordem.responsavel_equipamento);
        adicionarSeNovo(cfg.locais_frequentes, ordem.local);
        adicionarSeNovo(cfg.eventos_recentes, ordem.evento);
        salvarConfig(cfg);

        res.json({success: true, data: ordem});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/equipamentos/ordens — lista todas as ordens
router.get('/ordens', (req, res) => {
    try {
        const arquivos = fs.readdirSync(ORDENS_DIR).filter(f => f.endsWith('.json'));
        const ordens = arquivos.map(f => {
            const dados = JSON.parse(fs.readFileSync(path.join(ORDENS_DIR, f), 'utf8'));
            return {
                numero: dados.numero,
                evento: dados.evento,
                local: dados.local,
                data_saida: dados.data_saida,
                status: dados.status,
                data_criacao: dados.data_criacao
            };
        });
        // Ordena por data de criação (mais recente primeiro)
        ordens.sort((a, b) => (b.data_criacao || '').localeCompare(a.data_criacao || ''));
        res.json({success: true, data: ordens});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/equipamentos/ordens/:numero — obter ordem específica
router.get('/ordens/:numero', (req, res) => {
    try {
        const numero = req.params.numero;
        const arquivo = path.join(ORDENS_DIR, `${numero}.json`);
        if (!fs.existsSync(arquivo)) {
            return res.status(404).json({success: false, error: `Ordem ${numero} não encontrada`});
        }
        const ordem = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        res.json({success: true, data: ordem});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/equipamentos/ordens/:numero — atualiza ordem (ex: registrar retorno)
router.put('/ordens/:numero', (req, res) => {
    try {
        const numero = req.params.numero;
        const arquivo = path.join(ORDENS_DIR, `${numero}.json`);
        if (!fs.existsSync(arquivo)) {
            return res.status(404).json({success: false, error: `Ordem ${numero} não encontrada`});
        }
        const ordemAtual = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
        const atualizada = {
            ...ordemAtual,
            ...req.body,
            numero: ordemAtual.numero, // Não permite mudar o número
            data_criacao: ordemAtual.data_criacao, // Não permite mudar data de criação
            data_atualizacao: new Date().toISOString()
        };
        fs.writeFileSync(arquivo, JSON.stringify(atualizada, null, 2));
        res.json({success: true, data: atualizada});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== BUSCA DE EQUIPAMENTOS (LOCAL) =====================

const EQUIPAMENTOS_FILE = path.join(DATA_DIR, 'equipamentos.json');

function lerEquipamentos() {
    try {
        return JSON.parse(fs.readFileSync(EQUIPAMENTOS_FILE, 'utf8'));
    } catch {
        const padrao = {proximo_id: 1, equipamentos: []};
        fs.writeFileSync(EQUIPAMENTOS_FILE, JSON.stringify(padrao, null, 2));
        return padrao;
    }
}

function salvarEquipamentos(db) {
    fs.writeFileSync(EQUIPAMENTOS_FILE, JSON.stringify(db, null, 2));
}

// GET /api/equipamentos/produtos?q=cabo — pesquisa equipamentos locais
router.get('/produtos', (req, res) => {
    try {
        const db = lerEquipamentos();
        const q = (req.query.q || '').toLowerCase().trim();
        const cat = (req.query.categoria || '').toLowerCase().trim();

        let resultados = db.equipamentos;

        if (q) {
            resultados = resultados.filter(e =>
                e.nome.toLowerCase().includes(q) ||
                e.sku.toLowerCase().includes(q) ||
                e.categoria.toLowerCase().includes(q)
            );
        }

        if (cat) {
            resultados = resultados.filter(e => e.categoria.toLowerCase() === cat);
        }

        res.json({success: true, data: resultados});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/equipamentos/categorias — lista categorias distintas
router.get('/categorias', (req, res) => {
    try {
        const db = lerEquipamentos();
        const categorias = [...new Set(db.equipamentos.map(e => e.categoria))].sort();
        res.json({success: true, data: categorias});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/equipamentos/catalogo — lista completa agrupada por categoria
router.get('/catalogo', (req, res) => {
    try {
        const db = lerEquipamentos();
        const agrupado = {};
        db.equipamentos.forEach(e => {
            if (!agrupado[e.categoria]) agrupado[e.categoria] = [];
            agrupado[e.categoria].push(e);
        });
        // Ordena por SKU dentro de cada categoria
        Object.values(agrupado).forEach(lista => lista.sort((a, b) => a.sku.localeCompare(b.sku)));
        res.json({success: true, data: agrupado, total: db.equipamentos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// POST /api/equipamentos/item — adicionar novo equipamento
router.post('/item', (req, res) => {
    try {
        const db = lerEquipamentos();
        const novo = {
            id: db.proximo_id++,
            sku: req.body.sku || '',
            nome: req.body.nome || '',
            categoria: req.body.categoria || 'Sem Categoria',
            quantidade: parseInt(req.body.quantidade) || 0,
            em_manutencao: parseInt(req.body.em_manutencao) || 0,
            observacoes: req.body.observacoes || '',
            data_cadastro: new Date().toISOString().split('T')[0]
        };

        // Verifica SKU duplicado
        if (novo.sku && db.equipamentos.find(e => e.sku === novo.sku)) {
            return res.status(400).json({success: false, error: `SKU ${novo.sku} já existe`});
        }

        db.equipamentos.push(novo);
        salvarEquipamentos(db);
        res.json({success: true, data: novo});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/equipamentos/item/:id — atualizar equipamento
router.put('/item/:id', (req, res) => {
    try {
        const db = lerEquipamentos();
        const id = parseInt(req.params.id);
        const idx = db.equipamentos.findIndex(e => e.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Equipamento não encontrado'});

        const atual = db.equipamentos[idx];
        db.equipamentos[idx] = {
            ...atual,
            nome: req.body.nome !== undefined ? req.body.nome : atual.nome,
            sku: req.body.sku !== undefined ? req.body.sku : atual.sku,
            categoria: req.body.categoria !== undefined ? req.body.categoria : atual.categoria,
            quantidade: req.body.quantidade !== undefined ? parseInt(req.body.quantidade) : atual.quantidade,
            em_manutencao: req.body.em_manutencao !== undefined ? parseInt(req.body.em_manutencao) : atual.em_manutencao,
            observacoes: req.body.observacoes !== undefined ? req.body.observacoes : atual.observacoes
        };

        salvarEquipamentos(db);
        res.json({success: true, data: db.equipamentos[idx]});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/equipamentos/item/:id — remover equipamento
router.delete('/item/:id', (req, res) => {
    try {
        const db = lerEquipamentos();
        const id = parseInt(req.params.id);
        const idx = db.equipamentos.findIndex(e => e.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Equipamento não encontrado'});

        const removido = db.equipamentos.splice(idx, 1)[0];
        salvarEquipamentos(db);
        res.json({success: true, data: removido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;
