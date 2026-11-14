# MOTHER (FastAPI) container image.
# Build context = repository root, because MOTHER reads the team config/ and data/nasa/ lab files:
#   docker build -f MOTHER/Dockerfile -t nasa-hackathon-mother .
# DB credentials come from the environment at runtime (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD),
# never from a baked-in MOTHER/.env.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    MOTHER_HOST=0.0.0.0 \
    MOTHER_PORT=8000

WORKDIR /app/MOTHER

COPY MOTHER/requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

# Layout mirrors the repo so mother.config finds REPO_ROOT/config and REPO_ROOT/data/nasa.
COPY config/ /app/config/
COPY data/nasa/ /app/data/nasa/
COPY MOTHER/mother/ ./mother/
COPY MOTHER/config/ ./config/
COPY MOTHER/web/ ./web/

RUN useradd --uid 10001 --no-create-home --home-dir /app --shell /usr/sbin/nologin mother \
    && chown -R mother:mother /app
USER mother

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=15s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/status', timeout=12).status == 200 else 1)"

CMD ["python", "-m", "mother.server", "--no-browser"]
