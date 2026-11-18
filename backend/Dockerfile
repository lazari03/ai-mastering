# Build native Python packages (including madmom) away from the runtime.
FROM python:3.12-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git libsndfile1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
# madmom still imports pkg_resources at runtime; keep setuptools below 81.
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt \
    && /opt/venv/bin/pip install --no-cache-dir cython "setuptools<81" \
    && /opt/venv/bin/pip install --no-cache-dir --no-build-isolation madmom

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg libsndfile1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH" \
    TORCH_HOME=/app/.cache/torch \
    XDG_CACHE_HOME=/app/.cache \
    MASTERING_UPLOAD_DIR=/app/uploads \
    MASTERING_OUTPUT_DIR=/app/outputs
COPY . .
EXPOSE 8001
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
