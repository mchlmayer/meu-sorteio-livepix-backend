# Usa uma imagem base oficial do Node.js
FROM node:18-alpine

# Define o diretório de trabalho dentro do contêiner
WORKDIR /app

# Copia os arquivos package.json e package-lock.json para o diretório de trabalho
# Isso é feito separadamente para aproveitar o cache do Docker e acelerar as builds
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o restante do código da aplicação para o diretêrio de trabalho
COPY . .

# Expõe a porta em que o aplicativo Node.js será executado
# Deve corresponder à porta definida no seu server.js (geralmente 3001)
EXPOSE 3001

# Define o comando que será executado quando o contêiner for iniciado
# Certifique-se de que 'server.js' é o nome do seu arquivo principal do backend
CMD ["node", "server.js"]
