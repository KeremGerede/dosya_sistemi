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


def env_flag(name: str, default: bool) -> bool:
    """Opsiyonel "true"/"false" ortam değişkeni; tanımsızsa varsayılan, başka bir değerde açık hatayla durur."""
    value = (os.getenv(name) or "").strip().lower()
    if not value:
        return default
    if value not in ("true", "false"):
        raise RuntimeError(f"{name} ortam değişkeni yalnızca 'true' veya 'false' olabilir.")
    return value == "true"


DATABASE_URL = require_env("DATABASE_URL")

# OCR (Gemini transkripsiyonu ve Tesseract yedeği) açık mı (D-055). Yerel geliştirmede varsayılan açıktır;
# production Compose'da (ilk AWS yayını) "false" verilir. Kapalıyken OCR gereken belge OCR'a girmeden failed + 422 olur.
OCR_ENABLED = env_flag("OCR_ENABLED", default=True)

# Taranmış PDF sayfalarının OCR fallback'inde ve JPG/JPEG/PNG belgelerin doğrudan OCR'ında kullanılan
# Tesseract tessdata klasörü (opsiyonel).
# Tanımlı değilse OCR atlanır ve belge mevcut davranışla "yeterli metin yok" sayılır.
TESSDATA_PREFIX = os.getenv("TESSDATA_PREFIX") or None
