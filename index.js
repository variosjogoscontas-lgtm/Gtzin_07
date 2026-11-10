app.post('/api/license/create', (req, res) => {
  const { key, dias, chaves } = req.body;

  const lista = Array.isArray(chaves)
    ? chaves
    : [{ key, dias }];

  if (lista.length === 0) {
    return res.status(400).json({
      sucesso: false,
      mensagem: 'Informe pelo menos uma chave.'
    });
  }

  const nomes = new Set();

  for (const item of lista) {
    if (
      typeof item.key !== 'string' ||
      !item.key.trim() ||
      !Number.isInteger(Number(item.dias)) ||
      Number(item.dias) <= 0
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe chaves e dias válidos.'
      });
    }

    if (nomes.has(item.key) || bancoChaves[item.key]) {
      return res.status(409).json({
        sucesso: false,
        mensagem: `A chave '${item.key}' já existe.`
      });
    }

    nomes.add(item.key);
  }

  for (const item of lista) {
    bancoChaves[item.key] = {
      diasValidade: Number(item.dias),
      criadoEm: new Date().toISOString(),
      status: "ativo",
      device_id: null
    };
  }

  return res.json({
    sucesso: true,
    quantidade: lista.length,
    chaves: lista.map(item => item.key),
    mensagem: `${lista.length} chave(s) criada(s) com sucesso!`
  });
});
