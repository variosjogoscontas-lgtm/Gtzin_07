
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false
});

const MINUTO = 60000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

async function iniciarBanco() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS licencas (
      id BIGSERIAL PRIMARY KEY,
      license_key TEXT UNIQUE NOT NULL,
      duration_ms BIGINT NOT NULL,
      remaining_ms BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      activated_at TIMESTAMPTZ,
      status TEXT NOT NULL DEFAULT 'ativo',
      device_id TEXT
    )
  `);

  const antigas = [
    ['CHAVE-VIP-30DIAS', 30],
    ['TESTE-7DIAS', 7]
  ];

  for (const [key, dias] of antigas) {
    const tempo = dias * DIA;

    await pool.query(`
      INSERT INTO licencas
      (license_key, duration_ms, remaining_ms, activated_at)
      VALUES ($1, $2, $2, NOW())
      ON CONFLICT (license_key) DO NOTHING
    `, [key, tempo]);
  }

  console.log('PostgreSQL conectado!');
}

function gerarKey() {
  return 'GTZIN07-' +
    crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function buscarKey(key) {
  const r = await pool.query(
    'SELECT * FROM licencas WHERE license_key = $1',
    [key]
  );
  return r.rows[0];
}

async function tempoRestante(licenca) {
  const r = await pool.query(`
    SELECT GREATEST(
      0,
      remaining_ms -
      CASE WHEN activated_at IS NULL THEN 0
      ELSE EXTRACT(EPOCH FROM (NOW() - activated_at)) * 1000
      END
    ) AS restante
    FROM licencas WHERE id = $1
  `, [licenca.id]);

  return Number(r.rows[0].restante);
}

app.get('/', (req, res) => {
  res.json({
    status: 'GTZIN07 funcionando!',
    database: 'PostgreSQL'
  });
});

// VALIDAR
async function validar(req, res) {
  try {
    const { key, chave, device_id, deviceId } = req.body;
    const informada = key || chave;
    const dispositivo = device_id || deviceId;

    if (!informada) {
      return res.status(400).json({
        valid: false,
        message: 'Informe uma KEY.'
      });
    }

    let licenca = await buscarKey(informada);

    if (!licenca) {
      return res.status(401).json({
        valid: false,
        message: 'KEY não encontrada.'
      });
    }

    if (licenca.status !== 'ativo') {
      return res.status(403).json({
        valid: false,
        message: 'KEY não está ativa.',
        status: licenca.status
      });
    }

    const restante = await tempoRestante(licenca);

    if (restante <= 0) {
      await pool.query(`
        UPDATE licencas
        SET status = 'expirado', remaining_ms = 0,
        activated_at = NULL
        WHERE id = $1
      `, [licenca.id]);

      return res.status(401).json({
        valid: false,
        message: 'KEY expirada.'
      });
    }

    if (dispositivo) {
      const vinculo = await pool.query(`
        UPDATE licencas
        SET device_id = COALESCE(device_id, $2)
        WHERE id = $1
        AND (device_id IS NULL OR device_id = $2)
        RETURNING device_id
      `, [licenca.id, dispositivo]);

      if (!vinculo.rows.length) {
        return res.status(403).json({
          valid: false,
          message: 'KEY vinculada a outro aparelho.'
        });
      }
    }

    return res.json({
      valid: true,
      status: 'ativo',
      restanteMs: restante,
      diasRestantes: Math.ceil(restante / DIA),
      horasRestantes: Math.ceil(restante / HORA),
      message: 'Acesso liberado!'
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      valid: false,
      message: 'Erro ao validar KEY.'
    });
  }
}

app.post('/api/license/validate', validar);
app.post('/api/license/verify', validar);

// CRIAR UMA OU VÁRIAS KEYS
app.post('/api/license/create', async (req, res) => {
  try {
    const {
      key,
      quantidade = 1,
      dias = 0,
      horas = 0,
      minutos = 0
    } = req.body;

    const qtd = Number(quantidade);
    const d = Number(dias);
    const h = Number(horas);
    const m = Number(minutos);

    if (
      !Number.isInteger(qtd) || qtd < 1 || qtd > 100 ||
      !Number.isInteger(d) || d < 0 ||
      !Number.isInteger(h) || h < 0 ||
      !Number.isInteger(m) || m < 0
    ) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Quantidade ou validade inválida.'
      });
    }

    if (key && qtd !== 1) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'KEY manual só permite quantidade 1.'
      });
    }

    const duracao = d * DIA + h * HORA + m * MINUTO;

    if (!Number.isSafeInteger(duracao) || duracao <= 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: 'Informe uma validade maior que zero.'
      });
    }

    const criadas = [];

    for (let i = 0; i < qtd; i++) {
      let codigo = key ? String(key).trim() : gerarKey();

      if (!codigo || codigo.length > 100) {
        return res.status(400).json({
          sucesso: false,
          mensagem: 'KEY inválida.'
        });
      }

      const r = await pool.query(`
        INSERT INTO licencas
        (license_key, duration_ms, remaining_ms, activated_at)
        VALUES ($1, $2, $2, NOW())
        ON CONFLICT (license_key) DO NOTHING
        RETURNING license_key
      `, [codigo, duracao]);

      if (!r.rows.length) {
        if (key) {
          return res.status(409).json({
            sucesso: false,
            mensagem: 'Essa KEY já existe.'
          });
        }
        i--;
        continue;
      }

      criadas.push(codigo);
    }

    return res.json({
      sucesso: true,
      quantidade: criadas.length,
      validade: { dias: d, horas: h, minutos: m },
      keys: criadas
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao criar KEYS.'
    });
  }
});

// PAUSAR E CONGELAR
app.post('/api/license/pause', async (req, res) => {
  try {
    const { key, chave } = req.body;
    const codigo = key || chave;

    const r = await pool.query(`
      UPDATE licencas
      SET remaining_ms = GREATEST(
        0,
        remaining_ms -
        CASE WHEN activated_at IS NULL THEN 0
        ELSE EXTRACT(EPOCH FROM (NOW() - activated_at)) * 1000
        END
      ),
      status = CASE
        WHEN remaining_ms -
        CASE WHEN activated_at IS NULL THEN 0
        ELSE EXTRACT(EPOCH FROM (NOW() - activated_at)) * 1000
        END <= 0 THEN 'expirado'
        ELSE 'pausado'
      END,
      activated_at = NULL
      WHERE license_key = $1 AND status = 'ativo'
      RETURNING status
    `, [codigo]);

    if (!r.rows.length) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'KEY não encontrada ou não está ativa.'
      });
    }

    return res.json({
      sucesso: true,
      status: r.rows[0].status,
      mensagem: 'Operação concluída.'
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao pausar.'
    });
  }
});

// REATIVAR
app.post('/api/license/reactivate', async (req, res) => {
  try {
    const { key, chave } = req.body;
    const codigo = key || chave;

    const r = await pool.query(`
      UPDATE licencas
      SET status = 'ativo', activated_at = NOW()
      WHERE license_key = $1
      AND status = 'pausado'
      AND remaining_ms > 0
      RETURNING license_key
    `, [codigo]);

    if (!r.rows.length) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'KEY não encontrada ou não pode ser reativada.'
      });
    }

    return res.json({
      sucesso: true,
      mensagem: 'KEY reativada!'
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao reativar.'
    });
  }
});

// DESATIVAR PERMANENTEMENTE
app.post('/api/license/disable', async (req, res) => {
  try {
    const { key, chave } = req.body;
    const codigo = key || chave;

    const r = await pool.query(`
      UPDATE licencas
      SET status = 'desativado', activated_at = NULL
      WHERE license_key = $1
      RETURNING license_key
    `, [codigo]);

    if (!r.rows.length) {
      return res.status(404).json({
        sucesso: false,
        mensagem: 'KEY não encontrada.'
      });
    }

    return res.json({
      sucesso: true,
      mensagem: 'KEY desativada permanentemente!'
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({
      sucesso: false,
      mensagem: 'Erro ao desativar.'
    });
  }
});

const PORT = process.env.PORT || 3000;

iniciarBanco()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`GTZIN07 rodando na porta ${PORT}`);
    });
  })
  .catch(e => {
    console.error('Falha ao iniciar PostgreSQL:', e);
    process.exit(1);
  });
