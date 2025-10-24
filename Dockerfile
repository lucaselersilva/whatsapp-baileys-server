FROM node:20-slim

WORKDIR /app

# Copiar apenas package.json primeiro
COPY package.json ./

# Instalar dependências e gerar lockfile
RUN npm install --production

# Copiar código
COPY src ./src

# Criar diretório para auth (opcional, pois usamos Supabase)
RUN mkdir -p ./auth_state && chmod 777 ./auth_state

EXPOSE 3000

CMD ["npm", "start"]
