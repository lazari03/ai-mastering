FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Legacy ffmpeg-fallback engine path only (see server.js's production
# guard, which refuses to boot on that engine anyway) — not installed here
# on purpose, keeps this image lean. The real path never shells out to
# ffmpeg; it forwards to the Python service over HTTP.

EXPOSE 8000

CMD ["node", "src/server.js"]
