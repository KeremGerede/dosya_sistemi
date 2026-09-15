import uuid
from datetime import datetime

from sqlalchemy import DateTime, Text, func
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
    status: Mapped[str]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
