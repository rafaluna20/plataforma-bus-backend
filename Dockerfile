# ─── Etapa 1: Compilación ───
FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias necesarias para compilar
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm ci

# Copiar el código fuente y compilar
COPY . .
RUN npm run build

# ─── Etapa 2: Producción ───
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# Instalar únicamente dependencias de producción
RUN npm ci --only=production

# Copiar el código compilado de la etapa anterior
COPY --from=builder /app/dist ./dist

# Variables de entorno por defecto
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

# Comando para iniciar la aplicación
CMD ["node", "dist/server.js"]
