"""google-genai SDK için ince sarmalayıcı: tek istek, 30 sn timeout.

Retry politikası (D-033) yalnızca classification_service içinde yönetilir. SDK'nın kendi retry'ı
kapalıdır (attempts=1); böylece generate_json'ın her çağrısı tam olarak bir gerçek HTTP isteğidir.
"""

from google import genai
from google.genai import types
from pydantic import BaseModel

from app.settings import require_env

# İkisi de zorunlu; modül yüklenirken (uygulama başlangıcı) eksikse açık hata verilir (D-031).
GEMINI_MODEL = require_env("GEMINI_MODEL")
REQUEST_TIMEOUT_MS = 30_000  # HttpOptions.timeout milisaniye cinsindendir: 30 sn (D-033)

HTTP_OPTIONS = types.HttpOptions(
    timeout=REQUEST_TIMEOUT_MS,
    retry_options=types.HttpRetryOptions(attempts=1),  # SDK retry'ı kapalı
)

_client = genai.Client(api_key=require_env("GEMINI_API_KEY"), http_options=HTTP_OPTIONS)


def generate_json(prompt: str, response_schema: type[BaseModel]) -> str | None:
    """Tek bir generate_content isteği yapar ve modelin JSON metnini döndürür.

    SDK hataları (google.genai.errors.APIError, httpx ağ/timeout hataları) olduğu gibi yükselir.
    """
    response = _client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=response_schema,
            temperature=0,
            # Tool kullanılmıyor; AFC döngüsü kapalı tutulur, her çağrı tek istek olarak kalır.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
    return response.text
