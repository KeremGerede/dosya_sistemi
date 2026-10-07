"""add routing evidence

Revision ID: 5ed883607e08
Revises: c32c5dc8f72e
Create Date: 2026-10-07 16:54:51.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5ed883607e08'
down_revision: Union[str, Sequence[str], None] = 'c32c5dc8f72e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Nullable generic JSON (D-050): mevcut kayıtlar NULL kalır ("evidence üretilmedi"); backfill, server default,
    # index ve constraint yok.
    op.add_column("documents", sa.Column("routing_evidence", sa.JSON(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("documents", "routing_evidence")
