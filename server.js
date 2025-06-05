// server.js - Seu servidor de backend (versão anterior que funcionava localmente)

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // Usado para fazer requisições para a API LivePix

const app = express();
const PORT = process.env.PORT || 3001; // A porta onde seu servidor vai rodar. Você pode mudar se quiser.

// Configura o CORS para permitir que sua aplicação React (frontend) se conecte
// O '*' significa que qualquer origem pode se conectar. Para maior segurança em produção,
// você pode substituir '*' pelo domínio exato da sua aplicação React (ex: 'http://localhost:3000')
app.use(cors());

// Permite que o servidor entenda JSON e dados de formulário
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rota para a URL raiz para indicar que o servidor está funcionando
app.get('/', (req, res) => {
  res.send('Servidor proxy LivePix está online e funcionando! Use as rotas /api/livepix/token e /api/livepix/messages.');
});

// --- Rota para Obter o Token de Acesso LivePix ---
app.post('/api/livepix/token', async (req, res) => {
  // NESTA VERSÃO, as credenciais são esperadas no CORPO da requisição (do frontend)
  const { clientId, clientSecret } = req.body;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'ID do Cliente e Segredo do Cliente são obrigatórios.' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'messages:read'); // Escopo necessário para ler mensagens/doações

    // Faz a requisição para o servidor OAuth do LivePix
    const response = await fetch('https://oauth.livepix.gg/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Erro do LivePix OAuth:', errorData);
      return res.status(response.status).json(errorData); // Repassa o erro do LivePix
    }

    const data = await response.json();
    res.json(data); // Repassa o token de acesso para o frontend
  } catch (error) {
    console.error('Erro no proxy ao obter token:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao obter token.' });
  }
});

// --- Rota para Buscar Mensagens (Doações) LivePix com Filtro de Período ---
app.get('/api/livepix/messages', async (req, res) => {
  const authHeader = req.headers.authorization; // Recebe o cabeçalho de autorização do frontend
  const { startDate, endDate } = req.query; // Recebe os parâmetros de data do frontend

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido ou inválido.' });
  }

  const accessToken = authHeader.split(' ')[1]; // Extrai o token

  try {
    let allMessages = [];
    let page = 1;
    const limitPerPage = 100; // Limite máximo por requisição na API do LivePix
    const MAX_PAGES = 5; // Limite o número de páginas para buscar para evitar requisições excessivas

    // Loop para buscar múltiplas páginas
    while (page <= MAX_PAGES) {
      const livepixApiUrl = `https://api.livepix.gg/v2/messages?limit=${limitPerPage}&page=${page}`;

      const response = await fetch(livepixApiUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`, // Usa o token obtido
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error(`Erro do LivePix API na página ${page}:`, errorData);
        // Em caso de erro, retorna o que já foi coletado ou o erro
        return res.status(response.status).json(errorData);
      }

      const result = await response.json();
      const currentPageMessages = result.data || [];

      // Adiciona as mensagens da página atual à lista total
      allMessages = allMessages.concat(currentPageMessages);

      // Se a página atual retornou menos que o limite, significa que não há mais páginas
      if (currentPageMessages.length < limitPerPage) {
        break;
      }

      page++;
    }

    let filteredMessages = allMessages;

    // Aplica o filtro de data nas mensagens coletadas
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate + 'T00:00:00-03:00') : null; // Fuso horário para consistência
      const end = endDate ? new Date(endDate + 'T23:59:59-03:00') : null;     // Fim do dia

      filteredMessages = allMessages.filter(msg => {
        const messageDate = new Date(msg.createdAt); // 'createdAt' da API é string ISO

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

    // Filtra mensagens duplicadas por ID, se houver (para garantir doações únicas)
    const uniqueMessages = Array.from(new Map(filteredMessages.map(item => [item['id'], item])).values());

    res.json({ data: uniqueMessages }); // Repassa as doações filtradas e únicas
  } catch (error) {
    console.error('Erro no proxy ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar mensagens.' });
  }
});

// Inicia o servidor
app.listen(PORT, () => {
  console.log(`Servidor proxy rodando em http://localhost:${PORT}`);
  console.log('Certifique-se de que sua aplicação React está configurada para usar esta URL.');
});
