// Quebra texto padronizado em linhas de item estruturadas.
// Formato por linha: CÓDIGO ; QTD ; UNIDADE ; PREÇO_UNIT
// Linhas com # = cabeçalho de seção (ignorado). Linhas vazias = ignoradas.

function parsearTexto(texto) {
    if (!texto || typeof texto !== 'string') return [];

    const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const itens = [];

    for (const linha of linhas) {
        // Cabeçalho de seção
        if (linha.startsWith('#')) continue;

        // Comentário
        if (linha.startsWith('//')) continue;

        const partes = linha.split(';').map(p => p.trim());

        if (partes.length < 2) {
            // Linha mal formatada — registra como erro
            itens.push({
                linha_original: linha,
                codigo: partes[0] || '',
                qtd_entrada: 0,
                unidade_entrada: 'UN',
                preco_unit: 0,
                erro_parse: 'Formato inválido — esperado: CÓDIGO ; QTD ; UNIDADE ; PREÇO'
            });
            continue;
        }

        const codigo = partes[0] || '';
        const qtd = parseFloat((partes[1] || '0').replace(/\./g, '').replace(',', '.')) || 0;
        const unidade = (partes[2] || 'UN').toUpperCase().trim();
        const preco = parseFloat((partes[3] || '0').replace(/\./g, '').replace(',', '.')) || 0;

        itens.push({
            linha_original: linha,
            codigo,
            qtd_entrada: qtd,
            unidade_entrada: unidade,
            preco_unit: preco,
            erro_parse: null
        });
    }

    return itens;
}

module.exports = { parsearTexto };