# Build the React Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# Build the Node.js Backend
FROM node:22-alpine
WORKDIR /app

# Install fonts for sharp/librsvg text rendering in SVGs, and Tesseract OCR for card scanning
RUN apk add --no-cache font-liberation ttf-freefont fontconfig tesseract-ocr

# We create a data directory for the SQLite database
RUN mkdir -p /app/data

COPY package*.json ./
RUN npm install --production

COPY src/ ./src/

# Copy custom MTG traineddata for card scanner OCR (if present)
# User places mtg.traineddata in project root
COPY mtg.traineddata* /usr/share/tessdata/
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
