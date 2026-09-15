from pydantic import BaseModel, model_validator


class ClassificationResult(BaseModel):
    """Gemini sınıflandırma çıktısı.

    İzinli document_type ve institution_id değerleri classification_service'te kataloglardan eklenir;
    burada yalnızca alanlar ve needs_review tutarlılık kuralları tanımlıdır.
    """

    document_type: str
    institution_id: str | None
    needs_review: bool
    review_reason: str | None

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
