
const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const bancoChaves = {
  "CHAVE-VIP-30DIAS": {
    diasValidade: 30,
    criadoEm: new Date().toISOString(),
    status: "ativo",
    device_id: null
  },
  "TESTE-7DIAS": {
    diasValidade: 7,
    criadoEm: new Date().toISOString(),
    status: "ativo",
    device_id: null
  }
};

app.get('/', (req, res) => {
  res.json({ status: 'API rodando perfeitamente!' });
});

app.post('/api/license/validate', (req, res) => {
  const { key, chave, device_id, deviceId } = req.body;
  const keyInformada = key || chave;
  const idDispositivo = device_id || deviceId;

  if (!keyInformada) {
    return res.status(400).json({
      valid: false,
      message: 'Nenhuma chave foi fornecida.'
    });
  }

  const licenca = bancoChaves[keyInformada];

  if (!licenca) {
    return res.status(401).json({
      valid: false,
      message: 'Chave inválida ou não encontrada.'
    });
  }

  if (licenca.status === 'pausado') {
    return res.status(403).json({
      valid: false,
      message: 'Esta chave está pausada no momento.'
    });
  }

  if (licenca.status === 'desativado') {
    return res.status(403).json({
      valid: false,
      message: 'Esta chave foi desativada permanentemente.'
    });
  }

  const dataCriacao = new Date(licenca.criadoEm);
  const dataAtual = new Date();
  const diferencaTempo = dataAtual - dataCriacao;
  const diasDecorridos = diferencaTempo / (1000 * 60 * 60 * 24);

  if (diasDecorridos > licenca.diasValidade) {
    return res.status(401).json({
      valid: false,
      message: 'Sua chave expirou.'
    });
  }

  if (idDispositivo) {
    if (licenca.device_id) {
      if (licenca.device_id !== idDispositivo) {
        return res.status(403).json({
          valid: false,
          message: 'Chave ou dispositivo não autorizado! Esta chave já está em uso em outro aparelho.'
        });
      }
    } else {
      licenca.device_id = idDispositivo;
    }
  }

  const diasRestantes = Math.ceil(licenca.diasValidade - diasDecorridos);

  return res.json({
    valid: true,
    message: `Acesso liberado! Restam ${diasRestantes} dia(s).`
  });
});

app.post('/api/license/verify', (req, res) => {
  return app._router.handle(
    Object.assign(req, {
      url: '/api/license/validate',
      method: 'POST'
    }),
    res
  );
});

// CRIAR UMA OU VÁRIAS KEYS
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

  // Validar todas antes de criar
  const nomes = new Set();

  for (const item of lista) {
    if (
      !item.key ||
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

  // Criar todas as chaves
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

app.post('/api/license/pause', (req, res) => {
  const { key, chave } = req.body;
  const keyInformada = key || chave;

  if (!keyInformada || !bancoChaves[keyInformada]) {
    return res.status(404).json({
      sucesso: false,
      mensagem: 'Chave não encontrada.'
    });
  }

  bancoChaves[keyInformada].status = 'pausado';

  return res.json({
    sucesso: true,
    mensagem: 'Chave pausada com sucesso!'
  });
});

app.post('/api/license/disable', (req, res) => {
  const { key, chave } = req.body;
  const keyInformada = key || chave;

  if (!keyInformada || !bancoChaves[keyInformada]) {
    return res.status(404).json({
      sucesso: false,
      mensagem: 'Chave não encontrada.'
    });
  }

  bancoChaves[keyInformada].status = 'desativado';

  return res.json({
    sucesso: true,
    mensagem: 'Chave desativada com sucesso!'
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
