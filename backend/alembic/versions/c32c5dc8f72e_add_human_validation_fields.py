"""add human validation fields

Revision ID: c32c5dc8f72e
Revises: cedf33674167
Create Date: 2026-10-06 08:55:00.282963

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c32c5dc8f72e'
down_revision: Union[str, Sequence[str], None] = 'cedf33674167'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Üçü de nullable: mevcut kayıtlar onaysızdır, veri taşıma yok (D-049).
    # validated_at ⇔ validated_document_type kuralı CHECK ile değil, onay endpoint'inde korunur.
    op.add_column("documents", sa.Column("validated_document_type", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("validated_institution_id", sa.String(), nullable=True))
    op.add_column("documents", sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("documents", "validated_at")
    op.drop_column("documents", "validated_institution_id")
    op.drop_column("documents", "validated_document_type")
