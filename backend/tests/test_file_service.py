import io
import logging
import uuid
import zipfile

import docx
import pymupdf
import pytest

from app.services import file_service
from app.services.file_service import (
    MAX_FILE_SIZE,
    MIN_TEXT_LENGTH,
    FileTooLargeError,
    TextExtractionError,
    UnsupportedFileTypeError,
    check_file_size,
    check_text_length,
    detect_file_type,
    extract_text,
    normalize_text,
    save_file,
)

DOCX_CONTENT_TYPES = (
    b'<?xml version="1.0" encoding="UTF-8"?>'
    b'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    b'<Override PartName="/word/document.xml" '
    b'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    b"</Types>"
)


def make_pdf(*pages: str) -> bytes:
    with pymupdf.open() as pdf:
        for text in pages:
            page = pdf.new_page()
            if text:
                page.insert_text((72, 72), text)
        return pdf.tobytes()


def docx_bytes(document) -> bytes:
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def make_docx(*paragraphs: str) -> bytes:
    document = docx.Document()
    for text in paragraphs:
        document.add_paragraph(text)
    return docx_bytes(document)


def make_zip(files: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    return buffer.getvalue()


@pytest.fixture
def storage_dir(tmp_path, monkeypatch):
    """Testler gerçek backend/storage yerine geçici bir klasöre yazar."""
    path = tmp_path / "storage"
    monkeypatch.setattr(file_service, "STORAGE_DIR", path)
    return path


def test_valid_pdf_is_accepted_and_text_extracted():
    data = make_pdf("Birinci sayfa metni", "Ikinci sayfa metni")

    assert detect_file_type("dilekce.pdf", data) == "pdf"
    assert detect_file_type("DILEKCE.PDF", data) == "pdf"
    text = extract_text(data, "pdf")
    assert text == "Birinci sayfa metni Ikinci sayfa metni"
    check_text_length(text)


def test_valid_docx_is_accepted_and_paragraph_text_extracted():
    data = make_docx("Çöp konteyneri   taşmış durumda.", "", "Gereğinin yapılmasını\trica ederim.")

    assert detect_file_type("basvuru.docx", data) == "docx"
    assert extract_text(data, "docx") == "Çöp konteyneri taşmış durumda. Gereğinin yapılmasını rica ederim."


def test_docx_table_cell_text_is_extracted_once_in_document_order():
    document = docx.Document()
    document.add_paragraph("Başvuru bilgileri:")
    table = document.add_table(rows=2, cols=2)
    table.cell(0, 0).merge(table.cell(0, 1)).text = "Birleşik başlık"
    table.cell(1, 0).text = "Ad Soyad"
    table.cell(1, 1).text = "Ayşe Yılmaz"
    document.add_paragraph("Son paragraf.")

    text = extract_text(docx_bytes(document), "docx")

    assert text == "Başvuru bilgileri: Birleşik başlık Ad Soyad Ayşe Yılmaz Son paragraf."
    assert text.count("Birleşik başlık") == 1


def test_text_shorter_than_10_characters_is_rejected():
    check_text_length("1234567890")
    with pytest.raises(TextExtractionError):
        check_text_length("123456789")
    with pytest.raises(TextExtractionError):
        check_text_length(normalize_text("  a   b  c  "))

    # Görsel/taranmış PDF gibi metin vermeyen sayfa: OCR yok, yetersiz metin.
    blank_pdf_text = extract_text(make_pdf(""), "pdf")
    assert blank_pdf_text == ""
    with pytest.raises(TextExtractionError):
        check_text_length(blank_pdf_text)

    with pytest.raises(TextExtractionError):
        check_text_length(extract_text(make_docx("Kısa"), "docx"))


@pytest.mark.parametrize(
    "file_name, content_factory",
    [
        ("dilekce.doc", lambda: make_docx("Word 97 uzantılı dosya")),
        ("dilekce.txt", lambda: make_pdf("PDF icerik")),
        ("dilekce", lambda: make_pdf("PDF icerik")),
        ("dilekce.pdf.exe", lambda: make_pdf("PDF icerik")),
        ("dilekce.pdf", lambda: make_docx("DOCX içerik .pdf uzantılı")),
        ("dilekce.docx", lambda: make_pdf("PDF icerik")),
    ],
)
def test_wrong_extension_or_mismatched_content_is_rejected(file_name, content_factory):
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type(file_name, content_factory())


@pytest.mark.parametrize("content", [b"Merhaba, ben PDF degilim", b"", b" %PDF-1.7 basta bosluk var"])
def test_pdf_extension_with_non_pdf_content_is_rejected(content):
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type("dilekce.pdf", content)


@pytest.mark.parametrize(
    "content",
    [
        b"PK ama zip degil",
        make_zip({"readme.txt": b"generic zip"}),
        make_zip({"[Content_Types].xml": b"<Types/>", "word/document.xml": b"<w:document/>"}),
        make_zip({"word/document.xml": b"<w:document/>"}),
        make_zip({"[Content_Types].xml": DOCX_CONTENT_TYPES}),
    ],
    ids=["not-zip", "generic-zip", "no-docx-content-type", "no-content-types", "no-document-xml"],
)
def test_docx_extension_with_non_docx_content_is_rejected(content):
    with pytest.raises(UnsupportedFileTypeError):
        detect_file_type("dilekce.docx", content)


def test_corrupt_or_encrypted_documents_raise_text_extraction_error():
    corrupt_pdf = b"%PDF-1.7\nbu dosya bozuk"
    with pymupdf.open() as pdf:
        pdf.new_page().insert_text((72, 72), "Gizli dilekce metni")
        encrypted_pdf = pdf.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw="kullanici", owner_pw="sahip")
    corrupt_docx = make_zip({"[Content_Types].xml": DOCX_CONTENT_TYPES, "word/document.xml": b"<bozuk"})

    for content, file_type in [(corrupt_pdf, "pdf"), (encrypted_pdf, "pdf"), (corrupt_docx, "docx")]:
        assert detect_file_type(f"belge.{file_type}", content) == file_type
        with pytest.raises(TextExtractionError):
            check_text_length(extract_text(content, file_type))


def test_storage_file_name_is_built_from_document_id(storage_dir):
    document_id = uuid.uuid4()
    data = make_pdf("Dosya icerigi")

    file_reference = save_file(data, document_id, "pdf")

    assert file_reference == f"{document_id}.pdf"
    assert (storage_dir / file_reference).read_bytes() == data
    assert [path.name for path in storage_dir.iterdir()] == [file_reference]


def test_user_file_name_is_not_used_as_storage_path(storage_dir, tmp_path):
    user_file_name = "../../gizli/dilekce.pdf"
    data = make_pdf("Dosya icerigi")
    document_id = uuid.uuid4()

    file_reference = save_file(data, document_id, detect_file_type(user_file_name, data))

    assert file_reference == f"{document_id}.pdf"
    assert "dilekce" not in file_reference and ".." not in file_reference and "/" not in file_reference
    assert list(tmp_path.rglob("*.pdf")) == [storage_dir / file_reference]
    with pytest.raises(ValueError):
        save_file(data, "../../gizli", "pdf")
    with pytest.raises(ValueError):
        save_file(data, uuid.uuid4(), "../pdf")


def test_failed_write_removes_partial_file_and_reraises(storage_dir, failing_storage_write):
    with pytest.raises(OSError) as exc_info:
        save_file(make_pdf("Dosya icerigi"), uuid.uuid4(), "pdf")

    assert exc_info.value is failing_storage_write  # özgün hata bastırılmaz
    assert list(storage_dir.iterdir()) == []  # yarım yazılmış dosya kalmaz


def test_existing_storage_file_is_never_overwritten_or_deleted(storage_dir):
    document_id = uuid.uuid4()
    original = make_pdf("Ilk dosya")
    file_reference = save_file(original, document_id, "pdf")

    with pytest.raises(FileExistsError):
        save_file(make_pdf("Ikinci dosya"), document_id, "pdf")

    assert (storage_dir / file_reference).read_bytes() == original


def test_full_text_is_returned_without_truncation():
    long_text = "a" * 60_000

    assert extract_text(make_docx(long_text), "docx") == long_text


def test_normalize_text_collapses_whitespace_and_trims():
    assert normalize_text("  Merhaba\n\n\tdünya   nasılsın?  ") == "Merhaba dünya nasılsın?"
    assert normalize_text(" \n\t ") == ""


def test_file_size_limit_is_50_mb():
    assert MAX_FILE_SIZE == 50 * 1024 * 1024
    check_file_size(0)
    check_file_size(MAX_FILE_SIZE)
    with pytest.raises(FileTooLargeError):
        check_file_size(MAX_FILE_SIZE + 1)


# --- Taranmış PDF için OCR fallback (V1.1) ---


def test_pdf_with_enough_text_does_not_use_ocr(monkeypatch):
    def fail_if_called(page):
        raise AssertionError("Yeterli metni olan sayfada OCR çağrılmamalı.")

    monkeypatch.setattr(file_service, "_ocr_page_text", fail_if_called)
    assert extract_text(make_pdf("Bu dilekçe yeterli uzunlukta metin içerir."), "pdf") == (
        "Bu dilekçe yeterli uzunlukta metin içerir."
    )


def test_pdf_without_enough_text_uses_ocr_fallback(monkeypatch):
    monkeypatch.setattr(file_service, "_ocr_page_text", lambda page: "OCR ile okunan şikayet dilekçesi.")
    assert extract_text(make_pdf(""), "pdf") == "OCR ile okunan şikayet dilekçesi."


def test_ocr_output_long_enough_passes_length_check(monkeypatch):
    monkeypatch.setattr(file_service, "_ocr_page_text", lambda page: "OCR ile okunan yeterli metin.")
    check_text_length(extract_text(make_pdf(""), "pdf"))  # hata yükselmemeli


def test_ocr_output_still_too_short_is_rejected(monkeypatch):
    monkeypatch.setattr(file_service, "_ocr_page_text", lambda page: "kısa")
    text = extract_text(make_pdf(""), "pdf")
    assert text == "kısa"
    with pytest.raises(TextExtractionError):
        check_text_length(text)


def test_ocr_failure_falls_back_to_safe_text_extraction_failure(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("tesseract dili yükleyemedi")

    monkeypatch.setattr(file_service.settings, "TESSDATA_PREFIX", "/tessdata")
    monkeypatch.setattr(pymupdf.Page, "get_textpage_ocr", boom)
    text = extract_text(make_pdf(""), "pdf")  # OCR hatası dışarı sızmaz
    assert text == ""
    with pytest.raises(TextExtractionError):
        check_text_length(text)


def test_ocr_is_skipped_when_tessdata_prefix_is_not_configured(monkeypatch):
    def fail_if_called(*args, **kwargs):
        raise AssertionError("TESSDATA_PREFIX tanımlı değilken OCR denenmemeli.")

    monkeypatch.setattr(file_service.settings, "TESSDATA_PREFIX", None)
    monkeypatch.setattr(pymupdf.Page, "get_textpage_ocr", fail_if_called)
    assert extract_text(make_pdf(""), "pdf") == ""


def test_ocr_is_called_with_turkish_and_300_dpi(monkeypatch):
    calls = []

    def fake_ocr(self, *args, **kwargs):
        calls.append(kwargs)
        return self.get_textpage()

    monkeypatch.setattr(file_service.settings, "TESSDATA_PREFIX", "/tessdata")
    monkeypatch.setattr(pymupdf.Page, "get_textpage_ocr", fake_ocr)
    extract_text(make_pdf(""), "pdf")
    assert [(c["language"], c["dpi"], c["tessdata"]) for c in calls] == [("tur", 300, "/tessdata")]


def test_docx_never_uses_ocr(monkeypatch):
    def fail_if_called(page):
        raise AssertionError("DOCX için OCR çağrılmamalı.")

    monkeypatch.setattr(file_service, "_ocr_page_text", fail_if_called)
    with pytest.raises(TextExtractionError):
        check_text_length(extract_text(make_docx("kısa"), "docx"))


# --- Sayfa düzeyinde OCR kararı (V1.2 · P1 düzeltmesi) ---

OCR_PAGE_TEXT = "Bu sayfa OCR ile okunan taranmis dilekce metnidir."


def make_mixed_pdf(*pages: tuple[str, str]) -> bytes:
    """pages: ("text", içerik) gerçek text layer, ("image", içerik) metin katmanı olmayan taranmış sayfa."""
    with pymupdf.open() as pdf:
        for kind, content in pages:
            if kind == "text":
                page = pdf.new_page()
                if content:
                    page.insert_text((72, 72), content)
                continue
            with pymupdf.open() as source:  # önce çiz, sonra yalnızca görüntü olarak göm
                drawn = source.new_page()
                drawn.insert_text((72, 72), content)
                png = drawn.get_pixmap(dpi=72).tobytes("png")
            page = pdf.new_page()
            page.insert_image(page.rect, stream=png)
        return pdf.tobytes()


@pytest.fixture
def ocr_spy(monkeypatch):
    """_ocr_page_text yerine geçer; OCR'lanan sayfa numaralarını kaydeder."""
    pages = []

    def fake_ocr(page):
        pages.append(page.number)
        return OCR_PAGE_TEXT

    monkeypatch.setattr(file_service, "_ocr_page_text", fake_ocr)
    return pages


def test_all_text_pages_never_trigger_ocr(ocr_spy):
    content = make_mixed_pdf(("text", "Birinci sayfanin yeterli uzunlukta metni."),
                             ("text", "Ikinci sayfanin yeterli uzunlukta metni."))

    text = extract_text(content, "pdf")

    assert ocr_spy == []  # hiçbir sayfada OCR yok
    assert "Birinci sayfanin" in text and "Ikinci sayfanin" in text


def test_single_image_only_page_triggers_ocr(ocr_spy):
    """V1.1 davranışı korunur: metinsiz tek sayfalık PDF OCR'lanır."""
    text = extract_text(make_mixed_pdf(("image", "Taranmis dilekce metni")), "pdf")

    assert ocr_spy == [0]
    assert text == OCR_PAGE_TEXT


def test_hybrid_pdf_ocrs_only_the_image_page_and_keeps_order(ocr_spy):
    """P1: kapak sayfasının metni, taranmış ikinci sayfanın OCR'lanmasını engellememeli."""
    cover = "EVRAK KAYIT FORMU Bu belge resmi evrak kayit sistemine alinmistir."
    content = make_mixed_pdf(("text", cover), ("image", "Asil dilekce taranmis sayfada"))

    text = extract_text(content, "pdf")

    assert ocr_spy == [1]  # yalnızca 2. sayfa
    assert cover.split()[0] in text and OCR_PAGE_TEXT in text
    assert text.index("EVRAK") < text.index(OCR_PAGE_TEXT)  # belge sırası korunur


def test_multi_page_hybrid_ocrs_only_image_pages(ocr_spy):
    content = make_mixed_pdf(
        ("text", "Birinci sayfanin yeterli uzunlukta metni."),
        ("image", "Ikinci sayfa taranmis"),
        ("text", "Ucuncu sayfanin yeterli uzunlukta metni."),
        ("image", "Dorduncu sayfa taranmis"),
    )

    text = extract_text(content, "pdf")

    assert ocr_spy == [1, 3]  # yalnızca görüntü sayfaları, sırasıyla
    assert text.count(OCR_PAGE_TEXT) == 2
    assert "Birinci sayfanin" in text and "Ucuncu sayfanin" in text


@pytest.mark.parametrize(
    "page_text, ocr_expected",
    [("123456789", True), ("1234567890", False)],  # 9 karakter -> OCR, 10 karakter -> OCR yok
)
def test_page_level_threshold_is_min_text_length(ocr_spy, page_text, ocr_expected):
    assert len(page_text) == (MIN_TEXT_LENGTH - 1 if ocr_expected else MIN_TEXT_LENGTH)

    extract_text(make_mixed_pdf(("text", page_text)), "pdf")

    assert ocr_spy == ([0] if ocr_expected else [])


def test_hybrid_page_ocr_failure_falls_back_to_embedded_text(monkeypatch, caplog):
    """OCR hatası yeni hata sınıfı üretmez; sayfa gömülü metnine düşer, teknik detay sızmaz."""
    secret = "TARANMIS_SAYFA_ICERIGI"
    cover = "EVRAK KAYIT FORMU Bu belge resmi evrak kayit sistemine alinmistir."

    def boom(*args, **kwargs):
        raise RuntimeError(f"tesseract patladi: {secret}")

    monkeypatch.setattr(file_service.settings, "TESSDATA_PREFIX", "/tessdata")
    monkeypatch.setattr(pymupdf.Page, "get_textpage_ocr", boom)

    with caplog.at_level(logging.WARNING):
        text = extract_text(make_mixed_pdf(("text", cover), ("image", secret)), "pdf")

    assert "EVRAK" in text  # kapak metni korunur, istek hata vermez
    assert secret not in text
    assert secret not in caplog.text  # ham hata mesajı ve belge metni loglanmaz
    assert "RuntimeError" in caplog.text  # güvenli bağlam: yalnızca hata türü
