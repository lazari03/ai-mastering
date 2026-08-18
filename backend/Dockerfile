FROM python:3.12-slim

# ffmpeg: input decode/mp3 export/codec previews. build-essential + git:
# madmom needs to compile against cython, and doesn't declare that build
# dependency correctly (see requirements.txt comment) — same two-step
# install used in local dev.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    build-essential \
    git \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
# setuptools: madmom imports pkg_resources at runtime (not just build time),
# which ships inside setuptools — python:3.12-slim doesn't include it by
# default the way a full python.org install or a local venv historically
# did, so this crashes on import even after a successful pip install.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir cython setuptools \
    && pip install --no-cache-dir --no-build-isolation madmom

COPY . .

# demucs/essentia/madmom model weights download to these caches on first
# use (see DEPLOYMENT.md §1) — give them a real home inside the container
# rather than scattering into random paths.
ENV TORCH_HOME=/app/.cache/torch \
    XDG_CACHE_HOME=/app/.cache

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
