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
