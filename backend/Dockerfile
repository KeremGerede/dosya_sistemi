# Production image (Linux amd64): FastAPI API ve Alembic migration'ları aynı image'dan çalışır.
# İlk AWS yayını OCR'sizdir (D-055): Tesseract kurulmaz, OCR_ENABLED Compose'da "false" verilir.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

RUN useradd --system --uid 10001 --no-create-home --home-dir /app --shell /usr/sbin/nologin app

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
# Belge storage'ı (backend/storage → /app/storage, D-017) named volume'e bağlanır; ilk bağlamada sahiplik buradan gelir.
RUN mkdir -p /app/storage && chown app:app /app/storage

USER app
EXPOSE 8000

# Tek worker bilinçli: endpoint'ler senkron ve thread havuzunda çalışır (D-020); 4 GB ortak sunucuda bellek sınırlı.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-server-header"]
