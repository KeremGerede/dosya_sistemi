"""add summary and sender metadata

Revision ID: cedf33674167
Revises: 2ab2daa5828a
Create Date: 2026-09-18 00:32:59.828222

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cedf33674167'
down_revision: Union[str, Sequence[str], None] = '2ab2daa5828a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Üçü de nullable: mevcut kayıtlar bu alanlar olmadan yazılmıştı (D-044).
    op.add_column("documents", sa.Column("summary", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("sender_name", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("sender_institution", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("documents", "sender_institution")
    op.drop_column("documents", "sender_name")
    op.drop_column("documents", "summary")
