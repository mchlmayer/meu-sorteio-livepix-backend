// server.js - Seu servidor de backend para implantação

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fetch = require('node-fetch'); // Importa node-fetch para requisições HTTP

const app = express();
// Usa a porta fornecida pelo ambiente de hospedagem (ex: Render) ou 3001 localmente
const PORT = process.env.PORT || 3001;

// Configura o CORS. Em produção, substitua '*' pelo domínio exato da sua aplicação React
// Ex: cors({ origin: 'https://seusorteio.netlify.app' })
app.use(cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rota para a URL raiz para indicar que o servidor está funcionando
app.get('/', (req, res) => {
  res.send('Servidor proxy LivePix está online e funcionando! Use as rotas /api/livepix/token e /api/livepix/messages.');
});

// Rota para Obter o Token de Acesso LivePix
app.post('/api/livepix/token', async (req, res) => {
  // ATENÇÃO: As credenciais DEVEM ser lidas APENAS de variáveis de ambiente em produção (NO RENDER)!
  // As linhas abaixo leem diretamente das variáveis de ambiente configuradas no seu serviço Render.
  const clientId = process.env.LIVEPIX_CLIENT_ID;
  const clientSecret = process.env.LIVEPIX_CLIENT_SECRET;

  // REMOVIDO: A linha "const { clientId, clientSecret = req.body;" foi removida,
  // pois o frontend não enviará mais essas informações no corpo da requisição.
  // O backend agora depende EXCLUSIVAMENTE das variáveis de ambiente.

  if (!clientId || !clientSecret) {
    // Esta mensagem de erro será gerada se as variáveis de ambiente (LIVEPIX_CLIENT_ID, LIVEPIX_CLIENT_SECRET)
    // não estiverem configuradas corretamente no Render.
    return res.status(400).json({ error: 'ID do Cliente e Segredo do Cliente são obrigatórios no servidor (variáveis de ambiente).' });
  }

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('scope', 'messages:read'); // Escopo necessário para ler mensagens/doações

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
      return res.status(response.status).json(errorData);
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Erro no proxy ao obter token:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao obter token.' });
  }
});

// Rota para Buscar Mensagens (Doações) LivePix com Paginação e Filtro de Período
app.get('/api/livepix/messages', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { startDate, endDate } = req.query;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de acesso não fornecido ou inválido.' });
  }

  const accessToken = authHeader.split(' ')[1];

  try {
    let allMessages = [];
    let page = 1;
    const limitPerPage = 100; // Limite máximo por requisição na API do LivePix
    const MAX_PAGES = 20; // NOVO: Aumentado para 20 para buscar até 2000 doações (20 * 100)

    // Loop para buscar múltiplas páginas
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

    res.json({ data: uniqueMessages }); // Retorna as doações filtradas e únicas
  } catch (error) {
    console.error('Erro no proxy ao buscar mensagens:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar mensagens.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor proxy rodando na porta ${PORT}`);
  console.log('Lembre-se de usar variáveis de ambiente para LIVEPIX_CLIENT_ID e LIVEPIX_CLIENT_SECRET em produção!');
});
