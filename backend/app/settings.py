import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env varsa yüklenir; ortamda zaten tanımlı değişkenler ezilmez.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def require_env(name: str) -> str:
    """Zorunlu ortam değişkenini döndürür; tanımlı değilse açık bir hatayla durur (fail fast)."""
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"{name} ortam değişkeni tanımlı değil. Örnek için backend/.env.example dosyasına bakın.")
    return value


DATABASE_URL = require_env("DATABASE_URL")

# Taranmış PDF'ler için OCR fallback'inde kullanılan Tesseract tessdata klasörü (opsiyonel).
# Tanımlı değilse OCR atlanır ve belge mevcut davranışla "yeterli metin yok" sayılır.
TESSDATA_PREFIX = os.getenv("TESSDATA_PREFIX") or None
