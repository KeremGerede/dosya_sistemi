import uuid
from datetime import datetime
from typing import Any, Literal, get_args

from pydantic import BaseModel, Field, model_validator

RoutingEvidenceSupport = Literal["document_type", "institution", "both"]
ROUTING_EVIDENCE_SUPPORTS = get_args(RoutingEvidenceSupport)


class RoutingEvidenceCandidate(BaseModel):
    """Belgedeki ilgili ifade (D-050): modelin önerisidir, kaynakta doğrulanmadan kullanılmaz."""

    quote: str
    supports: RoutingEvidenceSupport


class RoutingEvidence(RoutingEvidenceCandidate):
    """Yanıttaki belgedeki ilgili ifade (D-050): yalnız backend birebir doğrulamasından geçmiş ifadeler."""


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
    # D-050: son alan; sınıflandırma alanları evidence'tan önce üretilir. Şemada zorunlu değildir, boş liste geçerlidir.
    routing_evidence: list[RoutingEvidenceCandidate] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def drop_invalid_routing_evidence(cls, data: Any) -> Any:
        """Evidence sınıflandırmanın başarısını belirlemez (D-050): eksik, null, yanlış tipli veya bozuk evidence ve
        geçersiz öğeler nested doğrulamadan önce ayıklanır; sınıflandırma alanları yine doğrulanır.

        Hiçbir girdide hata yükseltmez: google-genai yanıtı aynı modelle parse eder ve ValidationError dışındaki
        hatayı isteğe yansıtır.
        """
        if not isinstance(data, dict):
            return data
        items = data.get("routing_evidence")
        return {
            **data,
            "routing_evidence": [
                item
                for item in (items if isinstance(items, list) else [])
                if isinstance(item, dict)
                and isinstance(item.get("quote"), str)
                and isinstance(item.get("supports"), str)
                and item["supports"] in ROUTING_EVIDENCE_SUPPORTS
            ],
        }

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
    # D-050: kaynakta doğrulanmış ifadeler; [] = doğrulanan ifade yok. prepared, failed ve eski kayıtlarda null.
    routing_evidence: list[RoutingEvidence] | None
    status: str
    # D-049: kullanıcı onayı; onaysız kayıtta null. Adlar ID'den kataloglardan çözülür, veritabanında saklanmaz.
    validated_document_type: str | None
    validated_document_type_name: str | None
    validated_institution_id: str | None
    validated_institution_name: str | None
    validated_at: datetime | None


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


class RoutingValidationRequest(BaseModel):
    """PUT /api/documents/{document_id}/validation gövdesi (D-049).

    İki alan da zorunlu; institution_id null olabilir, ek alan kabul edilmez.
    İzinli ID'ler api/documents.py'de kataloglardan Literal olarak eklenir (build_output_model emsali).
    """

    model_config = {"extra": "forbid"}

    document_type: str
    institution_id: str | None


class CatalogItem(BaseModel):
    id: str
    name: str


class CatalogsResponse(BaseModel):
    """GET /api/catalogs (D-049): düzeltme seçenekleri, katalog dosyasındaki sırayla. Kurum açıklaması dönmez."""

    document_types: list[CatalogItem]
    institutions: list[CatalogItem]


class ValidationErrorResponse(BaseModel):
    """FastAPI'nin istek doğrulama hatası gövdesi (ör. file alanı yok). Yalnızca OpenAPI belgesi içindir."""

    detail: list[dict[str, Any]] = Field(description="FastAPI doğrulama hataları (loc, msg, type).")
