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

# Copiar el código compilado de la etapa anterior, con el dueño correcto
# para el usuario no-root con el que se ejecuta el proceso (ver USER abajo).
COPY --from=builder --chown=node:node /app/dist ./dist

# Variables de entorno por defecto
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

# Ejecutar como usuario no-root (node:node ya viene incluido en la imagen
# oficial node:alpine) en vez de root, que es el default de Docker.
USER node

# Reinicia el contenedor si el proceso deja de responder en /health
# (usa wget porque alpine no trae curl instalado por defecto).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/health || exit 1

# Comando para iniciar la aplicación
CMD ["node", "dist/server.js"]
