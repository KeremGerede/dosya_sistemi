"""Salt okunur katalog endpoint'i (D-049).

Düzeltme seçenekleri, sınıflandırmanın kullandığı bellekteki kataloglardan döner; kataloglar tek kaynak kalır (D-012).
Katalog yönetimi yoktur.
"""

from fastapi import APIRouter

from app.schemas.classification import CatalogsResponse
from app.services import classification_service

router = APIRouter(prefix="/api", tags=["catalogs"])


@router.get("/catalogs", response_model=CatalogsResponse, summary="Belge türü ve kurum kataloglarını döndürür")
def get_catalogs() -> CatalogsResponse:
    """Katalog dosyasındaki sırayla yalnız id ve ad döner; kurum açıklaması dönmez."""
    return CatalogsResponse(
        document_types=classification_service.DOCUMENT_TYPES,
        institutions=classification_service.INSTITUTIONS,
    )
