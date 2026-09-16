from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import get_db
from app.models.models import User, AuditLog
from app.core.rbac import require_permission

router = APIRouter()

@router.get("")
def get_audit_logs(
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    limit: int = 100,
    current_user: User = Depends(require_permission("audit:view")),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if entity_type:
        query = query.filter(AuditLog.entity_type == entity_type)
    
    logs = query.order_by(AuditLog.server_timestamp.desc()).limit(limit).all()
    return logs
