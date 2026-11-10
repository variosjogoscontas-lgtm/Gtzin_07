
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
      message: 'Esta chave está pausada.'
    });
  }

  if (licenca.status === 'desativado') {
    return res.status(403).json({
      valid: false,
      message: 'Esta chave foi desativada.'
    });
  }

  const dataCriacao = new Date(licenca.criadoEm);
  const diasDecorridos =
    (Date.now() - dataCriacao.getTime()) / 86400000;

  if (diasDecorridos >= licenca.diasValidade) {
    return res.status(401).json({
      valid: false,
      message: 'Sua chave expirou.'
    });
  }

  if (idDispositivo) {
    if (licenca.device_id &&
        licenca.device_id !== idDispositivo) {
      return res.status(403).json({
        valid: false,
        message: 'Dispositivo não autorizado.'
      });
    }

    if (!licenca.device_id) {
      licenca.device_id = idDispositivo;
    }
  }

  const diasRestantes = Math.ceil(
    licenca.diasValidade - diasDecorridos
  );

  return res.json({
    valid: true,
    message: `Acesso liberado! Restam ${diasRestantes} dia(s).`
  });
});

app.post('/api/license/verify', (req, res) => {
  const { key, chave, device_id, deviceId } = req.body;

  req.body = { key, chave, device_id, deviceId };

  return app.handle({
    ...req,
    method: 'POST',
    url: '/api/license/validate'
  }, res);
});

// Criar uma ou várias Keys
app.post('/api/license/create', (req, res) => {
  const token = req.headers.authorization;

  if (!process.env.ADMIN_TOKEN ||
      token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Acesso não autorizado.'
    });
  }

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
      status: 'ativo',
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

// Pausar Key
app.post('/api/license/pause', (req, res) => {
  const token = req.headers.authorization;

  if (!process.env.ADMIN_TOKEN ||
      token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Acesso não autorizado.'
    });
  }

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

// Desativar Key
app.post('/api/license/disable', (req, res) => {
  const token = req.headers.authorization;

  if (!process.env.ADMIN_TOKEN ||
      token !== `Bearer ${process.env.ADMIN_TOKEN}`) {
    return res.status(401).json({
      sucesso: false,
      mensagem: 'Acesso não autorizado.'
    });
  }

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
