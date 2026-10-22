import uuid
from datetime import datetime

from sqlalchemy import JSON, DateTime, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Document(Base):
    __tablename__ = "documents"

    # UUID, dosya storage'a kaydedilmeden önce uygulama tarafında üretilir (D-029).
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    file_name: Mapped[str]
    file_type: Mapped[str]
    file_reference: Mapped[str]
    extracted_text: Mapped[str | None] = mapped_column(Text)
    document_type: Mapped[str | None]
    institution_id: Mapped[str | None]
    needs_review: Mapped[bool]
    review_reason: Mapped[str | None] = mapped_column(Text)
    # V1.2: sınıflandırmayla aynı çağrıdan gelir (D-044); failed kayıtlarda null kalır.
    summary: Mapped[str | None] = mapped_column(Text)
    sender_name: Mapped[str | None] = mapped_column(Text)
    sender_institution: Mapped[str | None] = mapped_column(Text)
    # D-049: kullanıcının onayladığı yönlendirme; AI alanlarından ayrı tutulur, onaysız kayıtta null.
    # validated_at doluysa validated_document_type da doludur; üçünü yalnız onay endpoint'i birlikte yazar.
    validated_document_type: Mapped[str | None]
    validated_institution_id: Mapped[str | None]
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # D-050: [{"quote", "supports"}] — yalnız kaynakta doğrulanmış ifadeler. NULL: evidence üretilmedi (eski, prepared,
    # failed); []: sınıflandırma çalıştı, doğrulanan ifade yok. None her zaman SQL NULL olarak yazılır (JSON null değil).
    routing_evidence: Mapped[list[dict] | None] = mapped_column(JSON(none_as_null=True))
    # D-053: metnin kaynağı; metin çıkarımı başarılıysa yazılır. True: Tesseract yedeği (D-047), False: dijital metin
    # veya Gemini transkripsiyonu. NULL: çıkarım tamamlanmadı (422) ya da kayıt bu alandan önce oluştu. Sınıflandırma
    # hatası needs_review'u temizlese de (D-004) bu bilgi kalır; failed kaydın tekrar denenmesi buna dayanır.
    ocr_fallback: Mapped[bool | None]
    status: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
