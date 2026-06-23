# ---- Midnight Gambit · imagen del servidor -------------------------------
# Imagen ligera basada en Node 20 (Alpine). El contexto de build es la raíz
# del proyecto, de modo que copiamos tanto el servidor como el cliente
# estático que Express sirve en producción.
FROM node:20-alpine

# Pequeña utilidad para comprobar salud del contenedor.
RUN apk add --no-cache wget

WORKDIR /app

# 1) Instala dependencias del servidor aprovechando la caché de capas.
COPY server/package*.json ./server/
RUN cd server && (npm ci --omit=dev || npm install --omit=dev)

# 2) Copia el código del servidor y el cliente.
COPY server ./server
COPY client ./client

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

# El servidor espera a Postgres, aplica el esquema y arranca.
CMD ["node", "src/index.js"]
