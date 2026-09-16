import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from app.db.session import get_db
from app.models.models import User, Student, FeeStructure, StudentFeeAccount, AcademicYear, AuditLog
from app.core.rbac import require_permission, get_current_user
from app.schemas.schemas import StudentCreate, StudentUpdate, StudentResponse

router = APIRouter()

@router.get("", response_model=List[StudentResponse])
def list_students(
    q: Optional[str] = Query(None, description="Search query for name, admission_no, or phone"),
    class_level: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None),
    current_user: User = Depends(require_permission("student:read")),
    db: Session = Depends(get_db)
):
    query = db.query(Student).filter(Student.deleted_at == None)
    if q:
        search_pattern = f"%{q}%"
        query = query.filter(
            or_(
                Student.name.ilike(search_pattern),
                Student.admission_no.ilike(search_pattern),
                Student.phone.ilike(search_pattern)
            )
        )
    if class_level:
        query = query.filter(Student.class_level == class_level)
    if status_filter:
        query = query.filter(Student.status == status_filter)
    
    return query.order_by(Student.name.asc()).all()

@router.post("", response_model=StudentResponse, status_code=status.HTTP_201_CREATED)
def create_student(
    student_in: StudentCreate,
    current_user: User = Depends(require_permission("student:create")),
    db: Session = Depends(get_db)
):
    # Check unique admission_no
    existing = db.query(Student).filter(Student.admission_no == student_in.admission_no).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Admission Number '{student_in.admission_no}' is already registered."
        )

    # Check academic year exists
    ay = db.query(AcademicYear).filter(AcademicYear.id == student_in.academic_year_id).first()
    if not ay:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Academic year not found")

    student = Student(
        admission_no=student_in.admission_no,
        name=student_in.name,
        father_name=student_in.father_name,
        mother_name=student_in.mother_name,
        phone=student_in.phone,
        class_level=student_in.class_level,
        academic_year_id=student_in.academic_year_id,
        date_of_admission=student_in.date_of_admission,
        address=student_in.address,
        status="ACTIVE"
    )
    db.add(student)
    db.flush()

    # Find active fee structure for class & academic year to auto-initialize assigned fees
    fee_struct = db.query(FeeStructure).filter(
        FeeStructure.academic_year_id == student_in.academic_year_id,
        FeeStructure.class_level == student_in.class_level
    ).order_by(FeeStructure.version.desc()).first()

    assigned_adm = fee_struct.admission_fee if fee_struct else 0.00
    assigned_tui = fee_struct.tuition_fee if fee_struct else 0.00

    fee_account = StudentFeeAccount(
        student_id=student.id,
        academic_year_id=student_in.academic_year_id,
        assigned_admission_fee=assigned_adm,
        assigned_tuition_fee=assigned_tui,
        notes="Auto-assigned on registration"
    )
    db.add(fee_account)

    # Audit Log Insertion
    audit = AuditLog(
        user_id=current_user.id,
        action="STUDENT_CREATED",
        entity_type="students",
        entity_id=student.id,
        new_value=json.dumps({"name": student.name, "admission_no": student.admission_no, "class": student.class_level}),
        client_timestamp=datetime.utcnow()
    )
    db.add(audit)

    db.commit()
    db.refresh(student)
    return student

@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: str,
    current_user: User = Depends(require_permission("student:read")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id, Student.deleted_at == None).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student

@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: str,
    student_in: StudentUpdate,
    current_user: User = Depends(require_permission("student:update")),
    db: Session = Depends(get_db)
):
    student = db.query(Student).filter(Student.id == student_id, Student.deleted_at == None).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    old_val = json.dumps({"name": student.name, "phone": student.phone, "address": student.address})
    update_data = student_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None and field != "version":
            setattr(student, field, value)
    
    student.version += 1
    new_val = json.dumps({"name": student.name, "phone": student.phone, "address": student.address})

    # Audit Log Insertion
    audit = AuditLog(
        user_id=current_user.id,
        action="STUDENT_UPDATED",
        entity_type="students",
        entity_id=student.id,
        old_value=old_val,
        new_value=new_val,
        client_timestamp=datetime.utcnow()
    )
    db.add(audit)

    db.commit()
    db.refresh(student)
    return student

@router.patch("/{student_id}/status", response_model=StudentResponse)
def change_student_status(
    student_id: str,
    new_status: str,
    current_user: User = Depends(require_permission("student:status")),
    db: Session = Depends(get_db)
):
    valid_statuses = ["ACTIVE", "COMPLETED", "TRANSFERRED", "DROPPED", "INACTIVE"]
    if new_status not in valid_statuses:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid status. Must be one of {valid_statuses}")

    student = db.query(Student).filter(Student.id == student_id, Student.deleted_at == None).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    old_status = student.status
    student.status = new_status
    student.version += 1

    # Audit Log Insertion
    audit = AuditLog(
        user_id=current_user.id,
        action="STUDENT_STATUS_CHANGED",
        entity_type="students",
        entity_id=student.id,
        old_value=json.dumps({"status": old_status}),
        new_value=json.dumps({"status": new_status}),
        client_timestamp=datetime.utcnow()
    )
    db.add(audit)

    db.commit()
    db.refresh(student)
    return student
