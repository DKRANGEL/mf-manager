// ===================== ROTAS: CATÁLOGO DE PRODUTOS PRÓPRIO =====================
// CRUD de produtos salvos em data/produtos.json (storage atômico)
// Catálogo 100% gerido neste sistema.
//
// Montado em /api/catalogo — NÃO em /api/produtos, pra não colidir com
// /api/produtos/estoque que vive no routes/api.js.

const express = require('express');
const path = require('path');
const fs = require('fs');

const {readJSON, writeJSONAtomic} = require('../utils/storage');

const router = express.Router();

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUTOS_FILE = path.join(DATA_DIR, 'produtos.json');

// ---- Helpers ----

function categoriaDoCodigo(codigo) {
    if (!codigo) return 'Sem categoria';
    const match = codigo.split(/[-_]/)[0];
    return match || 'Sem categoria';
}

// ---- Código: identidade imutável ----
// O código é a chave que liga produto ↔ pedidos, contagens, movimentos, imagens
// e os QR das etiquetas JÁ IMPRESSAS nas caixas. Por isso ele nasce uma vez e
// nunca mais muda (o PUT ignora qualquer tentativa de alterá-lo). Para organizar
// visualmente usa-se o campo `ordem`, que é livre e não quebra nada.

const prefixoDoCodigo = (codigo) => String(codigo || '').split(/[-_]/)[0];
const numeroDoCodigo = (codigo) => {
    const parte = String(codigo || '').split(/[-_]/).slice(1).join('-');
    const n = parseInt(parte, 10);
    return isNaN(n) ? null : n;
};

// Prefixo de uma categoria = o mais usado entre os produtos dela.
// Categoria nova (sem produtos) → null, aí o usuário informa o código na mão.
function prefixoDaCategoria(db, categoria) {
    const cat = String(categoria || '').trim();
    if (!cat) return null;
    const contagem = {};
    for (const p of db.produtos) {
        if ((p.categoria || '') !== cat) continue;
        const pre = prefixoDoCodigo(p.codigo);
        if (pre) contagem[pre] = (contagem[pre] || 0) + 1;
    }
    const top = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : null;
}

// Próximo código da categoria: prefixo + (maior número do prefixo + 1), 3 dígitos.
// Olha TODOS os produtos do prefixo (não só os da categoria) para nunca colidir.
function proximoCodigo(db, categoria) {
    const pre = prefixoDaCategoria(db, categoria);
    if (!pre) return null;
    let maior = 0;
    for (const p of db.produtos) {
        if (prefixoDoCodigo(p.codigo) !== pre) continue;
        const n = numeroDoCodigo(p.codigo);
        if (n !== null && n > maior) maior = n;
    }
    const usados = new Set(db.produtos.map(p => p.codigo));
    let n = maior + 1;
    let cod = `${pre}-${String(n).padStart(3, '0')}`;
    while (usados.has(cod)) cod = `${pre}-${String(++n).padStart(3, '0')}`;
    return cod;
}

function lerProdutos() {
    return readJSON(PRODUTOS_FILE, {proximo_id: 1, produtos: []});
}

function salvarProdutos(db) {
    writeJSONAtomic(PRODUTOS_FILE, db);
}

// ===================== LISTAGEM =====================

// GET /api/catalogo/catalogo — lista completa agrupada por categoria
router.get('/catalogo', (req, res) => {
    try {
        const db = lerProdutos();
        const agrupado = {};
        db.produtos.forEach(p => {
            const cat = p.categoria || 'Sem categoria';
            if (!agrupado[cat]) agrupado[cat] = [];
            agrupado[cat].push(p);
        });
        // Ordem manual (arrastada pelo admin) manda; quem ainda não tem `ordem`
        // cai depois, em ordem de código — assim nada "pula" antes da 1ª arrastada.
        Object.values(agrupado).forEach(lista =>
            lista.sort((a, b) => {
                const oa = a.ordem, ob = b.ordem;
                if (oa != null && ob != null && oa !== ob) return oa - ob;
                if (oa != null && ob == null) return -1;
                if (oa == null && ob != null) return 1;
                return (a.codigo || '').localeCompare(b.codigo || '');
            })
        );
        res.json({success: true, data: agrupado, total: db.produtos.length});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/catalogo/proximo-codigo?categoria=INSUMOS — sugere o próximo código
// da categoria (prefixo + sequencial). Usado pelo modal de novo produto.
router.get('/proximo-codigo', (req, res) => {
    try {
        const db = lerProdutos();
        const categoria = (req.query.categoria || '').trim();
        const codigo = proximoCodigo(db, categoria);
        res.json({
            success: true,
            codigo,                                  // null se a categoria é nova
            prefixo: prefixoDaCategoria(db, categoria),
        });
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/ordem — salva a ordem de exibição (arrasta-e-solta).
// Só admin. Recebe { ids: [12, 7, 30, ...] } na ordem desejada; grava `ordem`
// sequencial nesses produtos. NÃO toca em código algum.
router.put('/ordem', (req, res) => {
    try {
        if (!req.permissoes?.admin) {
            return res.status(403).json({success: false, error: 'Apenas administradores podem reordenar o catálogo'});
        }
        const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
        if (!ids || !ids.length) {
            return res.status(400).json({success: false, error: 'Envie a lista de ids na nova ordem'});
        }

        const db = lerProdutos();
        const porId = new Map(db.produtos.map(p => [p.id, p]));
        // A listagem ordena DENTRO de cada categoria, então 1..N por lista basta —
        // não há risco de embaralhar as outras categorias.
        let n = 0, aplicados = 0;
        for (const id of ids) {
            const p = porId.get(id);
            if (!p) continue;
            p.ordem = ++n;
            aplicados++;
        }
        if (!aplicados) return res.status(404).json({success: false, error: 'Nenhum produto encontrado'});

        salvarProdutos(db);
        res.json({success: true, total: aplicados});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// ===================== CRUD =====================

// POST /api/catalogo/item — cria produto
router.post('/item', (req, res) => {
    try {
        const db = lerProdutos();
        const categoria = (req.body.categoria || '').trim();

        // Código em branco → gera sequencial a partir do prefixo da categoria
        // (INSUMOS → INS-033). Se a categoria é nova, não há prefixo: exige o código.
        let codigo = (req.body.codigo || '').trim();
        if (!codigo) {
            codigo = proximoCodigo(db, categoria) || '';
            if (!codigo) {
                return res.status(400).json({
                    success: false,
                    error: 'Categoria nova ainda não tem prefixo — informe o código do primeiro produto (ex.: XYZ-001)'
                });
            }
        }

        if (db.produtos.find(p => p.codigo === codigo)) {
            return res.status(400).json({success: false, error: `Código ${codigo} já existe`});
        }

        const novo = {
            id: db.proximo_id++,
            codigo,
            nome: (req.body.nome || '').trim(),
            categoria: categoria || categoriaDoCodigo(codigo),
            preco: parseFloat(req.body.preco) || 0,
            unidade: (req.body.unidade || 'UN').trim(),
            fator: Math.max(1, parseInt(req.body.fator) || 1),
            observacoes: (req.body.observacoes || '').trim(),
            video_id: (req.body.video_id || '').trim(),
            data_cadastro: new Date().toISOString().split('T')[0],
            // Nasce no fim da categoria; o admin arrasta para o lugar certo depois.
            ordem: db.produtos.reduce((m, p) => Math.max(m, p.ordem || 0), 0) + 1
        };

        db.produtos.push(novo);
        salvarProdutos(db);
        res.json({success: true, data: novo});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/item/:id — atualiza produto
router.put('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const atual = db.produtos[idx];

        // CÓDIGO É IMUTÁVEL. Ele identifica o produto em pedidos, contagens,
        // movimentos, no nome do arquivo de imagem e nos QR já impressos nas
        // caixas — renomear desconectaria o histórico silenciosamente.
        // Tentativa de mudar é rejeitada (não ignorada, pra ninguém achar que salvou).
        if (req.body.codigo !== undefined && String(req.body.codigo).trim() !== atual.codigo) {
            return res.status(400).json({
                success: false,
                error: 'O código do produto não pode ser alterado — ele liga o produto ao histórico de pedidos, contagens e às etiquetas QR já impressas.'
            });
        }

        db.produtos[idx] = {
            ...atual,
            codigo: atual.codigo,
            nome: req.body.nome !== undefined ? req.body.nome.trim() : atual.nome,
            // Categoria explícita (select) tem prioridade; senão MANTÉM a atual
            // (não reseta pelo código — era o bug que jogava o produto de volta).
            categoria: (req.body.categoria !== undefined && String(req.body.categoria).trim())
                ? String(req.body.categoria).trim()
                : (atual.categoria || categoriaDoCodigo(atual.codigo)),
            preco: req.body.preco !== undefined ? (parseFloat(req.body.preco) || 0) : atual.preco,
            unidade: req.body.unidade !== undefined ? req.body.unidade.trim() : atual.unidade,
            fator: req.body.fator !== undefined ? Math.max(1, parseInt(req.body.fator) || 1) : (atual.fator || 1),
            observacoes: req.body.observacoes !== undefined ? req.body.observacoes.trim() : atual.observacoes,
            video_id: req.body.video_id !== undefined ? req.body.video_id.trim() : (atual.video_id || '')
        };

        salvarProdutos(db);
        res.json({success: true, data: db.produtos[idx]});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// DELETE /api/catalogo/item/:id — remove produto
router.delete('/item/:id', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const removido = db.produtos.splice(idx, 1)[0];
        salvarProdutos(db);
        res.json({success: true, data: removido});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// PUT /api/catalogo/categoria/renomear — renomeia categoria em todos os produtos
router.put('/categoria/renomear', (req, res) => {
    try {
        const { categoria_atual, categoria_nova } = req.body;
        if (!categoria_atual || !categoria_nova) {
            return res.status(400).json({ success: false, error: 'categoria_atual e categoria_nova são obrigatórios' });
        }
        const db = lerProdutos();
        let atualizados = 0;
        db.produtos.forEach(p => {
            if (p.categoria === categoria_atual) {
                p.categoria = categoria_nova;
                atualizados++;
            }
        });
        if (atualizados === 0) {
            return res.status(404).json({ success: false, error: `Categoria "${categoria_atual}" não encontrada` });
        }
        salvarProdutos(db);
        res.json({ success: true, atualizados, categoria_nova });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/catalogo/categoria/:nome — remove a categoria movendo seus
// produtos para "Sem categoria" (os produtos NÃO são apagados).
router.delete('/categoria/:nome', (req, res) => {
    try {
        const nome = req.params.nome;
        const db = lerProdutos();
        let movidos = 0;
        db.produtos.forEach(p => {
            if ((p.categoria || 'Sem categoria') === nome) {
                p.categoria = '';
                movidos++;
            }
        });
        salvarProdutos(db);
        res.json({ success: true, movidos });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

const multer = require('multer');
const os = require('os');
const PRODUTOS_IMG_DIR = path.join(__dirname, '..', 'data', 'produtos');

// Temp dir separado — evita arquivos temporários poluindo a pasta de imagens
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB (Nginx já limita a 10m)
    fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowed.includes(file.mimetype)) {
            return cb(new Error('Formato inválido. Use JPG, PNG ou WEBP.'));
        }
        cb(null, true);
    }
});

function limparTemp(filepath) {
    try { if (filepath && fs.existsSync(filepath)) fs.unlinkSync(filepath); } catch {}
}

// PUT /api/catalogo/item/:id/imagem
router.put('/item/:id/imagem', upload.single('imagem'), (req, res) => {
    const tempPath = req.file?.path;
    try {
        if (!req.file || !tempPath) {
            return res.status(400).json({ success: false, error: 'Nenhum arquivo enviado' });
        }

        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);

        if (idx === -1) {
            limparTemp(tempPath);
            return res.status(404).json({ success: false, error: 'Produto não encontrado' });
        }

        if (!fs.existsSync(PRODUTOS_IMG_DIR)) fs.mkdirSync(PRODUTOS_IMG_DIR, { recursive: true });

        // Determina extensão — prioriza mimetype (mais seguro que o nome original)
        const mimeToExt = { 'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
        const ext = mimeToExt[req.file.mimetype] || path.extname(req.file.originalname).toLowerCase() || '.jpg';

        const codigoSafe = db.produtos[idx].codigo.replace(/[^a-zA-Z0-9_\-.]/g, '_');
        const nomeArquivo = `${codigoSafe}${ext}`;
        const destFinal = path.join(PRODUTOS_IMG_DIR, nomeArquivo);

        // Remove imagem anterior de extensão diferente (evita duplicatas .jpg e .png)
        const imagemAnterior = db.produtos[idx].imagem;
        if (imagemAnterior && imagemAnterior !== nomeArquivo) {
            limparTemp(path.join(PRODUTOS_IMG_DIR, imagemAnterior));
        }
        // Remove também qualquer versão antiga com extensão diferente
        ['.jpg', '.jpeg', '.png', '.webp', '.gif'].forEach(e => {
            if (e !== ext) limparTemp(path.join(PRODUTOS_IMG_DIR, `${codigoSafe}${e}`));
        });

        // Copia do temp para destino (copyFile é seguro cross-filesystem, ao contrário de rename)
        fs.copyFileSync(tempPath, destFinal);
        limparTemp(tempPath);

        // Verifica que o arquivo final existe e tem tamanho > 0
        const stat = fs.statSync(destFinal);
        if (stat.size === 0) {
            limparTemp(destFinal);
            return res.status(500).json({ success: false, error: 'Arquivo salvo corrompido (tamanho 0)' });
        }

        db.produtos[idx].imagem = nomeArquivo;
        db.produtos[idx].imagem_v = Date.now(); // versão p/ cache-bust
        salvarProdutos(db);

        res.json({ success: true, data: { imagem: nomeArquivo, url: `/data/produtos/${nomeArquivo}` } });
    } catch (err) {
        limparTemp(tempPath);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/catalogo/item/:id/imagem
router.delete('/item/:id/imagem', (req, res) => {
    try {
        const db = lerProdutos();
        const id = parseInt(req.params.id);
        const idx = db.produtos.findIndex(p => p.id === id);
        if (idx === -1) return res.status(404).json({success: false, error: 'Produto não encontrado'});

        const nomeArquivo = db.produtos[idx].imagem;
        if (nomeArquivo) {
            const filePath = path.join(PRODUTOS_IMG_DIR, nomeArquivo);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            db.produtos[idx].imagem = null;
            db.produtos[idx].imagem_v = Date.now();
            salvarProdutos(db);
        }

        res.json({success: true});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

// GET /api/catalogo/buscar?q=texto — autocomplete com foto
router.get('/buscar', (req, res) => {
    try {
        const q = (req.query.q || '').toLowerCase().trim();
        const db = lerProdutos();

        let resultados = db.produtos;

        if (q) {
            resultados = resultados.filter(p =>
                (p.codigo || '').toLowerCase().includes(q) ||
                (p.nome || '').toLowerCase().includes(q) ||
                (p.categoria || '').toLowerCase().includes(q)
            );
        }

        // Limita a 20 resultados no autocomplete
        resultados = resultados.slice(0, 20).map(p => ({
            id: p.id,
            codigo: p.codigo,
            nome: p.nome,
            categoria: p.categoria,
            preco: p.preco,
            unidade: p.unidade,
            imagem: p.imagem || null,
            imagem_v: p.imagem_v || 1,
            fator: p.fator || 1
        }));

        res.json({success: true, data: resultados});
    } catch (err) {
        res.status(500).json({success: false, error: err.message});
    }
});

module.exports = router;