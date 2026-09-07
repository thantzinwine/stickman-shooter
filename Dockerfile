# Stickman Shooter — container image (used for public/VPS hosting)
# The web app is served from this image; online PvP still runs P2P via
# PeerJS cloud signaling, so no extra realtime server is needed.
FROM node:20-slim

# bcrypt may need to rebuild from source on slim images.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "server.js"]