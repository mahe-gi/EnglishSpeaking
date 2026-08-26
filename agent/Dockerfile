FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

CMD ["npm", "start"]
