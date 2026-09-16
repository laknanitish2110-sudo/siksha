import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from decimal import Decimal
from app.db.session import get_db
from app.models.models import User, AcademicYear, FeeStructure, StudentFeeAccount, Payment, AuditLog
from app.core.rbac import require_permission, get_current_user
from app.schemas.schemas import (
    AcademicYearCreate, AcademicYearResponse,
    FeeStructureCreate, FeeStructureResponse,
    StudentFeeAccountResponse
)

router = APIRouter()

# --- ACADEMIC YEARS ---
@router.get("/academic-years", response_model=List[AcademicYearResponse])
def list_academic_years(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return db.query(AcademicYear).order_by(AcademicYear.start_date.desc()).all()

@router.post("/academic-years", response_model=AcademicYearResponse, status_code=status.HTTP_201_CREATED)
def create_academic_year(
    ay_in: AcademicYearCreate,
    current_user: User = Depends(require_permission("fee_struct:manage")),
    db: Session = Depends(get_db)
):
    existing = db.query(AcademicYear).filter(AcademicYear.name == ay_in.name).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Academic year '{ay_in.name}' already exists")

    if ay_in.is_current:
        db.query(AcademicYear).update({AcademicYear.is_current: False})

    ay = AcademicYear(**ay_in.model_dump())
    db.add(ay)
    db.flush()

    audit = AuditLog(
        user_id=current_user.id,
        action="ACADEMIC_YEAR_CREATED",
        entity_type="academic_years",
        entity_id=ay.id,
        new_value=json.dumps({"name": ay.name}),
        client_timestamp=datetime.utcnow()
    )
    db.add(audit)

    db.commit()
    db.refresh(ay)
    return ay

# --- FEE STRUCTURES (TEMPLATES) ---
@router.get("/fee-structures", response_model=List[FeeStructureResponse])
def list_fee_structures(
    academic_year_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(FeeStructure)
    if academic_year_id:
        query = query.filter(FeeStructure.academic_year_id == academic_year_id)
    return query.order_by(FeeStructure.class_level.asc(), FeeStructure.version.desc()).all()

@router.post("/fee-structures", response_model=FeeStructureResponse, status_code=status.HTTP_201_CREATED)
def create_or_version_fee_structure(
    fee_in: FeeStructureCreate,
    current_user: User = Depends(require_permission("fee_struct:manage")),
    db: Session = Depends(get_db)
):
    # Find latest version for this class & AY
    latest = db.query(FeeStructure).filter(
        FeeStructure.academic_year_id == fee_in.academic_year_id,
        FeeStructure.class_level == fee_in.class_level
    ).order_by(FeeStructure.version.desc()).first()

    next_version = (latest.version + 1) if latest else 1

    fee_struct = FeeStructure(
        academic_year_id=fee_in.academic_year_id,
        class_level=fee_in.class_level,
        admission_fee=fee_in.admission_fee,
        tuition_fee=fee_in.tuition_fee,
        version=next_version
    )
    db.add(fee_struct)
    db.flush()

    # Audit Log Insertion
    audit = AuditLog(
        user_id=current_user.id,
        action="FEE_STRUCTURE_CHANGED",
        entity_type="fee_structures",
        entity_id=fee_struct.id,
        old_value=json.dumps({"admission_fee": str(latest.admission_fee), "tuition_fee": str(latest.tuition_fee)}) if latest else None,
        new_value=json.dumps({"class": fee_struct.class_level, "admission_fee": str(fee_struct.admission_fee), "tuition_fee": str(fee_struct.tuition_fee), "version": fee_struct.version}),
        client_timestamp=datetime.utcnow()
    )
    db.add(audit)

    db.commit()
    db.refresh(fee_struct)
    return fee_struct

# --- STUDENT FEE ACCOUNT LEDGER BALANCES ---
@router.get("/student-fees/{student_id}", response_model=StudentFeeAccountResponse)
def get_student_fee_account(
    student_id: str,
    current_user: User = Depends(require_permission("student:read")),
    db: Session = Depends(get_db)
):
    account = db.query(StudentFeeAccount).filter(StudentFeeAccount.student_id == student_id).first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student fee account not found")

    # Sum valid admission payments
    adm_paid_res = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.student_fee_account_id == account.id,
        Payment.fee_type == "ADMISSION",
        Payment.status.in_(["VALID", "CORRECTED"])
    ).scalar()

    # Sum valid tuition payments
    tui_paid_res = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.student_fee_account_id == account.id,
        Payment.fee_type == "TUITION",
        Payment.status.in_(["VALID", "CORRECTED"])
    ).scalar()

    adm_paid = Decimal(str(adm_paid_res))
    tui_paid = Decimal(str(tui_paid_res))

    assigned_adm = Decimal(str(account.assigned_admission_fee))
    assigned_tui = Decimal(str(account.assigned_tuition_fee))

    adm_outstanding = max(Decimal("0.00"), assigned_adm - adm_paid)
    tui_outstanding = max(Decimal("0.00"), assigned_tui - tui_paid)
    total_outstanding = adm_outstanding + tui_outstanding

    return StudentFeeAccountResponse(
        id=account.id,
        student_id=account.student_id,
        academic_year_id=account.academic_year_id,
        assigned_admission_fee=assigned_adm,
        assigned_tuition_fee=assigned_tui,
        admission_paid=adm_paid,
        tuition_paid=tui_paid,
        admission_outstanding=adm_outstanding,
        tuition_outstanding=tui_outstanding,
        total_outstanding=total_outstanding
    )
