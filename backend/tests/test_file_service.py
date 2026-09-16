import io
import uuid
import zipfile

import docx
import pymupdf
import pytest

from app.services import file_service
from app.services.file_service import (
    MAX_FILE_SIZE,
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
