"""Dosya kabul kontrolü, storage'a kaydetme ve PDF/DOC/DOCX/görüntü metin çıkarımı.

HTTP yanıtı üretmez ve veritabanına yazmaz. Hataların eşlemesi API katmanında yapılır:
FileTooLargeError → 413, UnsupportedFileTypeError → 415, TextExtractionError → failed + 422.
"""

import contextlib
import io
import logging
import multiprocessing
import re
import threading
import uuid
import zipfile
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import legacy_doc
import pymupdf
from legacy_doc.ole import OleReader

from app import settings
from app.services import docx_parser

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB (D-028)
MIN_TEXT_LENGTH = 10  # normalize edilmiş metin için (D-026)
STORAGE_DIR = Path(__file__).resolve().parents[2] / "storage"  # backend/storage (D-017)
FILE_TYPES = ("pdf", "doc", "docx", "jpg", "jpeg", "png")
MEDIA_TYPES = {
    "pdf": "application/pdf",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}
# Görüntüde uzantı tek başına yetmez; dosya imzası da eşleşmelidir (D-001).
IMAGE_SIGNATURES = {"jpg": b"\xff\xd8\xff", "jpeg": b"\xff\xd8\xff", "png": b"\x89PNG\r\n\x1a\n"}
OCR_LANGUAGE = "tur"  # taranmış PDF fallback'i ve görüntü belgeleri (D-042)
OCR_DPI = 400
OCR_COVERAGE_MIN = 0.5  # sayfa alanının bu oranı görüntüyse sayfa yapısal olarak taranmış sayılır (D-003)
OCR_SHORT_TEXT_MAX = 200  # taranmış sayfada bu uzunluğa kadar gömülü metin OCR ile birlikte değerlendirilir
TRANSCRIPTION_MAX_PAGES = 3  # Gemini transkripsiyonu çağrı başına en fazla bu kadar PDF sayfası okur (D-047)

# Gömülü metin ile OCR metnini karşılaştırmak için: Türkçe harfler sadeleştirilir, 3+ karakterli parçalar alınır.
_ASCII_FOLD = str.maketrans("çÇğĞıIİöÖşŞüÜâÂîÎûÛ", "ccggiiioossuuaaiiuu")
_TOKEN_PATTERN = re.compile(r"[0-9a-z]{3,}")

_DOCX_MAIN_CONTENT_TYPE = b"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
_OLE_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"  # OLE Compound File (.doc, .xls, .ppt ortak)
_DOC_WORD_STREAM = "WordDocument"  # yalnızca Word belgelerinde bulunur (D-001)
# DOCX açılım sınırları (D-058). ZIP başlıklarındaki beyan edilen boyutlara güvenilmez; parçalar parser'dan önce
# akış hâlinde açılıp gerçek baytlar sayılır. Bellek ve CPU'yu XML eleman sayısı belirlediği için XML'deki "<"
# sayısı (eleman sayısının üst sınırı) da sınırlanır. Değerler 768 MiB API bellek sınırına göre ölçüldü (S3).
DOCX_MAX_ENTRIES = 1_000
DOCX_MAX_UNCOMPRESSED_BYTES = 64 * 1024 * 1024  # bütün parçaların açılmış toplamı
DOCX_MAX_XML_BYTES = 16 * 1024 * 1024  # .xml ve .rels parçalarının açılmış toplamı
DOCX_MAX_XML_TAGS = 500_000  # .xml ve .rels parçalarındaki "<" toplamı
DOCX_CONTENT_TYPES_MAX_BYTES = 1024 * 1024  # tür tespitinde okunan [Content_Types].xml
_DOCX_READ_CHUNK = 1024 * 1024
# python-docx ayrıştırması süreç içinde tek tek çalışır (D-059): eşzamanlı thread'ler GIL çekişmesiyle doğrusal
# olmayan şekilde yavaşlıyor. Kilit süreç içidir; her uvicorn worker'ının kendi kilidi vardır.
_DOCX_PARSE_LOCK = threading.Lock()
# Ayrıştırma her DOCX için yeni bir alt süreçte çalışır (D-060): python-docx'in bıraktığı bellek glibc tarafından
# süreçte tutuluyor; alt süreç çıkınca işletim sistemine döner. Linux'ta forkserver ana modülü ve docx_parser'ı
# önceden yükler; yoksa her alt süreç ana modülü (uvicorn) yeniden yükler ve istek başına ~0,3 sn ekler.
if "forkserver" in multiprocessing.get_all_start_methods():
    _CHILD_CONTEXT = multiprocessing.get_context("forkserver")
    _CHILD_CONTEXT.set_forkserver_preload(["__main__", "app.services.docx_parser"])
else:  # Windows geliştirme ortamı
    _CHILD_CONTEXT = multiprocessing.get_context("spawn")
# Parser'ın dosya boyutu sınırı kabul sınırıyla aynı tutulur; diğer koruma limitleri varsayılan kalır.
_DOC_OPTIONS = legacy_doc.ExtractionOptions(max_file_bytes=MAX_FILE_SIZE)


class FileTooLargeError(Exception):
    """Dosya 50 MB sınırını aşıyor."""


class UnsupportedFileTypeError(Exception):
    """Dosya geçerli bir PDF, DOC, DOCX, JPG/JPEG veya PNG değil."""


class TextExtractionError(Exception):
    """Kabul edilmiş dosyadan metin çıkarılamadı ya da normalize edilmiş metin çok kısa."""


class DocumentTooComplexError(TextExtractionError):
    """DOCX'in açılmış içeriği güvenli işleme sınırlarını aşıyor (D-058); parser çalıştırılmadı."""


def check_file_size(size: int) -> None:
    if size > MAX_FILE_SIZE:
        raise FileTooLargeError(f"Dosya boyutu {size} bayt; sınır {MAX_FILE_SIZE} bayt.")


def detect_file_type(file_name: str, content: bytes) -> str:
    """Uzantı ve içerik birlikte doğrulanır (content-type'a güvenilmez); FILE_TYPES değerlerinden biri döner."""
    extension = Path(file_name).suffix.lower().removeprefix(".")
    if extension == "pdf" and content.startswith(b"%PDF"):
        return "pdf"
    if extension == "doc" and _is_doc(content):
        return "doc"
    if extension == "docx" and _is_docx(content):
        return "docx"
    if extension in IMAGE_SIGNATURES and content.startswith(IMAGE_SIGNATURES[extension]):
        return extension
    raise UnsupportedFileTypeError(f"Desteklenmeyen dosya veya içerik uzantıyla uyuşmuyor: {file_name!r}")


def _is_doc(content: bytes) -> bool:
    """OLE imzası tek başına yetmez: XLS/PPT gibi diğer OLE belgeleri de aynı imzayı taşır.

    Word'e özgü `WordDocument` stream'i aranır; bu yalnızca OLE dizinini okur, metin çıkarmaz.
    """
    if not content.startswith(_OLE_SIGNATURE):
        return False
    try:
        return OleReader(content, options=_DOC_OPTIONS).has_stream(_DOC_WORD_STREAM)
    except Exception:  # OLE değil, bozuk ya da okunamayan yapı: geçerli DOC sayılmaz
        return False


def _is_docx(content: bytes) -> bool:
    """Generic ZIP yetmez: WordprocessingML ana belge türü ve word/document.xml bulunmalı."""
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if not {"[Content_Types].xml", "word/document.xml"} <= set(archive.namelist()):
                return False
            # D-058: tür tespiti büyük bir parçayı belleğe açmasın; okuma sınırı aşılırsa geçerli DOCX sayılmaz.
            with archive.open("[Content_Types].xml") as entry:
                content_types = entry.read(DOCX_CONTENT_TYPES_MAX_BYTES + 1)
            if len(content_types) > DOCX_CONTENT_TYPES_MAX_BYTES:
                return False
            return _DOCX_MAIN_CONTENT_TYPE in content_types
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


def needs_ocr(content: bytes, file_type: str) -> bool:
    """Belgenin güvenilir dijital metni yoksa True; metni önce Gemini transkripsiyonuyla okunur (D-047).

    JPG/JPEG/PNG her zaman; PDF en az bir sayfası D-003 koşulunu sağlıyorsa. DOC ve DOCX'te OCR yapılmaz.
    OCR veya render yapmaz. Açılamayan PDF False döner; hatayı bugünkü gibi extract_text üretir.
    """
    if file_type in IMAGE_SIGNATURES:
        return True
    if file_type != "pdf":
        return False
    try:
        with pymupdf.open(stream=content, filetype="pdf") as pdf:
            return any(_page_needs_ocr(page, page.get_text()) for page in pdf)
    except Exception:  # bozuk, şifreli veya okunamayan PDF
        return False


def transcription_parts(content: bytes, file_type: str) -> list[bytes]:
    """Gemini transkripsiyonuna sırayla gönderilecek parçalar (D-047).

    Görüntü ve en fazla TRANSCRIPTION_MAX_PAGES sayfalık PDF olduğu gibi tek parçadır. Daha uzun PDF, sayfa sırası
    korunarak en fazla TRANSCRIPTION_MAX_PAGES sayfalık PDF parçalarına bölünür.
    """
    if file_type != "pdf":
        return [content]
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        if pdf.page_count <= TRANSCRIPTION_MAX_PAGES:
            return [content]
        parts = []
        for start in range(0, pdf.page_count, TRANSCRIPTION_MAX_PAGES):
            end = min(start + TRANSCRIPTION_MAX_PAGES, pdf.page_count) - 1
            with pymupdf.open() as part:
                part.insert_pdf(pdf, from_page=start, to_page=end)
                parts.append(part.tobytes(garbage=3, deflate=True))
        return parts


def extract_text(content: bytes, file_type: str) -> str:
    """Normalize edilmiş TAM metni döndürür (50.000 karakter kesmesi yapılmaz).

    Yerel çıkarım ve Tesseract acil durum yedeğidir (D-042, D-047); Gemini transkripsiyonu API katmanında denenir.
    PDF'te OCR kararı sayfa sayfa verilir (D-003, D-042): kendi metni MIN_TEXT_LENGTH'in altında kalan
    sayfalar OCR'lanır; yapısal olarak görüntüye dayanan ve gömülü metni kısa kalan sayfalarda OCR metni
    gömülü metinle birleştirilir; diğerleri gömülü metniyle kalır. OCR yapılandırılmamışsa veya hata verirse o
    sayfanın gömülü metni kullanılır; yetersizliğe check_text_length karar verir, yani mevcut failed
    davranışı değişmez. JPG/JPEG/PNG doğrudan OCR'lanır; DOC ve DOCX'te OCR yapılmaz.
    """
    if file_type not in FILE_TYPES:
        raise ValueError(f"Geçersiz file_type: {file_type!r}")
    try:
        if file_type == "pdf":
            raw_text = _extract_pdf_text(content)
        elif file_type == "doc":
            raw_text = _extract_doc_text(content)
        elif file_type == "docx":
            raw_text = _extract_docx_text(content)
        else:
            raw_text = _extract_image_text(content, file_type)
    except DocumentTooComplexError:
        raise
    except Exception as exc:  # bozuk, şifreli veya okunamayan dosya
        raise TextExtractionError(f"{file_type} metni çıkarılamadı: {exc}") from exc
    return normalize_text(raw_text)


def _extract_image_text(content: bytes, file_type: str) -> str:
    """Görüntü belgesi tek sayfa olarak doğrudan OCR'lanır (D-001, D-042).

    Gömülü metin aranmaz ve PDF'e özgü sayfa/yapı kararları (D-003) uygulanmaz: görüntü zaten
    baştan taranmış bir belgedir. OCR yapılandırılmamışsa veya hata verirse boş metin döner ve
    yetersizliğe check_text_length karar verir.
    """
    with pymupdf.open(stream=content, filetype=file_type) as image:
        return _ocr_page_text(image[0])


def _extract_pdf_text(content: bytes) -> str:
    """Sayfalar belge sırasıyla okunur; her sayfa kendi metnine göre ayrı değerlendirilir."""
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        return "\n".join(_page_text(page) for page in pdf)


def _page_text(page) -> str:
    """Sayfanın gömülü metnini, gerekiyorsa o sayfanın OCR'ını döndürür.

    Hybrid PDF'lerde kapak sayfasının metni, taranmış sayfaların OCR'lanmasını engellemez (D-003).
    Yapısal olarak görüntüye dayanan ve gömülü metni kısa kalan sayfalarda OCR da çalıştırılır: böylece
    bozuk ama MIN_TEXT_LENGTH'i geçen bir metin katmanı görüntüdeki asıl belgeyi gizleyemez.
    """
    embedded = page.get_text()
    if not _page_needs_ocr(page, embedded):
        return embedded
    if len(normalize_text(embedded)) < MIN_TEXT_LENGTH:
        return _ocr_page_text(page) or embedded
    return _merge_page_text(embedded, _ocr_page_text(page))


def _page_needs_ocr(page, embedded: str) -> bool:
    """D-003: metni MIN_TEXT_LENGTH'in altındaki sayfa ya da görüntüye dayanıp metni kısa kalan sayfa OCR gerektirir.

    Görüntü kapsaması yalnızca metni MIN_TEXT_LENGTH–OCR_SHORT_TEXT_MAX arasındaki sayfalarda ölçülür.
    """
    length = len(normalize_text(embedded))
    if length < MIN_TEXT_LENGTH:
        return True
    return length <= OCR_SHORT_TEXT_MAX and _image_coverage(page) >= OCR_COVERAGE_MIN


def _image_coverage(page) -> float:
    """Sayfa alanının görüntülerle kaplı oranı; taranmış sayfayı dijital sayfadan ayırır."""
    page_area = abs(page.rect)
    if not page_area:
        return 0.0
    covered = sum(abs(pymupdf.Rect(image["bbox"]) & page.rect) for image in page.get_image_info())
    return min(covered / page_area, 1.0)


def _merge_page_text(embedded: str, ocr: str) -> str:
    """OCR metni gömülü metni zaten kapsıyorsa yalnızca OCR'ı, kapsamıyorsa ikisini de döndürür.

    Aynı içerik iki kez yazılmaz; gömülü metindeki benzersiz bilgi (evrak no, tarih vb.) kaybolmaz.
    Kelime benzeri parçası olmayan bozuk katmanlar korunacak bilgi taşımadığı için OCR'a bırakılır.
    """
    if not ocr:
        return embedded
    ocr_tokens = set(_comparison_tokens(ocr))
    if all(token in ocr_tokens for token in _comparison_tokens(embedded)):
        return ocr
    return f"{embedded}\n{ocr}"


def _comparison_tokens(text: str) -> list[str]:
    """Karşılaştırma için kelime benzeri parçalar; OCR'ın Türkçe karakter kayıpları sadeleştirilir."""
    return _TOKEN_PATTERN.findall(text.translate(_ASCII_FOLD).lower())


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


def _extract_doc_text(content: bytes) -> str:
    """Word 97-2003 binary DOC gövde metni; paragraflar ve tablo hücreleri alınır (D-002).

    Saf Python parser kullanılır: Word, LibreOffice veya başka bir harici program gerekmez.
    OCR yapılmaz; gömülü görüntüler, makrolar ve biçimlendirme kapsam dışıdır.
    """
    return legacy_doc.extract_text(content, options=_DOC_OPTIONS).text


def _extract_docx_text(content: bytes) -> str:
    """Açılım denetimi (D-058) kilidin dışındadır: sınırı aşan DOCX sıra beklemeden reddedilir.

    Ayrıştırma kilit içinde (D-059) ve alt süreçte (D-060) çalışır; kilit hata durumunda da bırakılır. Alt süreç
    hata verirse ya da öldürülürse (ör. bellek sınırı) hata extract_text'te TextExtractionError olur.
    """
    _check_docx_archive(content)
    with _DOCX_PARSE_LOCK:
        return _run_in_child(docx_parser.parse_docx, content)


def _run_in_child(func, *args):
    """func(*args)'ı yeni bir alt süreçte çalıştırır ve sonucunu döndürür; süreç iş bitince çıkar (D-060)."""
    with ProcessPoolExecutor(max_workers=1, mp_context=_CHILD_CONTEXT) as executor:
        return executor.submit(func, *args).result()


def _check_docx_archive(content: bytes) -> None:
    """DOCX'i python-docx'e vermeden önce açılım sınırlarını (D-058) gerçek baytlarla denetler.

    Her parça _DOCX_READ_CHUNK'lık parçalar hâlinde açılır ve hemen bırakılır; bellek kullanımı parça boyutuyla
    sınırlıdır. Bir sınır aşıldığı anda okuma durur. Beyan edilen boyut gerçeğinden küçükse zipfile beyan edilen
    kadar okur ve CRC hatası verir; bu hata çağıranda normal metin çıkarım hatasıdır.
    """
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        entries = archive.infolist()
        if len(entries) > DOCX_MAX_ENTRIES:
            raise DocumentTooComplexError(f"DOCX {len(entries)} parça içeriyor; sınır {DOCX_MAX_ENTRIES}.")
        total = xml_bytes = xml_tags = 0
        for info in entries:
            is_xml = info.filename.endswith((".xml", ".rels"))
            with archive.open(info) as entry:
                while chunk := entry.read(_DOCX_READ_CHUNK):
                    total += len(chunk)
                    if is_xml:
                        xml_bytes += len(chunk)
                        xml_tags += chunk.count(b"<")
                    if (
                        total > DOCX_MAX_UNCOMPRESSED_BYTES
                        or xml_bytes > DOCX_MAX_XML_BYTES
                        or xml_tags > DOCX_MAX_XML_TAGS
                    ):
                        raise DocumentTooComplexError("DOCX açılım sınırları aşıldı.")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def check_text_length(text: str) -> None:
    """Normalize edilmiş metnin en az MIN_TEXT_LENGTH karakter olduğunu doğrular."""
    if len(text) < MIN_TEXT_LENGTH:
        raise TextExtractionError(f"Normalize edilmiş metin {len(text)} karakter; en az {MIN_TEXT_LENGTH} gerekli.")
