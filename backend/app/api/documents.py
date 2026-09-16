"""POST /api/documents/classify: kabul kontrolü → storage → metin çıkarımı → Gemini → veritabanı → yanıt.

Endpoint bilinçli olarak senkron (def): metin çıkarımı, Gemini çağrısı ve veritabanı erişimi bloklayıcıdır ve
FastAPI bunları thread pool'da çalıştırır (D-020). Belge metni, dosya içeriği ve API anahtarı loglanmaz.
"""

import logging
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.document import Document
from app.schemas.classification import ClassifyResponse, FailedClassifyResponse
from app.services import classification_service, file_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/documents", tags=["documents"])

FILE_TOO_LARGE_MESSAGE = "Dosya boyutu 50 MB sınırını aşıyor."
UNSUPPORTED_FILE_MESSAGE = "Yalnızca metin tabanlı PDF veya DOCX dosyaları kabul edilir."
TEXT_EXTRACTION_FAILED_MESSAGE = "Belgeden sınıflandırma için yeterli metin çıkarılamadı."
CLASSIFICATION_FAILED_MESSAGE = "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."


@router.post(
    "/classify",
    response_model=ClassifyResponse,
    responses={
        413: {"description": FILE_TOO_LARGE_MESSAGE},
        415: {"description": UNSUPPORTED_FILE_MESSAGE},
        422: {"model": FailedClassifyResponse, "description": "Belge içeriği işlenemedi; failed kaydı oluşturulur."},
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


def _response_body(document: Document, message: str | None) -> ClassifyResponse:
    fields = {
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
    if message is None:
        return ClassifyResponse(**fields)
    return FailedClassifyResponse(**fields, message=message)
