# SmartBike Backend Dockerfile
# NOTE: For actual Raspberry Pi deployment choose an ARM image, e.g. arm32v7/python:3.11-slim
# Build ARG allows override: docker build --build-arg BASE_IMAGE=arm32v7/python:3.11-slim -t smartbike-backend .
ARG BASE_IMAGE=python:3.11-slim
FROM ${BASE_IMAGE}

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# Install system dependencies (rtl-sdr tools optional, comment out if not needed in container)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    librtlsdr0 rtl-sdr \
    libatlas-base-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt

# Copy application code
COPY app.py ./
COPY .env.example ./

EXPOSE 5000

# Healthcheck: simple TCP check (Flask default) or curl if installed
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD python - <<'PY' || exit 1
import socket,sys
s=socket.socket();
try:
  s.connect(('127.0.0.1',5000))
  sys.exit(0)
except Exception:
  sys.exit(1)
PY

CMD ["python", "app.py"]
