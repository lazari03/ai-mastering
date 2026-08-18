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
# setuptools<81: madmom imports pkg_resources at runtime (not just build
# time) — pkg_resources ships inside setuptools, but setuptools 81+ (2025)
# removed pkg_resources entirely as a deprecation. An unpinned
# `pip install setuptools` now grabs a version that no longer has it,
# which still crashes on import even though setuptools installed fine.
# Pin an older release until madmom (unmaintained since ~2021) is
# replaced or patched.
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir cython "setuptools<81" \
    && pip install --no-cache-dir --no-build-isolation madmom

COPY . .

# demucs/essentia/madmom model weights download to these caches on first
# use (see DEPLOYMENT.md §1) — give them a real home inside the container
# rather than scattering into random paths.
ENV TORCH_HOME=/app/.cache/torch \
    XDG_CACHE_HOME=/app/.cache

EXPOSE 8001

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
