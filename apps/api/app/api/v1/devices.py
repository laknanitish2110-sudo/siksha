import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.models import User, Device
from app.core.rbac import require_permission
from app.schemas.schemas import DeviceRegister, DeviceResponse

router = APIRouter()

@router.post("/register", response_model=DeviceResponse)
def register_device(
    device_data: DeviceRegister,
    current_user: User = Depends(require_permission("staff:manage")),
    db: Session = Depends(get_db)
):
    device_token = f"DEV-REG-{uuid.uuid4()}"
    device = Device(
        device_token=device_token,
        device_name=device_data.device_name,
        registered_by_user_id=current_user.id,
        is_active=True
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device
