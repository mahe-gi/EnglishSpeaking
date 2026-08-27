FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npx livekit-agents download-files
RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/agent.js", "start"]
