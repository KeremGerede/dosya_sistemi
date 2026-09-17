import io
import logging
import tempfile
import uuid
from datetime import datetime, timedelta, timezone

import docx
import pymupdf
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app import database
from app.database import Base, get_db
from app.main import app
from app.models.document import Document
from app.schemas.classification import ClassificationResult
from app.services import classification_service, file_service

DOCUMENT_TYPES, INSTITUTIONS = classification_service.load_catalogs()
DOCUMENT_TYPE = DOCUMENT_TYPES[0]["id"]
DOCUMENT_TYPE_NAME = DOCUMENT_TYPES[0]["name"]
INSTITUTION = INSTITUTIONS[0]["id"]
INSTITUTION_NAME = INSTITUTIONS[0]["name"]
CLASSIFY_URL = "/api/documents/classify"
SECRET_MARKER = "GIZLI_BELGE_ICERIGI"  # loglarda görünmemesi gereken belge metni işareti
PDF_TEXT = f"Sayin yetkili, sokagimizdaki copler toplanmiyor. {SECRET_MARKER}"
DOCX_TEXT = f"Sayın yetkili, parktaki salıncak kırık. {SECRET_MARKER}"
RESPONSE_FIELDS = {
    "document_id", "file_name", "file_type", "document_type", "document_type_name", "institution_id", "institution_name",
    "needs_review", "review_reason", "status",
}
TEXT_FAILED_MESSAGE = "Belgeden sınıflandırma için yeterli metin çıkarılamadı."
CLASSIFICATION_FAILED_MESSAGE = "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."


def make_pdf(text: str) -> bytes:
    with pymupdf.open() as pdf:
        page = pdf.new_page()
        if text:
            page.insert_text((72, 72), text)
        return pdf.tobytes()


def make_docx(text: str) -> bytes:
    document = docx.Document()
    document.add_paragraph(text)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def classification(needs_review: bool = False) -> ClassificationResult:
    if needs_review:
        return ClassificationResult(document_type="other", institution_id=None, needs_review=True, review_reason="Kurum belirsiz.")
    return ClassificationResult(document_type=DOCUMENT_TYPE, institution_id=INSTITUTION, needs_review=False, review_reason=None)


def classification_error() -> classification_service.ClassificationError:
    error = classification_service.ClassificationError("Belge Gemini ile sınıflandırılamadı.")
    error.__cause__ = RuntimeError("ham Gemini hata detayı: API_KEY_INVALID")
    return error


def upload(client: TestClient, file_name: str, content: bytes):
    return client.post(CLASSIFY_URL, files={"file": (file_name, content, "application/octet-stream")})


def all_documents(session_factory) -> list[Document]:
    with session_factory() as session:
        return list(session.scalars(select(Document)))


def stored_files(storage_dir) -> list[str]:
    return sorted(path.name for path in storage_dir.iterdir()) if storage_dir.exists() else []


@pytest.fixture(autouse=True)
def gemini_must_not_be_called_unexpectedly(monkeypatch):
    def unexpected_classify_text(text):
        raise AssertionError("classify_text beklenmedik şekilde çağrıldı")

    monkeypatch.setattr(classification_service, "classify_text", unexpected_classify_text)


@pytest.fixture
def fake_classify(monkeypatch):
    """classification_service.classify_text'i sahte bir sonuç veya exception ile değiştirir; gelen metinleri kaydeder."""
    calls = []

    def install(outcome):
        def classify_text(text):
            calls.append(text)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

        monkeypatch.setattr(classification_service, "classify_text", classify_text)
        return calls

    return install


@pytest.fixture
def storage_dir(tmp_path, monkeypatch):
    path = tmp_path / "storage"
    monkeypatch.setattr(file_service, "STORAGE_DIR", path)
    return path


@pytest.fixture
def session_factory(tmp_path):
    # İzole SQLite test veritabanı. create_all yalnızca testte kullanılır; gerçek şema Alembic ile yönetilir (D-030).
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


@pytest.fixture
def client(session_factory, storage_dir):
    def override_get_db():
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app, raise_server_exceptions=False)
    app.dependency_overrides.clear()


# --- Başarılı akış ---


def test_health_still_works(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.parametrize(
    "file_name, content, file_type, text",
    [("dilekce.pdf", make_pdf(PDF_TEXT), "pdf", PDF_TEXT), ("dilekce.docx", make_docx(DOCX_TEXT), "docx", DOCX_TEXT)],
    ids=["pdf", "docx"],
)
def test_valid_document_is_classified(client, session_factory, storage_dir, fake_classify, caplog, file_name, content, file_type, text):
    calls = fake_classify(classification())

    with caplog.at_level(logging.DEBUG):
        response = upload(client, file_name, content)

    assert response.status_code == 200
    body = response.json()
    assert set(body) == RESPONSE_FIELDS  # file_reference ve extracted_text yanıtta yok
    assert body == {
        "document_id": body["document_id"], "file_name": file_name, "file_type": file_type,
        "document_type": DOCUMENT_TYPE, "document_type_name": DOCUMENT_TYPE_NAME,
        "institution_id": INSTITUTION, "institution_name": INSTITUTION_NAME,
        "needs_review": False, "review_reason": None, "status": "classified",
    }
    [document] = all_documents(session_factory)
    assert str(document.id) == body["document_id"]
    assert document.extracted_text == text
    assert calls == [text]
    assert document.file_reference == f"{document.id}.{file_type}"
    assert (storage_dir / document.file_reference).read_bytes() == content
    assert SECRET_MARKER not in caplog.text


def test_needs_review_result_returns_200_with_needs_review_status(client, session_factory, fake_classify):
    fake_classify(classification(needs_review=True))

    response = upload(client, "dilekce.docx", make_docx(DOCX_TEXT))

    assert response.status_code == 200
    body = response.json()
    assert (body["status"], body["needs_review"], body["institution_id"], body["review_reason"]) == (
        "needs_review", True, None, "Kurum belirsiz.",
    )
    # Kurum atanmadığında ad da null; belge türü adı yine katalogdan gelir.
    assert (body["institution_name"], body["document_type_name"]) == (None, classification_service.DOCUMENT_TYPE_NAMES["other"])
    [document] = all_documents(session_factory)
    assert (document.status, document.needs_review, document.institution_id, document.review_reason) == (
        "needs_review", True, None, "Kurum belirsiz.",
    )


def test_full_extracted_text_is_stored_and_passed_to_classification(client, session_factory, fake_classify):
    long_text = "a" * 60_000
    calls = fake_classify(classification())

    response = upload(client, "uzun.docx", make_docx(long_text))

    assert response.status_code == 200
    [document] = all_documents(session_factory)
    assert document.extracted_text == long_text
    assert calls == [long_text]  # 50.000 karakter kesmesi classification_service içinde yapılır


# --- Kabul öncesi red: kayıt yok, dosya yok ---


def test_file_over_size_limit_returns_413_without_db_or_storage(client, session_factory, storage_dir, monkeypatch):
    content = make_pdf(PDF_TEXT)
    monkeypatch.setattr(file_service, "MAX_FILE_SIZE", len(content) - 1)  # 50 MB dosya üretmeden aynı sınır mantığı

    response = upload(client, "buyuk.pdf", content)

    assert response.status_code == 413
    assert response.json() == {"detail": "Dosya boyutu 50 MB sınırını aşıyor."}
    assert all_documents(session_factory) == []
    assert stored_files(storage_dir) == []


def test_file_exactly_at_size_limit_is_accepted(client, session_factory, monkeypatch, fake_classify):
    content = make_pdf(PDF_TEXT)
    monkeypatch.setattr(file_service, "MAX_FILE_SIZE", len(content))
    fake_classify(classification())

    assert upload(client, "sinirda.pdf", content).status_code == 200
    assert len(all_documents(session_factory)) == 1


def test_upload_is_read_with_size_limit_not_fully(client, monkeypatch):
    read_sizes = []
    original_read = tempfile.SpooledTemporaryFile.read

    def recording_read(self, *args):
        read_sizes.append(args[0] if args else None)
        return original_read(self, *args)

    monkeypatch.setattr(tempfile.SpooledTemporaryFile, "read", recording_read)
    monkeypatch.setattr(file_service, "MAX_FILE_SIZE", 1000)

    response = upload(client, "buyuk.pdf", b"%PDF" + b"0" * 5000)

    assert response.status_code == 413
    assert read_sizes == [1001]


@pytest.mark.parametrize(
    "file_name, content",
    [
        ("dilekce.txt", b"duz metin dosyasi"),
        ("dilekce.doc", make_docx(DOCX_TEXT)),
        ("dilekce.pdf", b"PDF olmayan icerik"),
        ("dilekce.docx", b"PK ama docx degil"),
    ],
    ids=["txt", "doc", "fake-pdf", "fake-docx"],
)
def test_unsupported_file_returns_415_without_db_or_storage(client, session_factory, storage_dir, file_name, content):
    response = upload(client, file_name, content)

    assert response.status_code == 415
    assert response.json() == {"detail": "Yalnızca metin tabanlı PDF veya DOCX dosyaları kabul edilir."}
    assert all_documents(session_factory) == []
    assert stored_files(storage_dir) == []


def test_missing_file_returns_validation_error_without_db_or_storage(client, session_factory, storage_dir):
    response = client.post(CLASSIFY_URL)

    assert response.status_code == 422
    assert "document_id" not in response.json()
    assert all_documents(session_factory) == []
    assert stored_files(storage_dir) == []


# --- Kabul sonrası failed kayıtları ---


@pytest.mark.parametrize(
    "file_name, content, expected_text",
    [
        ("kisa.docx", make_docx("Kısa"), "Kısa"),
        ("metinsiz.pdf", make_pdf(""), None),
        ("bozuk.pdf", b"%PDF-1.7\nbozuk icerik", None),
    ],
    ids=["short-text", "no-text", "corrupt"],
)
def test_text_extraction_failure_returns_422_with_failed_record(client, session_factory, storage_dir, file_name, content, expected_text):
    response = upload(client, file_name, content)

    assert response.status_code == 422
    body = response.json()
    assert set(body) == RESPONSE_FIELDS | {"message"}
    assert body["message"] == TEXT_FAILED_MESSAGE
    assert (
        body["status"], body["document_type"], body["document_type_name"], body["institution_id"], body["institution_name"],
        body["needs_review"], body["review_reason"],
    ) == ("failed", None, None, None, None, False, None)
    [document] = all_documents(session_factory)
    assert str(document.id) == body["document_id"]
    assert (document.status, document.document_type, document.institution_id, document.needs_review, document.review_reason) == (
        "failed", None, None, False, None,
    )
    assert document.extracted_text == expected_text
    assert (storage_dir / document.file_reference).read_bytes() == content


def test_classification_error_returns_502_with_failed_record(client, session_factory, storage_dir, fake_classify, caplog):
    fake_classify(classification_error())
    content = make_docx(DOCX_TEXT)

    with caplog.at_level(logging.DEBUG):
        response = upload(client, "dilekce.docx", content)

    assert response.status_code == 502
    body = response.json()
    assert set(body) == RESPONSE_FIELDS | {"message"}
    assert body["message"] == CLASSIFICATION_FAILED_MESSAGE
    assert "ham Gemini" not in response.text and "API_KEY_INVALID" not in response.text
    assert (
        body["status"], body["document_type"], body["document_type_name"], body["institution_id"], body["institution_name"],
        body["needs_review"], body["review_reason"],
    ) == ("failed", None, None, None, None, False, None)
    [document] = all_documents(session_factory)
    assert (document.status, document.document_type, document.institution_id, document.needs_review, document.review_reason) == (
        "failed", None, None, False, None,
    )
    assert document.extracted_text == DOCX_TEXT
    assert (storage_dir / document.file_reference).read_bytes() == content
    assert SECRET_MARKER not in caplog.text


# --- Tutarlılık ---


def test_response_names_are_read_from_catalogs_and_not_stored(client, session_factory, fake_classify, monkeypatch):
    fake_classify(classification())
    monkeypatch.setitem(classification_service.DOCUMENT_TYPE_NAMES, DOCUMENT_TYPE, "Katalogdan Gelen Tür")
    monkeypatch.setitem(classification_service.INSTITUTION_NAMES, INSTITUTION, "Katalogdan Gelen Kurum")

    body = upload(client, "dilekce.docx", make_docx(DOCX_TEXT)).json()

    assert (body["document_type_name"], body["institution_name"]) == ("Katalogdan Gelen Tür", "Katalogdan Gelen Kurum")
    assert (body["document_type"], body["institution_id"]) == (DOCUMENT_TYPE, INSTITUTION)  # ID davranışı değişmez
    [document] = all_documents(session_factory)
    assert not hasattr(document, "document_type_name") and not hasattr(document, "institution_name")  # adlar DB'ye yazılmaz


def test_user_file_name_is_not_used_as_storage_path(client, session_factory, storage_dir, fake_classify, tmp_path):
    fake_classify(classification())
    user_file_name = "../../gizli/dilekce.pdf"

    response = upload(client, user_file_name, make_pdf(PDF_TEXT))

    assert response.status_code == 200
    body = response.json()
    document_id = uuid.UUID(body["document_id"])
    [document] = all_documents(session_factory)
    assert document.id == document_id
    assert document.file_name == body["file_name"] == user_file_name
    assert "gizli" not in document.file_reference and document.file_reference == f"{document_id}.pdf"
    assert stored_files(storage_dir) == [f"{document_id}.pdf"]
    assert list(tmp_path.rglob("*.pdf")) == [storage_dir / f"{document_id}.pdf"]


@pytest.mark.parametrize(
    "content, outcome",
    [
        (make_docx(DOCX_TEXT), classification()),
        (make_docx("Kısa"), None),
        (make_docx(DOCX_TEXT), classification_error()),
    ],
    ids=["classified", "text-failed", "classification-failed"],
)
def test_db_commit_failure_rolls_back_and_removes_orphan_file(client, session_factory, storage_dir, fake_classify, caplog, content, outcome):
    rollbacks = []

    def failing_get_db():
        with session_factory() as session:
            original_rollback = session.rollback

            def fail_commit():
                raise OperationalError("COMMIT", None, Exception("veritabanı erişilemiyor"))

            def tracking_rollback():
                rollbacks.append(True)
                original_rollback()

            session.commit = fail_commit
            session.rollback = tracking_rollback
            yield session

    app.dependency_overrides[get_db] = failing_get_db
    if outcome is not None:
        fake_classify(outcome)

    with caplog.at_level(logging.DEBUG):
        response = upload(client, "dilekce.docx", content)

    assert response.status_code == 500
    assert response.text == "Internal Server Error"
    assert rollbacks == [True]
    assert all_documents(session_factory) == []
    assert stored_files(storage_dir) == []
    assert SECRET_MARKER not in caplog.text


def test_storage_write_failure_returns_500_without_partial_file_or_record(
    client, session_factory, storage_dir, failing_storage_write, caplog
):
    with caplog.at_level(logging.DEBUG):
        response = upload(client, "dilekce.pdf", make_pdf(PDF_TEXT))

    assert response.status_code == 500
    assert response.text == "Internal Server Error"  # "No space left" gibi teknik ayrıntı yanıta girmez
    assert all_documents(session_factory) == []
    assert stored_files(storage_dir) == []
    assert SECRET_MARKER not in caplog.text


def test_openapi_documents_both_422_bodies():
    responses = app.openapi()["paths"][CLASSIFY_URL]["post"]["responses"]

    schema_422 = responses["422"]["content"]["application/json"]["schema"]
    assert {item["$ref"].rsplit("/", 1)[-1] for item in schema_422["anyOf"]} == {
        "FailedClassifyResponse", "ValidationErrorResponse",
    }
    assert responses["502"]["content"]["application/json"]["schema"]["$ref"].endswith("/FailedClassifyResponse")


def test_production_engine_hides_sql_parameters():
    assert database.engine.hide_parameters is True


# --- Kayıt görünürlüğü endpoint'leri (V1.2, D-043) ---

LIST_URL = "/api/documents"


def insert_document(session_factory, **overrides) -> Document:
    """Testte doğrudan kayıt ekler; created_at sırasını deterministik kurmak için kullanılır."""
    document_id = overrides.pop("id", uuid.uuid4())
    fields = {
        "id": document_id,
        "file_name": "belge.pdf",
        "file_type": "pdf",
        "file_reference": f"{document_id}.pdf",
        "extracted_text": "Bu belgenin çıkarılmış metni.",
        "document_type": DOCUMENT_TYPE,
        "institution_id": INSTITUTION,
        "needs_review": False,
        "review_reason": None,
        "status": "classified",
        "created_at": datetime.now(timezone.utc),
    }
    fields.update(overrides)
    with session_factory() as session:
        document = Document(**fields)
        session.add(document)
        session.commit()
        session.refresh(document)
        session.expunge(document)
    return document


def test_list_returns_documents_newest_first(client, session_factory):
    now = datetime.now(timezone.utc)
    insert_document(session_factory, file_name="orta.pdf", created_at=now - timedelta(hours=1))
    insert_document(session_factory, file_name="en_eski.pdf", created_at=now - timedelta(hours=2))
    insert_document(session_factory, file_name="en_yeni.pdf", created_at=now)

    response = client.get(LIST_URL)

    assert response.status_code == 200
    assert [item["file_name"] for item in response.json()] == ["en_yeni.pdf", "orta.pdf", "en_eski.pdf"]


def test_list_is_empty_when_no_documents(client):
    response = client.get(LIST_URL)
    assert response.status_code == 200
    assert response.json() == []


def test_list_item_has_catalog_names_and_created_at(client, session_factory):
    insert_document(session_factory)

    item = client.get(LIST_URL).json()[0]

    assert item["document_type"] == DOCUMENT_TYPE
    assert item["document_type_name"] == DOCUMENT_TYPE_NAME
    assert item["institution_id"] == INSTITUTION
    assert item["institution_name"] == INSTITUTION_NAME
    assert set(item) == RESPONSE_FIELDS | {"created_at"}


def test_list_hides_extracted_text_and_file_reference(client, session_factory):
    document = insert_document(session_factory, extracted_text=SECRET_MARKER)

    body = client.get(LIST_URL).text

    assert "extracted_text" not in body
    assert "file_reference" not in body
    assert SECRET_MARKER not in body
    assert document.file_reference not in body


def test_needs_review_item_keeps_review_reason_and_null_institution(client, session_factory):
    insert_document(
        session_factory, status="needs_review", needs_review=True,
        institution_id=None, review_reason="Kurum belirsiz.",
    )

    item = client.get(LIST_URL).json()[0]

    assert item["status"] == "needs_review"
    assert item["needs_review"] is True
    assert item["institution_id"] is None and item["institution_name"] is None
    assert item["review_reason"] == "Kurum belirsiz."


def test_detail_returns_extracted_text_but_not_file_reference(client, session_factory):
    document = insert_document(session_factory, extracted_text=SECRET_MARKER)

    response = client.get(f"{LIST_URL}/{document.id}")

    assert response.status_code == 200
    assert response.json()["extracted_text"] == SECRET_MARKER
    assert set(response.json()) == RESPONSE_FIELDS | {"created_at", "extracted_text"}
    assert "file_reference" not in response.text
    assert document.file_reference not in response.text


def test_detail_returns_null_extracted_text_for_failed_document(client, session_factory):
    document = insert_document(
        session_factory, status="failed", extracted_text=None,
        document_type=None, institution_id=None,
    )

    body = client.get(f"{LIST_URL}/{document.id}").json()

    assert body["extracted_text"] is None
    assert body["status"] == "failed"
    assert body["document_type_name"] is None and body["institution_name"] is None


def test_detail_returns_404_for_unknown_document(client):
    response = client.get(f"{LIST_URL}/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json() == {"detail": "Belge bulunamadı."}


def test_download_returns_original_pdf_bytes_with_original_file_name(client, fake_classify, storage_dir):
    fake_classify(classification())
    content = make_pdf(PDF_TEXT)
    document_id = upload(client, "dilekçe raporu.pdf", content).json()["document_id"]

    response = client.get(f"{LIST_URL}/{document_id}/download")

    assert response.status_code == 200
    assert response.content == content  # byte-for-byte aynı dosya
    assert response.headers["content-type"] == "application/pdf"
    # Türkçe/boşluklu ad RFC 5987 ile kodlanır; storage adı (UUID) sızmaz.
    disposition = response.headers["content-disposition"]
    assert disposition.startswith("attachment")
    assert "dilek" in disposition
    assert document_id not in disposition


def test_download_returns_docx_with_correct_media_type(client, fake_classify):
    fake_classify(classification())
    content = make_docx(DOCX_TEXT)
    document_id = upload(client, "basvuru.docx", content).json()["document_id"]

    response = client.get(f"{LIST_URL}/{document_id}/download")

    assert response.status_code == 200
    assert response.content == content
    assert response.headers["content-type"] == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert 'filename="basvuru.docx"' in response.headers["content-disposition"]


def test_download_returns_404_for_unknown_document(client):
    response = client.get(f"{LIST_URL}/{uuid.uuid4()}/download")

    assert response.status_code == 404
    assert response.json() == {"detail": "Belge bulunamadı."}


def test_download_returns_404_without_details_when_stored_file_is_missing(client, session_factory, storage_dir, caplog):
    document = insert_document(session_factory)  # kayıt var, storage dosyası hiç yazılmadı

    with caplog.at_level(logging.WARNING):
        response = client.get(f"{LIST_URL}/{document.id}/download")

    assert response.status_code == 404
    assert response.json() == {"detail": "Belge bulunamadı."}
    assert document.file_reference not in response.text
    assert str(storage_dir) not in response.text
    assert document.file_reference not in caplog.text  # log da dosya adını yazmaz
