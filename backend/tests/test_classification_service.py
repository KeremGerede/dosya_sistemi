import json
import logging
import os
import shutil
import subprocess
import sys
from pathlib import Path

import httpx
import pytest
from google import genai
from google.genai import errors as genai_errors

from app.llm import gemini_client
from app.services import classification_service
from app.services.classification_service import (
    CONFIG_DIR,
    MAX_ATTEMPTS,
    MAX_GEMINI_TEXT_LENGTH,
    OUTPUT_MODEL,
    ClassificationError,
    classify_text,
    load_catalogs,
)

DOCUMENT_TYPES, INSTITUTIONS = load_catalogs()
DOCUMENT_TYPE_IDS = [item["id"] for item in DOCUMENT_TYPES]
INSTITUTION_IDS = [item["id"] for item in INSTITUTIONS]
VALID_DOCUMENT_TYPE = DOCUMENT_TYPE_IDS[0]
VALID_INSTITUTION = INSTITUTION_IDS[0]
SAMPLE_TEXT = "Sayın Yetkili, mahallemizdeki çöp konteynerleri bir haftadır boşaltılmıyor."
GENERIC_ERROR_MESSAGE = "Belge Gemini ile sınıflandırılamadı."


def model_output(document_type=VALID_DOCUMENT_TYPE, institution_id=VALID_INSTITUTION, needs_review=False, review_reason=None):
    return json.dumps(
        {
            "document_type": document_type,
            "institution_id": institution_id,
            "needs_review": needs_review,
            "review_reason": review_reason,
        }
    )


def api_error(code: int) -> genai_errors.APIError:
    error_class = genai_errors.ServerError if code >= 500 else genai_errors.ClientError
    return error_class(code, {"error": {"code": code, "message": f"ham hata {code}", "status": "TEST"}})


class FakeGemini:
    """gemini_client.generate_json yerine geçer; her çağrıda sıradaki sonucu döndürür veya fırlatır."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.prompts = []
        self.schemas = []

    def __call__(self, prompt, response_schema):
        self.prompts.append(prompt)
        self.schemas.append(response_schema)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def sleeps(monkeypatch):
    calls = []
    monkeypatch.setattr(classification_service.time, "sleep", calls.append)
    return calls


@pytest.fixture
def fake_gemini(monkeypatch):
    def install(*outcomes):
        fake = FakeGemini(*outcomes)
        monkeypatch.setattr(gemini_client, "generate_json", fake)
        return fake

    return install


# --- Kataloglar, şema ve prompt ---


def test_catalogs_are_loaded_from_config_files():
    assert DOCUMENT_TYPES == json.loads((CONFIG_DIR / "document_types.json").read_text(encoding="utf-8"))
    assert INSTITUTIONS == json.loads((CONFIG_DIR / "institutions.json").read_text(encoding="utf-8"))
    assert "other" in DOCUMENT_TYPE_IDS
    assert all(set(item) == {"id", "name", "description"} for item in INSTITUTIONS)


def write_catalogs(config_dir: Path, document_type_ids: list[str]) -> None:
    config_dir.mkdir()
    document_types = [{"id": item_id, "name": item_id} for item_id in document_type_ids]
    (config_dir / "document_types.json").write_text(json.dumps(document_types), encoding="utf-8")
    shutil.copy(CONFIG_DIR / "institutions.json", config_dir / "institutions.json")


def test_catalog_with_other_loads_normally(tmp_path, monkeypatch):
    write_catalogs(tmp_path / "config", ["complaint", "other"])
    monkeypatch.setattr(classification_service, "CONFIG_DIR", tmp_path / "config")

    document_types, institutions = load_catalogs()

    assert [item["id"] for item in document_types] == ["complaint", "other"]
    assert institutions == INSTITUTIONS


def test_catalog_without_other_raises_configuration_error(tmp_path, monkeypatch):
    write_catalogs(tmp_path / "config", ["complaint", "request"])
    monkeypatch.setattr(classification_service, "CONFIG_DIR", tmp_path / "config")

    with pytest.raises(RuntimeError, match='Yapılandırma hatası: document_types.json içinde "other"'):
        load_catalogs()


def test_service_does_not_load_without_other_so_gemini_is_never_called(tmp_path):
    """Kataloglar modül yüklenirken okunur: "other" yoksa servis hiç yüklenmez, classify_text'e ulaşılamaz."""
    shutil.copytree(CONFIG_DIR.parent, tmp_path / "app", ignore=shutil.ignore_patterns("__pycache__"))
    catalog_path = tmp_path / "app" / "config" / "document_types.json"
    without_other = [item for item in DOCUMENT_TYPES if item["id"] != "other"]
    catalog_path.write_text(json.dumps(without_other, ensure_ascii=False), encoding="utf-8")

    result = subprocess.run(
        [sys.executable, "-c", "import app.services.classification_service"],
        cwd=tmp_path,
        env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"},
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode != 0
    assert 'Yapılandırma hatası: document_types.json içinde "other"' in result.stderr


def test_output_schema_allows_only_catalog_ids():
    properties = OUTPUT_MODEL.model_json_schema()["properties"]

    assert properties["document_type"]["enum"] == DOCUMENT_TYPE_IDS
    institution_options = properties["institution_id"]["anyOf"]
    assert {"enum": INSTITUTION_IDS, "type": "string"} in institution_options
    assert {"type": "null"} in institution_options


def test_prompt_contains_rules_catalogs_and_text(fake_gemini, sleeps):
    fake = fake_gemini(model_output())

    classify_text(SAMPLE_TEXT)

    prompt = fake.prompts[0]
    assert SAMPLE_TEXT in prompt
    assert '"other"' in prompt and "null ver" in prompt and "needs_review" in prompt
    for item in DOCUMENT_TYPES + INSTITUTIONS:
        assert item["id"] in prompt and item["name"] in prompt
    for item in INSTITUTIONS:
        assert item["description"] in prompt
    assert fake.schemas[0] is OUTPUT_MODEL


def test_only_first_50000_characters_are_sent_to_gemini(fake_gemini, sleeps):
    fake = fake_gemini(model_output())
    text = "a" * MAX_GEMINI_TEXT_LENGTH + "SINIR_SONRASI"

    classify_text(text)

    assert "a" * MAX_GEMINI_TEXT_LENGTH in fake.prompts[0]
    assert "SINIR_SONRASI" not in fake.prompts[0]
    assert len(text) == MAX_GEMINI_TEXT_LENGTH + len("SINIR_SONRASI")


# --- Başarılı sonuçlar ---


def test_classified_result(fake_gemini, sleeps):
    fake = fake_gemini(model_output(needs_review=False, review_reason=None))

    result = classify_text(SAMPLE_TEXT)

    assert (result.document_type, result.institution_id, result.needs_review, result.review_reason) == (
        VALID_DOCUMENT_TYPE, VALID_INSTITUTION, False, None,
    )
    assert len(fake.prompts) == 1 and sleeps == []


def test_needs_review_result(fake_gemini, sleeps):
    fake_gemini(model_output(document_type="other", institution_id=None, needs_review=True, review_reason="Kurum belirsiz."))

    result = classify_text(SAMPLE_TEXT)

    assert (result.document_type, result.institution_id, result.needs_review, result.review_reason) == (
        "other", None, True, "Kurum belirsiz.",
    )


# --- Geçersiz model çıktısı: retry edilir ---

INVALID_OUTPUTS = {
    "unknown-document-type": model_output(document_type="uydurma_tur"),
    "unknown-institution": model_output(institution_id="uydurma_kurum"),
    "not-review-without-institution": model_output(institution_id=None, needs_review=False),
    "not-review-with-reason": model_output(needs_review=False, review_reason="Gereksiz gerekçe"),
    "review-without-reason": model_output(needs_review=True, review_reason=None),
    "review-with-blank-reason": model_output(needs_review=True, review_reason="   "),
    "not-json": "bu bir JSON değil",
    "missing-field": json.dumps({"document_type": VALID_DOCUMENT_TYPE, "needs_review": True, "review_reason": "x"}),
    "empty-response": None,
}


@pytest.mark.parametrize("invalid_output", INVALID_OUTPUTS.values(), ids=INVALID_OUTPUTS.keys())
def test_invalid_model_output_is_retried(fake_gemini, sleeps, invalid_output):
    fake = fake_gemini(invalid_output, model_output())

    result = classify_text(SAMPLE_TEXT)

    assert result.document_type == VALID_DOCUMENT_TYPE
    assert len(fake.prompts) == 2
    assert sleeps == [1]


def test_invalid_output_on_all_attempts_raises_after_three_attempts(fake_gemini, sleeps):
    fake = fake_gemini(*[model_output(document_type="uydurma_tur")] * 5)

    with pytest.raises(ClassificationError):
        classify_text(SAMPLE_TEXT)

    assert len(fake.prompts) == MAX_ATTEMPTS == 3
    assert sleeps == [1, 2]


# --- API ve ağ hataları ---

RETRYABLE_ERRORS = {
    "network": httpx.ConnectError("bağlantı kurulamadı"),
    "timeout": httpx.ReadTimeout("zaman aşımı"),
    "429": api_error(429),
    "500": api_error(500),
    "503": api_error(503),
}


@pytest.mark.parametrize("error", RETRYABLE_ERRORS.values(), ids=RETRYABLE_ERRORS.keys())
def test_retryable_error_is_retried_with_1s_and_2s_waits_then_fails(fake_gemini, sleeps, error):
    fake = fake_gemini(error, error, error, error, error)

    with pytest.raises(ClassificationError) as exc_info:
        classify_text(SAMPLE_TEXT)

    assert len(fake.prompts) == 3
    assert sleeps == [1, 2]
    assert exc_info.value.__cause__ is error


@pytest.mark.parametrize("error", RETRYABLE_ERRORS.values(), ids=RETRYABLE_ERRORS.keys())
def test_retryable_error_can_succeed_on_third_attempt(fake_gemini, sleeps, error):
    fake = fake_gemini(error, error, model_output())

    assert classify_text(SAMPLE_TEXT).document_type == VALID_DOCUMENT_TYPE
    assert len(fake.prompts) == 3
    assert sleeps == [1, 2]


@pytest.mark.parametrize("code", [400, 401, 403])
def test_permanent_client_errors_are_not_retried(fake_gemini, sleeps, code):
    fake = fake_gemini(api_error(code), model_output())

    with pytest.raises(ClassificationError):
        classify_text(SAMPLE_TEXT)

    assert len(fake.prompts) == 1
    assert sleeps == []


def test_error_message_is_generic_and_hides_raw_api_details(fake_gemini, sleeps):
    fake_gemini(api_error(401))

    with pytest.raises(ClassificationError) as exc_info:
        classify_text(SAMPLE_TEXT)

    assert str(exc_info.value) == GENERIC_ERROR_MESSAGE
    assert "ham hata" not in str(exc_info.value)
    assert "ham hata 401" in str(exc_info.value.__cause__)


# --- Gerçek SDK istemcisi + sahte HTTP transport: SDK retry'ı toplam deneme sayısını artırmaz ---


def test_client_uses_30_second_timeout_and_disables_sdk_retry():
    assert gemini_client.HTTP_OPTIONS.timeout == 30_000  # milisaniye
    assert gemini_client.HTTP_OPTIONS.retry_options.attempts == 1


def gemini_http_response(output: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"candidates": [{"content": {"role": "model", "parts": [{"text": output}]}, "finishReason": "STOP"}]},
    )


def use_mock_transport(monkeypatch, handler) -> list[httpx.Request]:
    """Üretimdeki HTTP_OPTIONS ile gerçek SDK istemcisi kurar; yalnızca ağ katmanı sahtedir."""
    requests = []

    def recording_handler(request):
        requests.append(request)
        return handler(request)

    options = gemini_client.HTTP_OPTIONS.model_copy(
        update={"client_args": {"transport": httpx.MockTransport(recording_handler)}}
    )
    monkeypatch.setattr(gemini_client, "_client", genai.Client(api_key="test-api-key", http_options=options))
    return requests


def raise_error(error):
    def handler(request):
        raise error

    return handler


def respond_status(code):
    return lambda request: httpx.Response(code, json={"error": {"code": code, "message": "sahte", "status": "TEST"}})


@pytest.mark.parametrize(
    "handler, expected_requests, expected_sleeps",
    [
        (respond_status(503), 3, [1, 2]),
        (respond_status(500), 3, [1, 2]),
        (respond_status(429), 3, [1, 2]),
        (raise_error(httpx.ReadTimeout("zaman aşımı")), 3, [1, 2]),
        (raise_error(httpx.ConnectError("bağlantı yok")), 3, [1, 2]),
        (lambda request: gemini_http_response(model_output(document_type="uydurma_tur")), 3, [1, 2]),
        (respond_status(400), 1, []),
        (respond_status(401), 1, []),
        (respond_status(403), 1, []),
    ],
    ids=["503", "500", "429", "timeout", "network", "invalid-output", "400", "401", "403"],
)
def test_real_sdk_sends_at_most_three_http_requests(monkeypatch, sleeps, caplog, handler, expected_requests, expected_sleeps):
    requests = use_mock_transport(monkeypatch, handler)

    with caplog.at_level(logging.DEBUG), pytest.raises(ClassificationError):
        classify_text(SAMPLE_TEXT)

    assert len(requests) == expected_requests
    assert sleeps == expected_sleeps
    assert "test-api-key" not in caplog.text


def test_real_sdk_success_sends_catalog_schema_with_timeout(monkeypatch, sleeps):
    requests = use_mock_transport(monkeypatch, lambda request: gemini_http_response(model_output()))

    result = classify_text(SAMPLE_TEXT)

    assert result.document_type == VALID_DOCUMENT_TYPE and len(requests) == 1
    request = requests[0]
    assert request.url.path.endswith("/models/test-model:generateContent")
    assert "test-api-key" not in str(request.url)
    assert request.extensions["timeout"]["read"] == 30.0
    config = json.loads(request.content)["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["temperature"] == 0
    schema = config["responseSchema"]["properties"]
    assert schema["document_type"]["enum"] == DOCUMENT_TYPE_IDS
    assert schema["institution_id"]["enum"] == INSTITUTION_IDS and schema["institution_id"]["nullable"] is True
