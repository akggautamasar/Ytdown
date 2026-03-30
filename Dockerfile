FROM node:22-slim

# Install system dependencies: ffmpeg + yt-dlp
RUN apt-get update && apt-get install -y \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages --no-cache-dir yt-dlp \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install

# Copy the rest of the code
COPY . .

# Expose port
EXPOSE 3001

# Start the app
CMD ["node", "server.js"]
