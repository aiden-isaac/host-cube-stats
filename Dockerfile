# Build the React Frontend
FROM node:18-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Build the Node.js Backend
FROM node:18-alpine
WORKDIR /app
# We create a data directory for the SQLite database
RUN mkdir -p /app/data

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/
# Copy the built React app into the expected directory
COPY --from=frontend-builder /app/client/dist ./client/dist

# Set environment variables for production
ENV NODE_ENV=production
ENV PORT=8080
# Override the DB path to point to the persistent volume
ENV DB_PATH=/app/data/database.sqlite

# Expose the API and WebSocket port
EXPOSE 8080

CMD ["node", "src/server.js"]
