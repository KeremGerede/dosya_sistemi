import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator


class ClassificationResult(BaseModel):
    """Gemini sınıflandırma çıktısı.

    İzinli document_type ve institution_id değerleri classification_service'te kataloglardan eklenir;
    burada yalnızca alanlar ve needs_review tutarlılık kuralları tanımlıdır.
    """

    document_type: str
    institution_id: str | None
    needs_review: bool
    review_reason: str | None
    summary: str
    sender_name: str | None
    sender_institution: str | None

    @model_validator(mode="after")
    def check_summary_is_present(self) -> "ClassificationResult":
        if not self.summary.strip():
            raise ValueError("summary boş olamaz")
        return self

    @model_validator(mode="after")
    def check_review_consistency(self) -> "ClassificationResult":
        if self.needs_review:
            if not self.review_reason or not self.review_reason.strip():
                raise ValueError("needs_review=true iken review_reason dolu olmalı")
        else:
            if self.institution_id is None:
                raise ValueError("needs_review=false iken institution_id dolu olmalı")
            if self.review_reason is not None:
                raise ValueError("needs_review=false iken review_reason null olmalı")
        return self


class ClassifyResponse(BaseModel):
    """POST /api/documents/classify başarılı yanıtı (D-032). file_reference ve extracted_text dönmez."""

    document_id: uuid.UUID
    file_name: str
    file_type: str
    document_type: str | None
    document_type_name: str | None
    institution_id: str | None
    institution_name: str | None
    needs_review: bool
    review_reason: str | None
    # V1.2: aynı Gemini çağrısından gelen özet ve gönderen bilgisi (D-044). failed kayıtlarda null.
    summary: str | None
    sender_name: str | None
    sender_institution: str | None
    status: str


class FailedClassifyResponse(ClassifyResponse):
    """Kabul sonrası failed yanıtı (D-034): aynı alanlar + genel kullanıcı mesajı."""

    message: str


class DocumentSummary(ClassifyResponse):
    """GET /api/documents listesi (D-043): classify yanıtının alanları + created_at.

    file_reference ve extracted_text bilinçli olarak yoktur; storage yolu istemciye açılmaz.
    """

    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentDetail(DocumentSummary):
    """GET /api/documents/{document_id} (D-043): özet alanları + çıkarılan metnin tamamı."""

    extracted_text: str | None


class ValidationErrorResponse(BaseModel):
    """FastAPI'nin istek doğrulama hatası gövdesi (ör. file alanı yok). Yalnızca OpenAPI belgesi içindir."""

    detail: list[dict[str, Any]] = Field(description="FastAPI doğrulama hataları (loc, msg, type).")
