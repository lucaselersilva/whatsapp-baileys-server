FROM node:20-slim

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código
COPY . .

# Criar diretório para auth
RUN mkdir -p ./auth_state && chmod 777 ./auth_state

EXPOSE 3000

CMD ["npm", "start"]
