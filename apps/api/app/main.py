from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.session import SessionLocal, engine
from app.db.init_db import init_db

from app.api.v1.auth import router as auth_router
from app.api.v1.devices import router as devices_router
from app.api.v1.students import router as students_router
from app.api.v1.fee_structures import router as fee_router
from app.api.v1.payments import router as payments_router
from app.api.v1.sync import router as sync_router
from app.api.v1.reports import router as reports_router
from app.api.v1.audit import router as audit_router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json"
)

# Configure CORS from settings.CORS_ORIGINS
cors_origins = [o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()]
if not cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    db = SessionLocal()
    try:
        init_db(db)
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {"status": "ok", "app": settings.PROJECT_NAME, "version": settings.VERSION}

# Mount API Router
app.include_router(auth_router, prefix=f"{settings.API_V1_STR}/auth", tags=["Authentication"])
app.include_router(devices_router, prefix=f"{settings.API_V1_STR}/devices", tags=["Devices"])
app.include_router(students_router, prefix=f"{settings.API_V1_STR}/students", tags=["Students"])
app.include_router(fee_router, prefix=settings.API_V1_STR, tags=["Fee Management"])
app.include_router(payments_router, prefix=f"{settings.API_V1_STR}/payments", tags=["Payments"])
app.include_router(sync_router, prefix=f"{settings.API_V1_STR}/sync", tags=["Sync Engine"])
app.include_router(reports_router, prefix=f"{settings.API_V1_STR}/reports", tags=["Reports"])
app.include_router(audit_router, prefix=f"{settings.API_V1_STR}/audit-logs", tags=["Audit Logs"])
