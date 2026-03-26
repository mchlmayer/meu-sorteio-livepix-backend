const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ganhador forçado em memória
let forcedWinner = null;

app.get('/', (req, res) => {
  res.send('Servidor proxy LivePix online.');
});

// ─── ADMIN: Salvar ganhador forçado ──────────────────────────────────────────
app.post('/api/admin/set-winner', (req, res) => {
  const { winner, secret } = req.body;

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  forcedWinner = winner || null;
  console.log('Ganhador forçado:', forcedWinner ? forcedWinner.name : 'limpo');
  res.json({ ok: true, winner: forcedWinner });
});

// ─── ADMIN: Ler e apagar ganhador forçado ────────────────────────────────────
app.get('/api/admin/get-winner', (req, res) => {
  const { secret } = req.query;

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  const winner = forcedWinner;
  forcedWinner = null; // Apaga após leitura — uso único
  res.json({ winner });
});

// ─── ADMIN: Ver status sem apagar (para o painel admin) ──────────────────────
app.get('/api/admin/status', (req, res) => {
  const { secret } = req.query;

  if (secret !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  res.json({ winner: forcedWinner });
});

// ─── LIVEPIX: Token ──────────────────────────────────────────────────────────
app.post('/api/livepix/token', async (req, res) => {
  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Credenciais LivePix não configuradas no servidor.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'messages:read');

    const response = await fetch('https://oauth.livepix.gg/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: errorText });
    }

    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
});

// ─── LIVEPIX: Mensagens ──────────────────────────────────────────────────────
app.get('/api/livepix/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { startDate, endDate } = req.query;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido.' });
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    let allMessages = [];
    let page = 1;
    const MAX_PAGES = 20;

    while (page <= MAX_PAGES) {
      const response = await fetch(`https://api.livepix.gg/v2/messages?limit=100&page=${page}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const result = await response.json();
      const msgs = result.data || [];
      allMessages = allMessages.concat(msgs);
      if (msgs.length < 100) break;
      page++;
    }

    let filtered = allMessages;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + 'T00:00:00-03:00') : null;
      const end = endDate ? new Date(endDate + 'T23:59:59-03:00') : null;

      filtered = allMessages.filter(msg => {
        const d = new Date(msg.createdAt);
        return (start ? d >= start : true) && (end ? d <= end : true);
      });
    }

    const unique = Array.from(new Map(filtered.map(m => [m.id, m])).values());
    res.json({ data: unique });
  } catch (error) {
    res.status(500).json({ error: `Erro interno: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor proxy rodando na porta ${PORT}`);
});
