FROM node:20-slim

# Instalar Git e outras dependências
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package.json
COPY package.json ./

# Instalar dependências
RUN npm install --production

# Copiar código fonte
COPY src ./src

# Criar diretório para auth state (opcional)
RUN mkdir -p ./auth_state && chmod 777 ./auth_state

EXPOSE 3000

CMD ["npm", "start"]
