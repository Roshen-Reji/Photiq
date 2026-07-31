FROM node:20-slim

# Install dependencies needed to download rclone
RUN apt-get update && apt-get install -y curl unzip && rm -rf /var/lib/apt/lists/*

# Install rclone (needed for streaming from Google Drive)
RUN curl -O https://downloads.rclone.org/rclone-current-linux-amd64.zip && \
    unzip rclone-current-linux-amd64.zip && \
    cd rclone-*-linux-amd64 && \
    cp rclone /usr/bin/ && \
    chown root:root /usr/bin/rclone && \
    chmod 755 /usr/bin/rclone && \
    cd .. && rm -rf rclone-*

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install

# Copy application files
COPY . .

# Build the Vite frontend
RUN npm run build

# Expose the backend port
EXPOSE 8787

# Set production environment
ENV NODE_ENV=production
ENV PORT=8787

# Start the unified backend/frontend server
CMD ["npm", "run", "server"]
