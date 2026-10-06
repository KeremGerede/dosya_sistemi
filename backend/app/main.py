import logging

from fastapi import FastAPI

from app.api import catalogs, documents

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Belge Sınıflandırma Modülü")
app.include_router(documents.router)
app.include_router(catalogs.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
