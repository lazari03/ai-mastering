FROM node:20-slim

# Needed for the /master preview path (truncateToPreview in
# masteringRoutes.js), which shells out to ffmpeg directly in Node rather
# than going through the Python service — that one route runs regardless of
# MASTERING_ENGINE, so ffmpeg has to be present even though the main
# adaptive_python path forwards everything else over HTTP.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8000

CMD ["node", "src/server.js"]
