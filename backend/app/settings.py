import os
from pathlib import Path

from dotenv import load_dotenv

# backend/.env varsa yüklenir; ortamda zaten tanımlı değişkenler ezilmez.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL ortam değişkeni tanımlı değil. Örnek için backend/.env.example dosyasına bakın.")
