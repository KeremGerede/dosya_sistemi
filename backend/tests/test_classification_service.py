import base64
import json
import logging
import os
import shutil
import subprocess
import sys
import unicodedata
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


SAMPLE_SUMMARY = "Vatandaş çöp konteynerlerinin boşaltılmadığını bildiriyor."


def model_output(
    document_type=VALID_DOCUMENT_TYPE, institution_id=VALID_INSTITUTION, needs_review=False, review_reason=None,
    summary=SAMPLE_SUMMARY, sender_name=None, sender_institution=None, **extra,
):
    """extra: ör. routing_evidence (D-050); verilmezse alan yanıtta hiç yoktur."""
    return json.dumps(
        {
            "document_type": document_type,
            "institution_id": institution_id,
            "needs_review": needs_review,
            "review_reason": review_reason,
            "summary": summary,
            "sender_name": sender_name,
            "sender_institution": sender_institution,
            **extra,
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


def test_catalog_name_maps_match_catalog_files():
    """Gösterim adları katalog dosyalarından türetilir; kodda ayrı bir eşleme tutulmaz (D-032)."""
    assert classification_service.DOCUMENT_TYPE_NAMES == {item["id"]: item["name"] for item in DOCUMENT_TYPES}
    assert classification_service.INSTITUTION_NAMES == {item["id"]: item["name"] for item in INSTITUTIONS}


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


def test_failed_attempt_logs_hide_model_output_raw_api_body_and_document_text(fake_gemini, sleeps, caplog):
    leaked_reason = "MODELIN_URETTIGI_GEREKCE"
    leaked_summary = "MODELIN_URETTIGI_OZET"
    leaked_sender_name = "MODELIN_URETTIGI_GONDEREN_KISI"
    leaked_sender_institution = "MODELIN_URETTIGI_GONDEREN_KURUM"
    fake_gemini(
        model_output(  # tutarsız çıktı
            needs_review=False, review_reason=leaked_reason, summary=leaked_summary,
            sender_name=leaked_sender_name, sender_institution=leaked_sender_institution,
        ),
        f'{{"document_type": "{leaked_reason}"',  # bozuk JSON
        api_error(503),  # ham gövde: "ham hata 503"
    )

    with caplog.at_level(logging.DEBUG), pytest.raises(ClassificationError):
        classify_text(SAMPLE_TEXT)

    assert leaked_reason not in caplog.text
    # summary ve gönderen bilgisi de model çıktısıdır; loglara girmemeli (D-044).
    assert leaked_summary not in caplog.text
    assert leaked_sender_name not in caplog.text
    assert leaked_sender_institution not in caplog.text
    assert "ham hata" not in caplog.text
    assert SAMPLE_TEXT not in caplog.text
    # Güvenli bağlam kalır: deneme numarası, hata türü, HTTP kodu ve şema hatası türü.
    assert all(f"{attempt}/{MAX_ATTEMPTS}" in caplog.text for attempt in (1, 2, 3))
    assert "InvalidModelOutputError" in caplog.text and "value_error" in caplog.text and "json_invalid" in caplog.text
    assert "ServerError" in caplog.text and "HTTP 503" in caplog.text


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


# --- Özet ve gönderen bilgisi aynı çağrıda (V1.2 · Adım 2, D-044) ---


def test_output_schema_includes_summary_and_sender_fields():
    properties = OUTPUT_MODEL.model_json_schema()["properties"]

    assert properties["summary"]["type"] == "string"
    for field in ("sender_name", "sender_institution"):
        assert {"type": "null"} in properties[field]["anyOf"]
        assert {"type": "string"} in properties[field]["anyOf"]


def test_prompt_explains_summary_and_sender_rules():
    prompt = classification_service.build_prompt(SAMPLE_TEXT)

    assert "summary" in prompt and "1-3 kısa Türkçe cümle" in prompt
    assert "sender_name" in prompt and "sender_institution" in prompt
    # Uydurma ve muhatap/gönderen karışıklığına karşı açık talimat bulunmalı.
    assert "tahmin etme" in prompt
    assert "gönderen kurum değildir" in prompt


def test_summary_and_sender_are_returned_in_a_single_call(fake_gemini):
    fake = fake_gemini(model_output(sender_name="Ayşe Yılmaz", sender_institution="X Derneği"))

    result = classification_service.classify_text(SAMPLE_TEXT)

    assert (result.summary, result.sender_name, result.sender_institution) == (
        SAMPLE_SUMMARY, "Ayşe Yılmaz", "X Derneği",
    )
    assert len(fake.prompts) == 1  # üç alan için ek çağrı yok


def test_missing_sender_information_stays_null(fake_gemini):
    fake_gemini(model_output())

    result = classification_service.classify_text(SAMPLE_TEXT)

    assert result.sender_name is None and result.sender_institution is None
    assert result.summary == SAMPLE_SUMMARY


@pytest.mark.parametrize("bad_summary", ["", "   "])
def test_empty_summary_is_invalid_output_and_retried(fake_gemini, sleeps, bad_summary):
    fake = fake_gemini(model_output(summary=bad_summary), model_output())

    result = classification_service.classify_text(SAMPLE_TEXT)

    assert result.summary == SAMPLE_SUMMARY
    assert len(fake.prompts) == 2  # boş özet geçici model hatası sayılır (D-033)
    assert sleeps == [1]


def test_output_without_summary_field_is_retried(fake_gemini, sleeps):
    without_summary = json.dumps(
        {
            "document_type": VALID_DOCUMENT_TYPE, "institution_id": VALID_INSTITUTION,
            "needs_review": False, "review_reason": None,
            "sender_name": None, "sender_institution": None,
        }
    )
    fake = fake_gemini(without_summary, model_output())

    result = classification_service.classify_text(SAMPLE_TEXT)

    assert result.summary == SAMPLE_SUMMARY
    assert len(fake.prompts) == 2


def test_retry_and_timeout_policy_is_unchanged_with_new_fields(fake_gemini, sleeps):
    """Üç alan eklendikten sonra da toplam deneme sayısı ve beklemeler D-033'teki gibi kalır."""
    fake = fake_gemini(api_error(503), api_error(503), model_output())

    result = classification_service.classify_text(SAMPLE_TEXT)

    assert result.summary == SAMPLE_SUMMARY
    assert len(fake.prompts) == 3
    assert sleeps == [1, 2]


def test_prompt_forbids_deriving_sender_institution_from_a_person():
    """D-044: kurum adı metinde açıkça yoksa null; kişi adı/unvanından kurum türetilemez."""
    prompt = classification_service.build_prompt(SAMPLE_TEXT)

    # Kurum yalnızca metinde kurum adı olarak açıkça yazılıysa doldurulur.
    assert "kurum adı olarak açıkça ve doğrudan yazılıysa" in prompt
    assert "Gönderen kurumun tam adı metinde açıkça yoksa null ver" in prompt
    # Kişi adı/soyadı/unvanından kurum üretmek açıkça yasaktır (B2-12: "Beyaz Proje").
    assert "kurum adı TÜRETME" in prompt
    assert "Beyaz Proje" in prompt
    # Metinde yalnızca konu olarak geçen üçüncü kurumlar da gönderen değildir.
    assert "konu olarak geçen üçüncü kurumlar da gönderen değildir" in prompt


def test_prompt_forbids_splitting_or_inventing_sender_name():
    """D-044: kişinin adı parçalanmaz, yeni isim üretilmez; tam ad yoksa null."""
    prompt = classification_service.build_prompt(SAMPLE_TEXT)

    assert "Kişinin adını parçalama ve yeni bir isim oluşturma" in prompt
    assert "belgede yazan adı soyadını olduğu gibi kullan" in prompt
    assert "Açıkça yazmıyorsa null ver" in prompt and "isim üretme" in prompt


# --- Routing evidence: aynı çağrı, kaynakta birebir doğrulama (D-050) ---

EVIDENCE_TEXT = (
    "Sayın Yetkili, Fen İşleri Müdürlüğü'ne şikâyetimdir: Kaldırım taşları kırık ve yaya geçişi tehlikeli. "
    "Gereğinin yapılmasını arz ederim. Ayşe Yılmaz"
)
TYPE_QUOTE = "Kaldırım taşları kırık ve yaya geçişi tehlikeli"
INSTITUTION_QUOTE = "Fen İşleri Müdürlüğü'ne"
BOTH_QUOTE = "Fen İşleri Müdürlüğü'ne şikâyetimdir"
NEEDS_REVIEW_FIELDS = {"document_type": "other", "institution_id": None, "needs_review": True, "review_reason": "Kurum belirsiz."}


def evidence(quote, supports="document_type"):
    return {"quote": quote, "supports": supports}


def classify_with_evidence(fake_gemini, items, text=EVIDENCE_TEXT, **fields):
    fake = fake_gemini(model_output(routing_evidence=items, **fields))
    result = classify_text(text)
    assert len(fake.prompts) == 1  # evidence için ek çağrı yok
    return [(item.quote, item.supports) for item in result.routing_evidence]


def test_valid_exact_quote_is_returned(fake_gemini):
    assert classify_with_evidence(fake_gemini, [evidence(TYPE_QUOTE)]) == [(TYPE_QUOTE, "document_type")]


def test_empty_evidence_list_is_valid(fake_gemini):
    assert classify_with_evidence(fake_gemini, []) == []


@pytest.mark.parametrize("supports, quote", [("document_type", TYPE_QUOTE), ("institution", INSTITUTION_QUOTE), ("both", BOTH_QUOTE)])
def test_single_evidence_keeps_its_supports_value(fake_gemini, supports, quote):
    assert classify_with_evidence(fake_gemini, [evidence(quote, supports)]) == [(quote, supports)]


def test_two_valid_evidence_are_returned_in_model_order(fake_gemini):
    items = [evidence(INSTITUTION_QUOTE, "institution"), evidence(TYPE_QUOTE)]

    assert classify_with_evidence(fake_gemini, items) == [(INSTITUTION_QUOTE, "institution"), (TYPE_QUOTE, "document_type")]


def test_only_first_two_valid_evidence_are_kept(fake_gemini):
    items = [evidence(TYPE_QUOTE), evidence(INSTITUTION_QUOTE, "institution"), evidence(BOTH_QUOTE, "both"), evidence("Sayın Yetkili")]

    assert classify_with_evidence(fake_gemini, items) == [(TYPE_QUOTE, "document_type"), (INSTITUTION_QUOTE, "institution")]


def test_invalid_first_candidates_do_not_hide_a_later_valid_one(fake_gemini):
    items = [evidence("Belgede geçmeyen bir ifade"), evidence("x" * 301), evidence(TYPE_QUOTE)]

    assert classify_with_evidence(fake_gemini, items) == [(TYPE_QUOTE, "document_type")]


def test_quote_not_in_source_is_discarded(fake_gemini):
    items = [evidence("Zabıta Müdürlüğü'ne", "institution"), evidence(TYPE_QUOTE)]

    assert classify_with_evidence(fake_gemini, items) == [(TYPE_QUOTE, "document_type")]


def test_quote_over_300_characters_is_discarded_and_300_is_kept(fake_gemini):
    text = f"{EVIDENCE_TEXT} {'ab' * 300}"
    items = [evidence("ab" * 150 + "a"), evidence("ab" * 150)]

    assert classify_with_evidence(fake_gemini, items, text=text) == [("ab" * 150, "document_type")]


def test_verified_generic_quote_is_not_filtered_semantically(fake_gemini):
    """Boilerplate'ten kaçınmak prompt'un işidir; backend anlamsal kara liste uygulamaz (D-050)."""
    generic = "Gereğinin yapılmasını arz ederim."

    assert classify_with_evidence(fake_gemini, [evidence(generic)]) == [(generic, "document_type")]


@pytest.mark.parametrize("empty_quote", ["", "   ", '""', "“ ”"])
def test_empty_quote_is_discarded(fake_gemini, empty_quote):
    assert classify_with_evidence(fake_gemini, [evidence(empty_quote), evidence(TYPE_QUOTE)]) == [(TYPE_QUOTE, "document_type")]


def test_duplicate_normalized_quote_is_discarded(fake_gemini):
    items = [
        evidence(TYPE_QUOTE),
        evidence("Kaldırım  taşları\nkırık ve yaya geçişi tehlikeli", "both"),  # normalize edilince aynı ifade
        evidence(INSTITUTION_QUOTE, "institution"),
    ]

    assert classify_with_evidence(fake_gemini, items) == [(TYPE_QUOTE, "document_type"), (INSTITUTION_QUOTE, "institution")]


def test_whitespace_is_normalized_in_quote_and_source(fake_gemini):
    text = "Sayın Yetkili,\nFen  İşleri\tMüdürlüğü'ne şikâyetimdir:\n\nKaldırım taşları kırık ve yaya geçişi tehlikeli."
    items = [evidence(" Kaldırım taşları\n kırık  ve yaya\tgeçişi tehlikeli "), evidence(INSTITUTION_QUOTE, "institution")]

    assert classify_with_evidence(fake_gemini, items, text=text) == [(TYPE_QUOTE, "document_type"), (INSTITUTION_QUOTE, "institution")]


@pytest.mark.parametrize("source_form, quote_form", [("NFD", "NFC"), ("NFC", "NFD")], ids=["decomposed-source", "decomposed-quote"])
def test_nfc_canonical_equivalence_matches(fake_gemini, source_form, quote_form):
    text = unicodedata.normalize(source_form, EVIDENCE_TEXT)
    quote = unicodedata.normalize(quote_form, TYPE_QUOTE)
    assert unicodedata.normalize("NFD", TYPE_QUOTE) != TYPE_QUOTE  # örnek gerçekten ayrışık biçim içeriyor

    assert classify_with_evidence(fake_gemini, [evidence(quote)], text=text) == [(TYPE_QUOTE, "document_type")]


@pytest.mark.parametrize("quoted", [f'"{INSTITUTION_QUOTE}"', f"'{INSTITUTION_QUOTE}'", f"“{INSTITUTION_QUOTE}”", f"‘{INSTITUTION_QUOTE}’", f"«{INSTITUTION_QUOTE}»"])
def test_one_matching_outer_quote_pair_is_stripped(fake_gemini, quoted):
    assert classify_with_evidence(fake_gemini, [evidence(quoted, "institution")]) == [(INSTITUTION_QUOTE, "institution")]


@pytest.mark.parametrize("quoted", [f'""{INSTITUTION_QUOTE}""', f'“{INSTITUTION_QUOTE}"', f'"{INSTITUTION_QUOTE}'], ids=["two-pairs", "mismatched", "opening-only"])
def test_only_a_single_matching_outer_pair_is_stripped(fake_gemini, quoted):
    assert classify_with_evidence(fake_gemini, [evidence(quoted, "institution")]) == []


@pytest.mark.parametrize(
    "changed_quote",
    [
        "kaldırım taşları kırık ve yaya geçişi tehlikeli",  # büyük/küçük harf
        "KALDIRIM TAŞLARI KIRIK VE YAYA GEÇİŞİ TEHLİKELİ",  # büyük/küçük harf
        "Kaldırım tasları kırık ve yaya geçişi tehlikeli",  # ş → s
        "Kaldirim taşları kirik ve yaya geçişi tehlikeli",  # ı → i
        "Fen Işleri Müdürlüğü'ne",  # İ → I
        "Fen İşleri Mudurlugu'ne",  # ü/ğ → u/g
    ],
    ids=["lowercase", "uppercase", "s-folding", "dotless-i-folding", "dotted-I-folding", "ascii-folding"],
)
def test_case_and_turkish_character_differences_are_discarded(fake_gemini, changed_quote):
    assert classify_with_evidence(fake_gemini, [evidence(changed_quote)]) == []


def test_quote_after_first_50000_characters_is_discarded(fake_gemini):
    text = f"{EVIDENCE_TEXT} {'x' * MAX_GEMINI_TEXT_LENGTH} Sınır sonrası ifade"
    items = [evidence("Sınır sonrası ifade"), evidence(TYPE_QUOTE)]

    assert classify_with_evidence(fake_gemini, items, text=text) == [(TYPE_QUOTE, "document_type")]


@pytest.mark.parametrize("supports, quote", [("institution", INSTITUTION_QUOTE), ("both", BOTH_QUOTE)])
def test_institution_evidence_is_discarded_when_institution_is_null(fake_gemini, supports, quote):
    items = [evidence(quote, supports), evidence(TYPE_QUOTE)]

    assert classify_with_evidence(fake_gemini, items, **NEEDS_REVIEW_FIELDS) == [(TYPE_QUOTE, "document_type")]


MALFORMED_EVIDENCE = {
    "null": None,
    "string": "bozuk",
    "number": 5,
    "object-instead-of-list": evidence(TYPE_QUOTE),
    "non-object-items": [1, "x", None, [TYPE_QUOTE]],
    "missing-quote": [{"supports": "document_type"}],
    "missing-supports": [{"quote": TYPE_QUOTE}],
    "non-string-quote": [{"quote": 3, "supports": "document_type"}],
    "unknown-supports": [{"quote": TYPE_QUOTE, "supports": "yanlis"}],
    "unhashable-supports": [{"quote": TYPE_QUOTE, "supports": ["document_type"]}],
}


@pytest.mark.parametrize("malformed", MALFORMED_EVIDENCE.values(), ids=MALFORMED_EVIDENCE.keys())
def test_malformed_evidence_becomes_empty_list_without_retry(fake_gemini, sleeps, malformed):
    fake = fake_gemini(model_output(routing_evidence=malformed))

    result = classify_text(EVIDENCE_TEXT)

    assert result.routing_evidence == []
    assert (result.document_type, result.institution_id, result.needs_review) == (VALID_DOCUMENT_TYPE, VALID_INSTITUTION, False)
    assert len(fake.prompts) == 1 and sleeps == []


def test_missing_evidence_field_becomes_empty_list_without_retry(fake_gemini, sleeps):
    fake = fake_gemini(model_output())  # routing_evidence alanı yok

    assert classify_text(EVIDENCE_TEXT).routing_evidence == []
    assert len(fake.prompts) == 1 and sleeps == []


def test_invalid_item_is_dropped_and_valid_item_is_kept_without_retry(fake_gemini, sleeps):
    items = [{"quote": TYPE_QUOTE, "supports": ["both"]}, evidence(INSTITUTION_QUOTE, "institution")]

    assert classify_with_evidence(fake_gemini, items) == [(INSTITUTION_QUOTE, "institution")]
    assert sleeps == []


@pytest.mark.parametrize("fields", [{}, NEEDS_REVIEW_FIELDS], ids=["classified", "needs-review"])
def test_evidence_does_not_change_classification_fields(fake_gemini, fields):
    fake_gemini(
        model_output(**fields),
        model_output(**fields, routing_evidence=[evidence(TYPE_QUOTE), evidence("Belgede geçmeyen ifade")]),
    )

    without_evidence = classify_text(EVIDENCE_TEXT)
    with_evidence = classify_text(EVIDENCE_TEXT)

    assert with_evidence.model_dump(exclude={"routing_evidence"}) == without_evidence.model_dump(exclude={"routing_evidence"})
    assert (with_evidence.needs_review, with_evidence.review_reason) == (
        fields.get("needs_review", False), fields.get("review_reason"),
    )
    assert [item.quote for item in with_evidence.routing_evidence] == [TYPE_QUOTE]


def test_missing_verified_evidence_does_not_set_needs_review(fake_gemini):
    fake_gemini(model_output(routing_evidence=[evidence("Belgede geçmeyen ifade")]))

    result = classify_text(EVIDENCE_TEXT)

    assert result.routing_evidence == []
    assert (result.needs_review, result.review_reason) == (False, None)


def test_evidence_quotes_are_not_logged(fake_gemini, sleeps, caplog):
    verified_marker = "GIZLI_DOGRULANAN_IFADE"
    discarded_marker = "GIZLI_DOGRULANMAYAN_IFADE"
    fake_gemini(model_output(routing_evidence=[evidence(verified_marker), evidence(discarded_marker)]))

    with caplog.at_level(logging.DEBUG):
        result = classify_text(f"{EVIDENCE_TEXT} {verified_marker}")

    assert [item.quote for item in result.routing_evidence] == [verified_marker]
    assert verified_marker not in caplog.text and discarded_marker not in caplog.text
    assert EVIDENCE_TEXT not in caplog.text
    assert "2 aday, 1 doğrulandı" in caplog.text  # yalnız sayılar


def test_prompt_requests_verbatim_short_distinctive_evidence():
    prompt = classification_service.build_prompt(SAMPLE_TEXT)

    assert "routing_evidence" in prompt and "en fazla 2 ifade" in prompt
    assert "birebir ve kesintisiz" in prompt and '"..." ile kısaltma' in prompt and "farklı bölümlerini birleştirme" in prompt
    assert "tercihen en fazla 200 karakter" in prompt and "300 karakterden uzun değil" in prompt
    assert "gereğinin yapılmasını arz ederim" in prompt and "genel ifadeleri kullanma" in prompt
    assert "institution_id null ise" in prompt and "boş liste ver" in prompt
    assert "açıklama veya gerekçe değildir" in prompt


def test_prompt_prefers_body_evidence_over_headers_and_closings():
    """Kalite tercihi prompt'tadır; backend anlamsal filtre uygulamaz (D-050)."""
    prompt = classification_service.build_prompt(SAMPLE_TEXT)

    # Önce gövdedeki sorun/talep/amaç ifadesi; muhatap satırı yasak değil ama son tercih.
    assert "önce sorunu, talebi veya başvurunun amacını doğrudan anlatan kısa bir gövde ifadesi" in prompt
    assert "Muhatap satırını" in prompt and "yalnızca başka" in prompt
    # Muhatap, "Konu:" ve gövde tek quote içinde birleştirilmez; yalnız etiket veya yalnız başlık seçilmez.
    assert '"Konu:" kısmı ve gövde metni ayrı bölümlerdir' in prompt
    assert 'Yalnızca "Konu:" etiketini veya yalnızca belge başlığını quote olarak seçme' in prompt
    # Quote standart kapanış kalıbı içermez; kalıp içeren cümle yerine gövdedeki başka bir ifade seçilir.
    assert "quote standart kapanış kalıbı içermemeli" in prompt and '"arz ederiz"' in prompt and '"saygılarımla"' in prompt
    assert "Böyle bir kalıp içeren cümleyi seçme; gövdedeki başka bir sorun, talep veya amaç ifadesini seç" in prompt


def test_output_schema_has_optional_routing_evidence_as_last_field():
    schema = OUTPUT_MODEL.model_json_schema()

    assert list(schema["properties"])[-1] == "routing_evidence"
    assert "routing_evidence" not in schema["required"]
    candidate = schema["$defs"]["RoutingEvidenceCandidate"]
    assert candidate["required"] == ["quote", "supports"]
    assert candidate["properties"]["supports"]["enum"] == ["document_type", "institution", "both"]


def test_real_sdk_sends_routing_evidence_schema_last_without_additional_properties(monkeypatch, sleeps):
    output = model_output(routing_evidence=[evidence(TYPE_QUOTE), evidence("Belgede geçmeyen ifade")])
    requests = use_mock_transport(monkeypatch, lambda request: gemini_http_response(output))

    result = classify_text(EVIDENCE_TEXT)

    assert [item.quote for item in result.routing_evidence] == [TYPE_QUOTE] and len(requests) == 1
    schema = json.loads(requests[0].content)["generationConfig"]["responseSchema"]
    assert schema.get("propertyOrdering", schema.get("property_ordering"))[-1] == "routing_evidence"
    assert "routing_evidence" not in schema["required"]
    evidence_schema = schema["properties"]["routing_evidence"]
    assert evidence_schema["type"] == "ARRAY" and evidence_schema["items"]["type"] == "OBJECT"
    assert evidence_schema["items"]["required"] == ["quote", "supports"]
    assert evidence_schema["items"]["properties"]["supports"]["enum"] == ["document_type", "institution", "both"]
    serialized = json.dumps(schema)
    assert "additionalProperties" not in serialized and "additional_properties" not in serialized


@pytest.mark.parametrize(
    "output",
    [model_output(), model_output(routing_evidence=None), model_output(routing_evidence="bozuk"),
     model_output(routing_evidence=[{"quote": TYPE_QUOTE, "supports": ["both"]}, 7])],
    ids=["missing", "null", "string", "malformed-items"],
)
def test_real_sdk_tolerates_missing_or_malformed_evidence_without_retry(monkeypatch, sleeps, output):
    requests = use_mock_transport(monkeypatch, lambda request: gemini_http_response(output))

    result = classify_text(EVIDENCE_TEXT)

    assert result.routing_evidence == [] and result.document_type == VALID_DOCUMENT_TYPE
    assert len(requests) == 1 and sleeps == []


# --- Gemini transkripsiyonu (V1.3, D-047) ---

IMAGE_BYTES = b"\x89PNG\r\n\x1a\n GIZLI_DOSYA_BAYTLARI"
TRANSCRIPT = "Sayın Belediye Başkanlığına, sokağımızdaki çöpler toplanmıyor. Gereğini arz ederim."


class FakeTranscriber:
    """gemini_client.transcribe yerine geçer; her çağrıda sıradaki sonucu döndürür veya fırlatır."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def __call__(self, data, mime_type, prompt):
        self.calls.append((data, mime_type, prompt))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def fake_transcriber(monkeypatch):
    def install(*outcomes):
        fake = FakeTranscriber(*outcomes)
        monkeypatch.setattr(gemini_client, "transcribe", fake)
        return fake

    return install


def test_transcription_sends_file_bytes_mime_type_and_fixed_prompt(fake_transcriber, sleeps):
    fake = fake_transcriber(TRANSCRIPT)

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == TRANSCRIPT
    assert fake.calls == [(IMAGE_BYTES, "image/png", classification_service.TRANSCRIPTION_PROMPT)]
    assert sleeps == []


def test_transcription_prompt_asks_only_for_verbatim_transcription():
    """Prompt benchmarkta ölçüldüğü haliyle sabittir (D-047): yalnız transkripsiyon; düzeltme, özet, tahmin yok."""
    prompt = classification_service.TRANSCRIPTION_PROMPT

    assert prompt.startswith("Bu bir OCR/transkripsiyon görevidir.")
    for rule in (
        "Metni düzeltme.", "Eksik kelimeleri tahmin etme.", "Özetleme yapma.", "Açıklama veya yorum ekleme.",
        "Okuyamadığın kısmı uydurma.", "Yalnızca transkripsiyon çıktısını döndür.",
    ):
        assert rule in prompt


@pytest.mark.parametrize("empty", [None, "", "  \n "], ids=["none", "empty", "whitespace"])
def test_empty_transcription_is_invalid_output_and_retried(fake_transcriber, sleeps, empty):
    fake = fake_transcriber(empty, TRANSCRIPT)

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == TRANSCRIPT
    assert len(fake.calls) == 2
    assert sleeps == [1]


def test_empty_transcription_on_all_attempts_returns_none(fake_transcriber, sleeps):
    fake = fake_transcriber("", "", "", "")

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") is None
    assert len(fake.calls) == 3
    assert sleeps == [1, 2]


def test_short_but_non_empty_transcription_is_returned_without_retry(fake_transcriber, sleeps):
    """Uzunluk kontrolü çağırana aittir (D-047): kısa ama boş olmayan yanıt yeniden denenmez."""
    fake = fake_transcriber("abc")

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == "abc"
    assert len(fake.calls) == 1
    assert sleeps == []


@pytest.mark.parametrize("error", RETRYABLE_ERRORS.values(), ids=RETRYABLE_ERRORS.keys())
def test_transcription_retryable_error_returns_none_after_three_attempts(fake_transcriber, sleeps, error):
    fake = fake_transcriber(error, error, error, error)

    # Hata yükselmez: çağıran Tesseract yedeğine geçer, prepare'de 502 oluşmaz (D-034, D-047).
    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") is None
    assert len(fake.calls) == 3
    assert sleeps == [1, 2]


@pytest.mark.parametrize("error", RETRYABLE_ERRORS.values(), ids=RETRYABLE_ERRORS.keys())
def test_transcription_retryable_error_can_succeed_on_third_attempt(fake_transcriber, sleeps, error):
    fake = fake_transcriber(error, error, TRANSCRIPT)

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == TRANSCRIPT
    assert len(fake.calls) == 3
    assert sleeps == [1, 2]


@pytest.mark.parametrize("code", [400, 401, 403])
def test_transcription_permanent_client_errors_are_not_retried(fake_transcriber, sleeps, code):
    fake = fake_transcriber(api_error(code), TRANSCRIPT)

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") is None
    assert len(fake.calls) == 1
    assert sleeps == []


def test_transcription_unexpected_error_returns_none_without_retry(fake_transcriber, sleeps):
    fake = fake_transcriber(RuntimeError("beklenmeyen hata"), TRANSCRIPT)

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") is None
    assert len(fake.calls) == 1
    assert sleeps == []


def test_transcription_logs_hide_transcript_file_bytes_and_raw_api_body(fake_transcriber, sleeps, caplog):
    fake_transcriber(api_error(503), "", TRANSCRIPT)

    with caplog.at_level(logging.DEBUG):
        assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == TRANSCRIPT

    assert TRANSCRIPT not in caplog.text and "Belediye" not in caplog.text
    assert "GIZLI_DOSYA_BAYTLARI" not in caplog.text
    assert "ham hata" not in caplog.text
    # Güvenli bağlam kalır: deneme numarası, hata türü ve HTTP kodu.
    assert "1/3" in caplog.text and "2/3" in caplog.text
    assert "HTTP 503" in caplog.text and "InvalidModelOutputError" in caplog.text


@pytest.mark.parametrize(
    "handler, expected_requests, expected_sleeps",
    [
        (respond_status(503), 3, [1, 2]),
        (respond_status(500), 3, [1, 2]),
        (respond_status(429), 3, [1, 2]),
        (raise_error(httpx.ReadTimeout("zaman aşımı")), 3, [1, 2]),
        (raise_error(httpx.ConnectError("bağlantı yok")), 3, [1, 2]),
        (lambda request: gemini_http_response(""), 3, [1, 2]),
        (respond_status(400), 1, []),
        (respond_status(401), 1, []),
        (respond_status(403), 1, []),
    ],
    ids=["503", "500", "429", "timeout", "network", "empty-output", "400", "401", "403"],
)
def test_real_sdk_transcription_sends_at_most_three_http_requests(
    monkeypatch, sleeps, caplog, handler, expected_requests, expected_sleeps
):
    requests = use_mock_transport(monkeypatch, handler)

    with caplog.at_level(logging.DEBUG):
        assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") is None

    assert len(requests) == expected_requests
    assert sleeps == expected_sleeps
    assert "test-api-key" not in caplog.text


def test_real_sdk_transcription_sends_inline_file_and_prompt_without_schema(monkeypatch, sleeps):
    requests = use_mock_transport(monkeypatch, lambda request: gemini_http_response(TRANSCRIPT))

    assert classification_service.transcribe_document(IMAGE_BYTES, "image/png") == TRANSCRIPT

    [request] = requests
    assert request.url.path.endswith("/models/test-model:generateContent")
    assert "test-api-key" not in str(request.url)
    assert request.extensions["timeout"]["read"] == 30.0
    body = json.loads(request.content)
    [content] = body["contents"]
    file_part, prompt_part = content["parts"]
    assert file_part["inlineData"]["mimeType"] == "image/png"
    assert base64.b64decode(file_part["inlineData"]["data"]) == IMAGE_BYTES
    assert prompt_part["text"] == classification_service.TRANSCRIPTION_PROMPT
    config = body["generationConfig"]
    assert config["temperature"] == 0
    assert "responseSchema" not in config and "responseMimeType" not in config
