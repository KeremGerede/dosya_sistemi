import os

# Testler gerçek Gemini API anahtarını ve veritabanını kullanmaz. Değerler app modülleri import edilmeden önce
# ortama yazılır; backend/.env ortamdaki değerleri ezmediği için .env'deki gerçek anahtar testlere girmez.
os.environ["GEMINI_API_KEY"] = "test-api-key"
os.environ["GEMINI_MODEL"] = "test-model"
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://test:test@127.0.0.1:1/test")
