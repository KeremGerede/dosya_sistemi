from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.settings import DATABASE_URL

# hide_parameters: SQL hata mesajlarında ve loglarda parametre değerleri (ör. belge metni) gösterilmez.
engine = create_engine(DATABASE_URL, hide_parameters=True)
SessionLocal = sessionmaker(bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    """FastAPI dependency: istek başına bir session; istek bitince kapatılır."""
    with SessionLocal() as session:
        yield session
