"""POST /api/documents/classify: kabul kontrolü → storage → metin çıkarımı → Gemini → veritabanı → yanıt.

Endpoint bilinçli olarak senkron (def): metin çıkarımı, Gemini çağrısı ve veritabanı erişimi bloklayıcıdır ve
FastAPI bunları thread pool'da çalıştırır (D-020). Belge metni, dosya içeriği ve API anahtarı loglanmaz.
"""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.schemas.classification import (
    ClassifyResponse,
    DocumentDetail,
    DocumentSummary,
    FailedClassifyResponse,
    ValidationErrorResponse,
)
from app.services import classification_service, file_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

FILE_TOO_LARGE_MESSAGE = "Dosya boyutu 50 MB sınırını aşıyor."
UNSUPPORTED_FILE_MESSAGE = "Yalnızca metin tabanlı PDF veya DOCX dosyaları kabul edilir."
TEXT_EXTRACTION_FAILED_MESSAGE = "Belgeden sınıflandırma için yeterli metin çıkarılamadı."
CLASSIFICATION_FAILED_MESSAGE = "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."
DOCUMENT_NOT_FOUND_MESSAGE = "Belge bulunamadı."


@router.post(
    "/classify",
    response_model=ClassifyResponse,
    responses={
        413: {"description": FILE_TOO_LARGE_MESSAGE},
        415: {"description": UNSUPPORTED_FILE_MESSAGE},
        # Runtime'da iki farklı 422 gövdesi olabilir; ikisi de OpenAPI'de belgelenir.
        422: {
            "model": FailedClassifyResponse | ValidationErrorResponse,
            "description": (
                "İki olası gövde: (1) FailedClassifyResponse — belge içeriği işlenemedi, failed kaydı oluşturulur "
                '(status = "failed", message); (2) ValidationErrorResponse — istek doğrulanamadı '
                "(ör. file alanı gönderilmedi), kayıt oluşturulmaz."
            ),
        },
        502: {"model": FailedClassifyResponse, "description": "Gemini ile sınıflandırma tamamlanamadı; failed kaydı oluşturulur."},
    },
)
def classify_document(file: Annotated[UploadFile, File()], db: Annotated[Session, Depends(get_db)]):
    # Content-Length'e güvenilmez: en fazla MAX_FILE_SIZE + 1 bayt okunur; fazlası sınırın aşıldığını gösterir.
    content = file.file.read(file_service.MAX_FILE_SIZE + 1)
    file_name = file.filename or ""
    try:
        file_service.check_file_size(len(content))
        file_type = file_service.detect_file_type(file_name, content)
    except file_service.FileTooLargeError:
        raise HTTPException(status_code=413, detail=FILE_TOO_LARGE_MESSAGE) from None
    except file_service.UnsupportedFileTypeError:
        raise HTTPException(status_code=415, detail=UNSUPPORTED_FILE_MESSAGE) from None

    document_id = uuid.uuid4()
    file_reference = file_service.save_file(content, document_id, file_type)
    try:
        document, status_code, message = _process_document(document_id, file_name, file_type, file_reference, content)
        body = _response_body(document, message)
        db.add(document)
        db.commit()
    except Exception as exc:
        # Kayıt veritabanına yazılamadıysa bu isteğin oluşturduğu dosya orphan kalmasın.
        logger.error("Belge %s kaydedilemedi (%s); işlem geri alınıyor ve storage dosyası siliniyor.", document_id, type(exc).__name__)
        file_service.delete_file(file_reference)
        db.rollback()
        raise

    if message is None:
        return body
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def _process_document(
    document_id: uuid.UUID, file_name: str, file_type: str, file_reference: str, content: bytes
) -> tuple[Document, int, str | None]:
    """Metin çıkarımı ve sınıflandırmayı yapar; veritabanına yazılacak kaydı, HTTP kodunu ve failed mesajını döner."""
    document = Document(
        id=document_id,
        file_name=file_name,
        file_type=file_type,
        file_reference=file_reference,
        needs_review=False,
        status="failed",
    )

    extracted_text = None
    try:
        extracted_text = file_service.extract_text(content, file_type)
        file_service.check_text_length(extracted_text)
    except file_service.TextExtractionError as exc:
        logger.warning("Belge %s: metin çıkarılamadı veya yetersiz (%s).", document_id, exc)
        document.extracted_text = extracted_text or None
        return document, 422, TEXT_EXTRACTION_FAILED_MESSAGE

    document.extracted_text = extracted_text
    try:
        result = classification_service.classify_text(extracted_text)
    except classification_service.ClassificationError as exc:
        logger.warning("Belge %s: Gemini sınıflandırması tamamlanamadı (%s).", document_id, type(exc.__cause__).__name__)
        return document, 502, CLASSIFICATION_FAILED_MESSAGE

    document.document_type = result.document_type
    document.institution_id = result.institution_id
    document.needs_review = result.needs_review
    document.review_reason = result.review_reason
    document.status = "needs_review" if result.needs_review else "classified"
    logger.info("Belge %s sınıflandırıldı: status=%s.", document_id, document.status)
    return document, 200, None


@router.get(
    "",
    response_model=list[DocumentSummary],
    summary="Kayıtlı belgeleri listeler (en yeni önce)",
)
def list_documents(db: Annotated[Session, Depends(get_db)]) -> list[DocumentSummary]:
    """Salt okunur kayıt listesi (D-043). extracted_text ve file_reference dönmez."""
    documents = db.scalars(select(Document).order_by(Document.created_at.desc(), Document.id)).all()
    return [DocumentSummary(**_record_fields(document)) for document in documents]


@router.get(
    "/{document_id}",
    response_model=DocumentDetail,
    responses={404: {"description": DOCUMENT_NOT_FOUND_MESSAGE}},
    summary="Tek belgenin kaydını ve çıkarılan metnini döndürür",
)
def get_document(document_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> DocumentDetail:
    """Salt okunur kayıt detayı (D-043). file_reference yine dönmez."""
    document = _get_or_404(document_id, db)
    return DocumentDetail(**_record_fields(document), extracted_text=document.extracted_text)


@router.get(
    "/{document_id}/download",
    response_class=FileResponse,
    responses={404: {"description": DOCUMENT_NOT_FOUND_MESSAGE}},
    summary="Belgenin orijinal dosyasını indirir",
)
def download_document(document_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> FileResponse:
    """Orijinal dosyayı kullanıcının yüklediği adla döndürür (D-043).

    Dosya yolu istemciye açılmaz; kayıt ya da fiziksel dosya yoksa ayrıntısız 404 döner.
    """
    document = _get_or_404(document_id, db)
    storage_dir = file_service.STORAGE_DIR.resolve()
    path = (storage_dir / document.file_reference).resolve()
    # file_reference her zaman "<uuid>.<uzantı>"dır; yine de storage dışına çıkan bir yol kabul edilmez.
    if not path.is_file() or path.parent != storage_dir:
        logger.warning("Belge %s: storage dosyası bulunamadı veya geçersiz.", document_id)
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND_MESSAGE)
    return FileResponse(path, media_type=file_service.MEDIA_TYPES[document.file_type], filename=document.file_name)


def _get_or_404(document_id: uuid.UUID, db: Session) -> Document:
    document = db.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND_MESSAGE)
    return document


def _record_fields(document: Document) -> dict:
    """Kayıt yanıtlarının ortak alanları: classify yanıtının alanları + created_at."""
    return {**_classify_fields(document), "created_at": document.created_at}


def _classify_fields(document: Document) -> dict:
    return {
        "document_id": document.id,
        "file_name": document.file_name,
        "file_type": document.file_type,
        # Adlar kataloglardan okunur (D-032); ID null ise ad da null olur.
        "document_type": document.document_type,
        "document_type_name": classification_service.DOCUMENT_TYPE_NAMES.get(document.document_type),
        "institution_id": document.institution_id,
        "institution_name": classification_service.INSTITUTION_NAMES.get(document.institution_id),
        "needs_review": document.needs_review,
        "review_reason": document.review_reason,
        "status": document.status,
    }


def _response_body(document: Document, message: str | None) -> ClassifyResponse:
    fields = _classify_fields(document)
    if message is None:
        return ClassifyResponse(**fields)
    return FailedClassifyResponse(**fields, message=message)
