"""add ocr fallback

Revision ID: 261a2937eb7c
Revises: 5ed883607e08
Create Date: 2026-10-22 01:52:31.672158

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '261a2937eb7c'
down_revision: Union[str, Sequence[str], None] = '5ed883607e08'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable boolean (D-053): metin çıkarımı başarılı olan yeni kayıtlarda yazılır. Mevcut kayıtlar NULL kalır
    # ("metin kaynağı bilinmiyor"); backfill, server default, index ve constraint yok.
    op.add_column("documents", sa.Column("ocr_fallback", sa.Boolean(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("documents", "ocr_fallback")
