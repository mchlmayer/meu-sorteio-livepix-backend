// server.js - Seu servidor de backend para implantação

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // Importa node-fetch para requisições HTTP

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('Servidor proxy LivePix está online e funcionando! Use as rotas /api/livepix/token e /api/livepix/messages.');
});

app.post('/api/livepix/token', async (req, res) => {
  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Erro: LIVEPIX_CLIENT_ID ou LIVEPIX_CLIENT_SECRET não configurados como variáveis de ambiente.');
    return res.status(400).json({ error: 'ID do Cliente e Segredo do Cliente são obrigatórios no servidor (variáveis de ambiente).' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'messages:read');

    const response = await fetch('https://oauth.livepix.gg/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text(); // Tenta ler o texto completo do erro
      console.error(`Erro ao obter token do LivePix OAuth: Status ${response.status}, Resposta: ${errorText}`);
      return res.status(response.status).json({ error: `Erro ao obter token do LivePix: ${errorText}` });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Erro inesperado no proxy ao obter token:', error);
    res.status(500).json({ error: `Erro interno do servidor ao obter token: ${error.message}` });
  }
});

app.get('/api/livepix/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { startDate, endDate } = req.query;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido ou inválido.' });
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    let allLivePixMessages = [];
    let page = 1;
    const limitPerPage = 100;
    const MAX_PAGES = 20; // Buscar até 2000 doações do LivePix

    while (page <= MAX_PAGES) {
      const livepixApiUrl = `https://api.livepix.gg/v2/messages?limit=${limitPerPage}&page=${page}`;

      const response = await fetch(livepixApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text(); // Tenta ler o texto completo do erro
        console.error(`Erro do LivePix API na página ${page}: Status ${response.status}, Resposta: ${errorText}`);
        return res.status(response.status).json({ error: `Erro da API LivePix: ${errorText}` });
      }

      const result = await response.json();
      const currentPageMessages = result.data || [];

      allLivePixMessages = allLivePixMessages.concat(currentPageMessages);

      if (currentPageMessages.length < limitPerPage) {
        break;
      }
      page++;
    }

    let filteredMessages = allLivePixMessages;

    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + 'T00:00:00-03:00') : null;
      const end = endDate ? new Date(endDate + 'T23:59:59-03:00') : null;

      filteredMessages = allLivePixMessages.filter(msg => {
        const messageDate = new Date(msg.createdAt);

        let isAfterStart = true;
        if (start) {
          isAfterStart = messageDate >= start;
        }

        let isBeforeEnd = true;
        if (end) {
          isBeforeEnd = messageDate <= end;
        }

        return isAfterStart && isBeforeEnd;
      });
    }

    const uniqueMessages = Array.from(new Map(filteredMessages.map(item => [item['id'], item])).values());

    res.json({ data: uniqueMessages });
  } catch (error) {
    console.error('Erro inesperado no proxy ao buscar mensagens:', error);
    res.status(500).json({ error: `Erro interno do servidor ao buscar mensagens: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor proxy rodando na porta ${PORT}`);
  console.log('Lembre-se de usar variáveis de ambiente para LIVEPIX_CLIENT_ID e LIVEPIX_CLIENT_SECRET em produção!');
});
