FROM node:22-slim
# 22, not 20 — better-sqlite3 (analytics storage, see config/analyticsDb.js)
# declares engines.node >=22. Its prebuilt binaries target N-API (stable
# ABI across Node majors) so a mismatch likely still runs, but there's no
# reason to rely on "likely" here — matches what the package actually
# supports.

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
