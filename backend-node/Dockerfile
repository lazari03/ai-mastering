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
#
# python3/make/g++ are for better-sqlite3 (analytics storage): its prebuilt
# binary isn't always picked up (seen failing on the VPS's host arch/libc),
# and npm then falls back to compiling from source via node-gyp, which
# hard-requires a Python interpreter and a C++ toolchain. Without these the
# whole `npm ci` fails outright on that fallback path.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 8000

CMD ["node", "src/server.js"]
