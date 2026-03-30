# Force rebuild - 31 March 2026
FROM node:22-slim

# Install system deps + latest yt-dlp
RUN apt-get update && apt-get install -y \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages --no-cache-dir -U yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
