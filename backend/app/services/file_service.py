"""Dosya kabul kontrolü, storage'a kaydetme ve PDF/DOCX metin çıkarımı.

HTTP yanıtı üretmez ve veritabanına yazmaz. Hataların eşlemesi API katmanında yapılır:
FileTooLargeError → 413, UnsupportedFileTypeError → 415, TextExtractionError → failed + 422.
"""

import contextlib
import io
import logging
import re
import uuid
import zipfile
from pathlib import Path

import docx
import pymupdf
from docx.text.paragraph import Paragraph

from app import settings

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB (D-028)
MIN_TEXT_LENGTH = 10  # normalize edilmiş metin için (D-026)
STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"  # backend/storage (D-017)
FILE_TYPES = ("pdf", "docx")
MEDIA_TYPES = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
OCR_LANGUAGE = "tur"  # taranmış PDF fallback'i (D-042)
OCR_DPI = 300

_DOCX_MAIN_CONTENT_TYPE = b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"


class FileTooLargeError(Exception):
    """Dosya 50 MB sınırını aşıyor."""


class UnsupportedFileTypeError(Exception):
    """Dosya geçerli bir PDF veya DOCX değil."""


class TextExtractionError(Exception):
    """Kabul edilmiş dosyadan metin çıkarılamadı ya da normalize edilmiş metin çok kısa."""


def check_file_size(size: int) -> None:
    if size > MAX_FILE_SIZE:
        raise FileTooLargeError(f"Dosya boyutu {size} bayt; sınır {MAX_FILE_SIZE} bayt.")


def detect_file_type(file_name: str, content: bytes) -> str:
    """Uzantı ve içerik birlikte doğrulanır (content-type'a güvenilmez). "pdf" veya "docx" döner."""
    extension = Path(file_name).suffix.lower()
    if extension == ".pdf" and content.startswith(b"%PDF"):
        return "pdf"
    if extension == ".docx" and _is_docx(content):
        return "docx"
    raise UnsupportedFileTypeError(f"Desteklenmeyen dosya veya içerik uzantıyla uyuşmuyor: {file_name!r}")


def _is_docx(content: bytes) -> bool:
    """Generic ZIP yetmez: WordprocessingML ana belge türü ve word/document.xml bulunmalı."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if not {"[Content_Types].xml", "word/document.xml"} <= set(archive.namelist()):
                return False
            return _DOCX_MAIN_CONTENT_TYPE in archive.read("[Content_Types].xml")
    except Exception:  # ZIP değil, bozuk ya da şifreli arşiv: geçerli DOCX sayılmaz
        return False


def save_file(content: bytes, document_id: uuid.UUID, file_type: str) -> str:
    """Dosyayı STORAGE_DIR/<document_id>.<file_type> olarak yazar ve file_reference döndürür.

    Yol yalnızca UUID ve izinli uzantıdan oluşur; kullanıcının dosya adı kullanılmaz.
    Yazma yarıda kalırsa bu çağrının oluşturduğu kısmi dosya silinir ve özgün hata yükselir.
    """
    if file_type not in FILE_TYPES:
        raise ValueError(f"Geçersiz file_type: {file_type!r}")
    file_reference = f"{uuid.UUID(str(document_id))}.{file_type}"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    target = STORAGE_DIR / file_reference
    file = target.open("xb")  # "x": dosya bu çağrıda oluşturulur; var olan bir dosyaya dokunulmaz
    try:
        with file:
            file.write(content)
    except BaseException:
        # Dosya kapandıktan sonra silinir (Windows'ta açık dosya silinemez); silme hatası özgün hatayı gizlemez.
        with contextlib.suppress(OSError):
            target.unlink(missing_ok=True)
        raise
    return file_reference


def delete_file(file_reference: str) -> None:
    """save_file ile yazılmış dosyayı siler (ör. kaydı veritabanına yazılamayan orphan dosya)."""
    (STORAGE_DIR / file_reference).unlink(missing_ok=True)


def extract_text(content: bytes, file_type: str) -> str:
    """Normalize edilmiş TAM metni döndürür (50.000 karakter kesmesi yapılmaz).

    PDF'te OCR kararı sayfa sayfa verilir (D-003, D-042): kendi metni MIN_TEXT_LENGTH'in altında kalan
    sayfalar OCR'lanır, diğerleri gömülü metniyle kalır. OCR yapılandırılmamışsa veya hata verirse o
    sayfanın gömülü metni kullanılır; yetersizliğe check_text_length karar verir, yani mevcut failed
    davranışı değişmez.
    """
    if file_type not in FILE_TYPES:
        raise ValueError(f"Geçersiz file_type: {file_type!r}")
    try:
        raw_text = _extract_pdf_text(content) if file_type == "pdf" else _extract_docx_text(content)
    except Exception as exc:  # bozuk, şifreli veya okunamayan dosya
        raise TextExtractionError(f"{file_type} metni çıkarılamadı: {exc}") from exc
    return normalize_text(raw_text)


def _extract_pdf_text(content: bytes) -> str:
    """Sayfalar belge sırasıyla okunur; her sayfa kendi metnine göre ayrı değerlendirilir."""
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        return "\n".join(_page_text(page) for page in pdf)


def _page_text(page) -> str:
    """Sayfanın gömülü metni yeterliyse onu, değilse yalnızca o sayfanın OCR'ını döndürür.

    Hybrid PDF'lerde kapak sayfasının metni, taranmış sayfaların OCR'lanmasını engellemez.
    """
    embedded = page.get_text()
    if len(normalize_text(embedded)) >= MIN_TEXT_LENGTH:
        return embedded
    return _ocr_page_text(page) or embedded


def _ocr_page_text(page) -> str:
    """Tek sayfayı Tesseract ile okur; yapılandırılmamışsa veya hata verirse boş metin döner.

    Hata yükseltmez: OCR bir iyileştirmedir, başarısızlığı sayfayı gömülü metnine bırakır.
    """
    if not settings.TESSDATA_PREFIX:
        logger.warning("TESSDATA_PREFIX tanımlı değil; taranmış sayfa için OCR atlanıyor.")
        return ""
    try:
        textpage = page.get_textpage_ocr(
            language=OCR_LANGUAGE, dpi=OCR_DPI, full=True, tessdata=settings.TESSDATA_PREFIX
        )
        return page.get_text(textpage=textpage)
    except Exception as exc:  # Tesseract yapılandırması, dil dosyası veya sayfa render hatası
        logger.warning("Sayfa OCR'ı başarısız (%s); sayfa gömülü metniyle değerlendiriliyor.", type(exc).__name__)
        return ""


def _extract_docx_text(content: bytes) -> str:
    """Paragraflar ve tablo hücreleri belge sırasıyla alınır; header/footer, textbox vb. V1 dışında."""
    document = docx.Document(io.BytesIO(content))
    parts = []
    for block in document.iter_inner_content():
        if isinstance(block, Paragraph):
            parts.append(block.text)
            continue
        seen_cells = set()
        for row in block.rows:
            for cell in row.cells:
                # Birleştirilmiş hücreler row.cells içinde tekrar döner; aynı <w:tc> yalnızca bir kez alınır.
                if cell._tc in seen_cells:
                    continue
                seen_cells.add(cell._tc)
                parts.append(cell.text)
    return "\n".join(parts)


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def check_text_length(text: str) -> None:
    """Normalize edilmiş metnin en az MIN_TEXT_LENGTH karakter olduğunu doğrular."""
    if len(text) < MIN_TEXT_LENGTH:
        raise TextExtractionError(f"Normalize edilmiş metin {len(text)} karakter; en az {MIN_TEXT_LENGTH} gerekli.")
