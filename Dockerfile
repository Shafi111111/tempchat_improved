# Simple container for Render/Fly/etc.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev || npm install
COPY . .
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
