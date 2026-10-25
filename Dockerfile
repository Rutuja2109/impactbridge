# ImpactBridge: one container serving the API and the web app (the Android app loads this site).

# 1) Bundle and minify the web app (a few small files load much faster on phones than ~30 separate modules).
FROM node:22-slim AS esbuild
RUN npm install -g esbuild@0.24.2
FROM python:3.12-slim AS web
COPY --from=esbuild /usr/local/lib/node_modules/esbuild/bin/esbuild /usr/local/bin/esbuild
WORKDIR /src
COPY frontend frontend
COPY build_web.py .
COPY tools tools
# Self-host the fonts (skipped quietly if Google Fonts can't be reached during the build).
RUN python tools/fetch_fonts.py frontend || echo "fonts: keeping the Google Fonts link"
RUN ESBUILD=/usr/local/bin/esbuild python build_web.py

# 2) The server.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    APP_ENV=production DATA_DIR=/data PORT=8000 FRONTEND_DIR=/app/frontend-dist

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY --from=web /src/frontend-dist frontend-dist

RUN useradd --create-home --uid 10001 app && mkdir -p /data && chown app /data
USER app
WORKDIR /app/backend
VOLUME ["/data"]
EXPOSE 8000

# One worker: SQLite + the hourly deadline sweep expect a single process.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --proxy-headers --forwarded-allow-ips='*'"]
