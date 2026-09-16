import errno
import os
from pathlib import Path

import pytest

# Testler gerçek Gemini API anahtarını ve veritabanını kullanmaz. Değerler app modülleri import edilmeden önce
# ortama yazılır; backend/.env ortamdaki değerleri ezmediği için .env'deki gerçek anahtar testlere girmez.
os.environ["GEMINI_API_KEY"] = "test-api-key"
os.environ["GEMINI_MODEL"] = "test-model"
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@127.0.0.1:1/test")


@pytest.fixture
def failing_storage_write(monkeypatch):
    """Storage'a yazılan dosyada yazmayı yarıda keser: birkaç bayt diske gider, ardından "disk dolu" hatası yükselir.

    Gerçek diski doldurmadan kısmi dosya senaryosunu üretir; yükselen hata nesnesini döndürür.
    """
    from app.services import file_service

    error = OSError(errno.ENOSPC, "No space left on device")
    real_open = Path.open

    class PartialWriter:
        def __init__(self, handle):
            self.handle = handle

        def __enter__(self):
            return self

        def __exit__(self, *exc_info):
            self.handle.close()

        def write(self, data):
            self.handle.write(data[:8])
            self.handle.flush()
            raise error

    def open_with_failing_write(path, *args, **kwargs):
        handle = real_open(path, *args, **kwargs)
        return PartialWriter(handle) if path.parent == file_service.STORAGE_DIR else handle

    monkeypatch.setattr(Path, "open", open_with_failing_write)
    return error
