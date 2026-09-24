"""Belge endpoint'leri.

- POST /api/documents/classify (legacy / tek-adımlı): kabul kontrolü → storage → metin çıkarımı → Gemini → veritabanı.
- V1.4 iki adımlı akış (D-045, D-046): POST /prepare (kabul → storage → metin çıkarımı → prepared kaydı),
  POST /{id}/classify (kayıttaki metinle Gemini) ve DELETE /{id}/prepared (hazırlanmış kaydı ve dosyasını siler).
- Salt okunur kayıt endpoint'leri (D-043).

Endpoint'ler bilinçli olarak senkron (def): metin çıkarımı, Gemini çağrısı ve veritabanı erişimi bloklayıcıdır ve
FastAPI bunları thread pool'da çalıştırır (D-020). Belge metni, dosya içeriği, storage yolu ve API anahtarı loglanmaz.
"""

import logging
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
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
UNSUPPORTED_FILE_MESSAGE = "Yalnızca PDF, DOC, DOCX, JPG, JPEG veya PNG dosyaları kabul edilir."
TEXT_EXTRACTION_FAILED_MESSAGE = "Belgeden sınıflandırma için yeterli metin çıkarılamadı."
CLASSIFICATION_FAILED_MESSAGE = "Belge şu anda sınıflandırılamadı. Lütfen daha sonra tekrar deneyin."
DOCUMENT_NOT_FOUND_MESSAGE = "Belge bulunamadı."
ALREADY_PROCESSED_MESSAGE = "Belge zaten işlenmiş."
SOURCE_FILE_MISSING_MESSAGE = "Belgenin orijinal dosyasına ulaşılamadı; belgeyi kaldırıp yeniden yükleyin."

PREPARED_STATUS = "prepared"  # metni çıkarılmış, henüz sınıflandırılmamış belge (D-046)
PREPARED_TTL = timedelta(hours=24)  # sahipsiz prepared kayıtlar bundan eskiyse sonraki prepare'de temizlenir (D-046)

# Yükleme yapan endpoint'lerin ortak red yanıtları (OpenAPI).
UPLOAD_ERROR_RESPONSES = {
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
}


@router.post(
    "/classify",
    response_model=ClassifyResponse,
    responses={
        **UPLOAD_ERROR_RESPONSES,
        502: {"model": FailedClassifyResponse, "description": "Gemini ile sınıflandırma tamamlanamadı; failed kaydı oluşturulur."},
    },
    summary="Legacy / tek-adımlı sınıflandırma: belgeyi yükler ve tek istekte sınıflandırır",
)
def classify_document(file: Annotated[UploadFile, File()], db: Annotated[Session, Depends(get_db)]):
    """Geriye dönük uyumluluk için korunur (D-019, D-045); V1.4 arayüzü iki adımlı akışı kullanır."""
    return _create_document(file, db, classify=True)


@router.post(
    "/prepare",
    response_model=DocumentDetail,
    responses=UPLOAD_ERROR_RESPONSES,
    summary="Belgeyi doğrular, saklar ve metnini çıkarır; Gemini çağırmaz",
)
def prepare_document(file: Annotated[UploadFile, File()], db: Annotated[Session, Depends(get_db)]):
    """V1.4 akışının ilk adımı (D-045): kayıt prepared olur; yanıt önizleme için çıkarılan metni içerir."""
    _delete_expired_prepared(db)
    return _create_document(file, db, classify=False)


def _delete_expired_prepared(db: Session) -> None:
    """Sahipsiz prepared kayıtların yedek temizliği (D-046): zamanlayıcı yok, prepare isteğinin başında çalışır.

    PREPARED_TTL'den eski prepared kayıtlar dosyalarıyla silinir. Dosyası silinemeyen kayıt atlanır ve sonraki
    temizlikte yeniden denenir. Temizlik hatası prepare isteğini düşürmez.
    """
    cutoff = datetime.now(timezone.utc) - PREPARED_TTL
    try:
        expired = db.scalars(
            select(Document).where(Document.status == PREPARED_STATUS, Document.created_at < cutoff)
        ).all()
        if not expired:
            return
        removed = 0
        for document in expired:
            try:
                _discard_prepared(document, db)
                removed += 1
            except OSError as exc:
                logger.warning("Süresi dolmuş hazırlanmış belge %s silinemedi (%s); sonraki temizlikte denenecek.", document.id, type(exc).__name__)
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Hazırlanmış belge temizliği tamamlanamadı (%s).", type(exc).__name__)
        return
    logger.info("%d süresi dolmuş hazırlanmış belge silindi.", removed)


def _create_document(file: UploadFile, db: Session, *, classify: bool):
    """Legacy classify ve prepare'in ortak yolu: kabul → storage → metin çıkarımı → (sınıflandırma) → kayıt."""
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
        document = Document(
            id=document_id,
            file_name=file_name,
            file_type=file_type,
            file_reference=file_reference,
            needs_review=False,
            status="failed",
        )
        failure = _extract_into(document, content)
        if failure is None:
            if classify:
                failure = _classify_into(document)
            else:
                document.status = PREPARED_STATUS
        db.add(document)
        db.flush()  # prepare yanıtındaki created_at (sunucu varsayılanı) commit'ten önce okunabilsin
        if document.status == PREPARED_STATUS:
            body = DocumentDetail(**_record_fields(document), extracted_text=document.extracted_text)
        else:
            body = _response_body(document, failure)
        db.commit()
    except Exception as exc:
        # Kayıt veritabanına yazılamadıysa bu isteğin oluşturduğu dosya orphan kalmasın.
        logger.error("Belge %s kaydedilemedi (%s); işlem geri alınıyor ve storage dosyası siliniyor.", document_id, type(exc).__name__)
        file_service.delete_file(file_reference)
        db.rollback()
        raise

    return _respond(body, failure)


def _extract_into(document: Document, content: bytes) -> tuple[int, str] | None:
    """Metni çıkarıp kayda yazar. Yetersizse kayıt failed olur ve (422, mesaj) döner."""
    extracted_text = None
    try:
        extracted_text = file_service.extract_text(content, document.file_type)
        file_service.check_text_length(extracted_text)
    except file_service.TextExtractionError as exc:
        logger.warning("Belge %s: metin çıkarılamadı veya yetersiz (%s).", document.id, exc)
        document.extracted_text = extracted_text or None
        document.status = "failed"
        return 422, TEXT_EXTRACTION_FAILED_MESSAGE

    document.extracted_text = extracted_text
    return None


def _classify_into(document: Document) -> tuple[int, str] | None:
    """Kayıttaki metni tek Gemini çağrısıyla sınıflandırır. Başarısızsa kayıt failed olur ve (502, mesaj) döner."""
    try:
        result = classification_service.classify_text(document.extracted_text)
    except classification_service.ClassificationError as exc:
        logger.warning("Belge %s: Gemini sınıflandırması tamamlanamadı (%s).", document.id, type(exc.__cause__).__name__)
        document.status = "failed"
        return 502, CLASSIFICATION_FAILED_MESSAGE

    document.document_type = result.document_type
    document.institution_id = result.institution_id
    document.needs_review = result.needs_review
    document.review_reason = result.review_reason
    document.summary = result.summary
    document.sender_name = result.sender_name
    document.sender_institution = result.sender_institution
    document.status = "needs_review" if result.needs_review else "classified"
    logger.info("Belge %s sınıflandırıldı: status=%s.", document.id, document.status)
    return None


def _respond(body: BaseModel, failure: tuple[int, str] | None):
    """Başarıda gövde response_model ile döner; failed gövdesi kendi HTTP koduyla döner."""
    if failure is None:
        return body
    return JSONResponse(status_code=failure[0], content=body.model_dump(mode="json"))


@router.post(
    "/{document_id}/classify",
    response_model=ClassifyResponse,
    responses={
        404: {"description": DOCUMENT_NOT_FOUND_MESSAGE},
        409: {"description": f"{ALREADY_PROCESSED_MESSAGE} / {SOURCE_FILE_MISSING_MESSAGE} Gemini çağrılmaz, kayıt değişmez."},
        502: {"model": FailedClassifyResponse, "description": "Gemini ile sınıflandırma tamamlanamadı; kayıt failed olur."},
    },
    summary="Hazırlanmış belgeyi kayıttaki metinle sınıflandırır",
)
def classify_prepared_document(document_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]):
    """V1.4 akışının ikinci adımı (D-045, D-046): dosya yeniden okunmaz, OCR tekrar çalışmaz.

    Yalnızca prepared kayıt ve storage'da duran orijinal dosyayla çalışır; aksi halde orijinali indirilemeyen
    bir sonuç kaydı oluşmasın diye 409 döner.
    """
    document = _get_or_404(document_id, db)
    if document.status != PREPARED_STATUS:
        raise HTTPException(status_code=409, detail=ALREADY_PROCESSED_MESSAGE)
    if _stored_file_path(document) is None:
        logger.warning("Belge %s: orijinal dosya storage'da bulunamadı; sınıflandırma yapılmadı.", document_id)
        raise HTTPException(status_code=409, detail=SOURCE_FILE_MISSING_MESSAGE)

    failure = _classify_into(document)
    body = _response_body(document, failure)
    try:
        db.commit()
    except Exception as exc:
        # Kayıt prepared kalır ve dosya yerinde durur; sınıflandırma tekrar denenebilir.
        logger.error("Belge %s: sınıflandırma sonucu kaydedilemedi (%s); işlem geri alınıyor.", document_id, type(exc).__name__)
        db.rollback()
        raise
    return _respond(body, failure)


@router.delete(
    "/{document_id}/prepared",
    status_code=204,
    responses={
        404: {"description": DOCUMENT_NOT_FOUND_MESSAGE},
        409: {"description": f"{ALREADY_PROCESSED_MESSAGE} Kalıcı kayıtlar silinmez; kayda ve dosyaya dokunulmaz."},
    },
    summary="Henüz sınıflandırılmamış (prepared) belgeyi ve dosyasını siler",
)
def discard_prepared_document(document_id: uuid.UUID, db: Annotated[Session, Depends(get_db)]) -> None:
    """Kullanıcının "Kaldır" işlemi (D-046). Kalıcı kayıtlar (classified/needs_review/failed) bu yolla silinemez."""
    document = _get_or_404(document_id, db)
    if document.status != PREPARED_STATUS:
        raise HTTPException(status_code=409, detail=ALREADY_PROCESSED_MESSAGE)
    try:
        _discard_prepared(document, db)
        db.commit()
    except Exception as exc:
        # Kayıt prepared kalır: Kaldır tekrar denenebilir, yedek temizlik de bulur.
        logger.error("Belge %s kaldırılamadı (%s); işlem geri alınıyor.", document_id, type(exc).__name__)
        db.rollback()
        raise
    logger.info("Hazırlanmış belge %s kaldırıldı.", document_id)


def _discard_prepared(document: Document, db: Session) -> None:
    """Önce storage dosyası, sonra kayıt silinir; commit çağırana aittir.

    Sıra bilinçlidir: işlem yarıda kalırsa geride kaydı olan bir artık kalır ve yedek temizlik onu bulur.
    Dosya zaten yoksa ya da yol storage dışına çıkıyorsa yalnızca kayıt silinir.
    """
    path = _stored_file_path(document)
    if path is not None:
        path.unlink(missing_ok=True)
    db.delete(document)


@router.get(
    "",
    response_model=list[DocumentSummary],
    summary="Kayıtlı belgeleri listeler (en yeni önce)",
)
def list_documents(db: Annotated[Session, Depends(get_db)]) -> list[DocumentSummary]:
    """Salt okunur kayıt listesi (D-043). extracted_text ve file_reference dönmez; prepared kayıtlar listelenmez (D-046)."""
    documents = db.scalars(
        select(Document).where(Document.status != PREPARED_STATUS).order_by(Document.created_at.desc(), Document.id)
    ).all()
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
    path = _stored_file_path(document)
    if path is None:
        logger.warning("Belge %s: storage dosyası bulunamadı veya geçersiz.", document_id)
        raise HTTPException(status_code=404, detail=DOCUMENT_NOT_FOUND_MESSAGE)
    return FileResponse(path, media_type=file_service.MEDIA_TYPES[document.file_type], filename=document.file_name)


def _stored_file_path(document: Document) -> Path | None:
    """Kaydın storage'daki dosyası; dosya yoksa ya da yol storage dışına çıkıyorsa None. Yol istemciye açılmaz."""
    storage_dir = file_service.STORAGE_DIR.resolve()
    path = (storage_dir / document.file_reference).resolve()
    # file_reference her zaman "<uuid>.<uzantı>"dır; yine de storage dışına çıkan bir yol kabul edilmez.
    if not path.is_file() or path.parent != storage_dir:
        return None
    return path


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
        "summary": document.summary,
        "sender_name": document.sender_name,
        "sender_institution": document.sender_institution,
        "status": document.status,
    }


def _response_body(document: Document, failure: tuple[int, str] | None) -> ClassifyResponse:
    fields = _classify_fields(document)
    if failure is None:
        return ClassifyResponse(**fields)
    return FailedClassifyResponse(**fields, message=failure[1])
