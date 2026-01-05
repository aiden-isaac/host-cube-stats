FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY server.js auth.js database.js ./
COPY public/ ./public/

# Create data directory
RUN mkdir -p data

# Expose port
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
