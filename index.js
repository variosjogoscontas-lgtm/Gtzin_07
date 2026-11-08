const express = require('express');
const app = express();

app.use(express.json());

// Banco de dados simulado em memória (ou substitua pela sua conexão com banco)
// Armazena as chaves ativas e o deviceId vinculado
const licenses = new Map();

// Rota de teste raiz
app.get('/', (req, res) => {
    res.status(200).json({ status: 'online', message: 'API rodando perfeitamente!' });
});

// Rota para criar/gerar nova chave (caso você use para gerenciar)
app.post('/license/create', (req, res) => {
    try {
        const { key, dias } = req.body;
        
        if (!key) {
            return res.status(400).json({ status: 'error', message: 'A chave (key) é obrigatória.' });
        }

        const diasValidade = dias ? parseInt(dias) : 1;
        const expiresAt = Date.now() + (diasValidade * 24 * 60 * 60 * 1000);

        licenses.set(key, {
            expiresAt,
            deviceId: null // Será vinculado no primeiro login/ativação
        });

        return res.status(200).json({
            status: 'success',
            message: 'Chave criada com sucesso',
            key,
            expiresAt
        });
    } catch (error) {
        console.error('Erro ao criar chave:', error);
        return res.status(500).json({ status: 'error', message: 'Erro interno ao criar chave' });
    }
});

// Rota de validação da chave e do dispositivo (para liberar a segunda tela)
app.post('/license/validate', (req, res) => {
    try {
        const { key, deviceId } = req.body;

        if (!key) {
            return res.status(400).json({ status: 'error', message: 'Chave não informada.' });
        }

        // Verifica se a chave existe no sistema
        const licenseData = licenses.get(key);
        if (!licenseData) {
            return res.status(404).json({ status: 'error', message: 'Chave inválida ou não encontrada.' });
        }

        // Verifica se a chave expirou
        if (Date.now() > licenseData.expiresAt) {
            return res.status(400).json({ status: 'error', message: 'Chave expirada.' });
        }

        // Vincula o deviceId se ainda não estiver vinculado
        if (!licenseData.deviceId && deviceId) {
            licenseData.deviceId = deviceId;
        }

        // Se o deviceId enviado for diferente do vinculado, bloqueia (opcional, para segurança)
        if (licenseData.deviceId && deviceId && licenseData.deviceId !== deviceId) {
            return res.status(400).json({ status: 'error', message: 'Esta chave já está vinculada a outro dispositivo.' });
        }

        // Sucesso: chave válida, libera a segunda tela
        return res.status(200).json({
            status: 'success',
            message: 'Licença validada com sucesso!',
            expiresAt: licenseData.expiresAt
        });

    } catch (error) {
        console.error('Erro na validação:', error);
        return res.status(500).json({ status: 'error', message: 'Erro interno no servidor ao validar.' });
    }
});

// Captura de erros globais para o servidor nunca dar crash (502)
process.on('uncaughtException', (err) => {
    console.error('Erro não tratado:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Rejeição não tratada:', reason);
});

// Porta dinâmica do Railway ou padrão 8080 que você configurou
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
