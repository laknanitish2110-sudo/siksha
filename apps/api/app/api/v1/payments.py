from datetime import datetime, time
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from decimal import Decimal
from app.db.session import get_db
from app.models.models import User, StudentFeeAccount, Payment, PaymentEditHistory, AuditLog
from app.core.rbac import require_permission, get_current_user
from app.schemas.schemas import PaymentCreate, PaymentCorrect, PaymentResponse

router = APIRouter()

@router.post("", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
def record_payment(
    payment_in: PaymentCreate,
    current_user: User = Depends(require_permission("payment:create")),
    db: Session = Depends(get_db)
):
    # 1. Idempotency Check: client_tx_id
    existing_tx = db.query(Payment).filter(Payment.client_tx_id == payment_in.client_tx_id).first()
    if existing_tx:
        return existing_tx

    # 2. Account Check & Pessimistic Lock for Concurrency Protection
    account = db.query(StudentFeeAccount).filter(
        StudentFeeAccount.id == payment_in.student_fee_account_id
    ).with_for_update().first()
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student fee account not found")

    # 3. Calculate current balance inside protected transaction
    paid_res = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
        Payment.student_fee_account_id == account.id,
        Payment.fee_type == payment_in.fee_type,
        Payment.status.in_(["VALID", "CORRECTED"])
    ).scalar()

    already_paid = Decimal(str(paid_res))
    assigned_fee = Decimal(str(account.assigned_admission_fee)) if payment_in.fee_type == "ADMISSION" else Decimal(str(account.assigned_tuition_fee))
    current_outstanding = max(Decimal("0.00"), assigned_fee - already_paid)

    if payment_in.amount > current_outstanding:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Payment amount (₹{payment_in.amount}) exceeds outstanding balance (₹{current_outstanding}) for {payment_in.fee_type} fee."
        )

    # 4. Insert Payment
    payment = Payment(
        client_tx_id=payment_in.client_tx_id,
        student_fee_account_id=payment_in.student_fee_account_id,
        fee_type=payment_in.fee_type,
        amount=payment_in.amount,
        payment_mode=payment_in.payment_mode,
        upi_reference=payment_in.upi_reference,
        payment_date=payment_in.payment_date,
        notes=payment_in.notes,
        recorded_by_user_id=current_user.id,
        status="VALID",
        version=1
    )
    db.add(payment)
    db.flush() # Flush to populate payment.id for AuditLog

    # 5. Audit Log Entry
    client_dt = datetime.combine(payment_in.payment_date, time.min)
    audit = AuditLog(
        user_id=current_user.id,
        action="PAYMENT_CREATED",
        entity_type="payments",
        entity_id=payment.id,
        new_value=f"{{\"client_tx_id\":\"{payment_in.client_tx_id}\", \"amount\":{payment_in.amount}, \"fee_type\":\"{payment_in.fee_type}\"}}",
        client_timestamp=client_dt
    )
    db.add(audit)

    db.commit()
    db.refresh(payment)
    return payment

@router.put("/{payment_id}/correct", response_model=PaymentResponse)
def correct_payment(
    payment_id: str,
    correct_in: PaymentCorrect,
    current_user: User = Depends(require_permission("payment:correct")),
    db: Session = Depends(get_db)
):
    # 1. Idempotency Check on edit client_tx_id
    existing_edit = db.query(PaymentEditHistory).filter(PaymentEditHistory.client_tx_id == correct_in.client_tx_id).first()
    payment = db.query(Payment).filter(Payment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment not found")

    if existing_edit:
        return payment

    # Record previous values
    prev_amount = payment.amount
    prev_fee_type = payment.fee_type
    prev_mode = payment.payment_mode

    # Add to edit history
    edit_entry = PaymentEditHistory(
        payment_id=payment.id,
        client_tx_id=correct_in.client_tx_id,
        previous_amount=prev_amount,
        new_amount=correct_in.new_amount,
        previous_fee_type=prev_fee_type,
        new_fee_type=correct_in.new_fee_type,
        previous_mode=prev_mode,
        new_mode=correct_in.new_mode,
        reason=correct_in.reason,
        edited_by_user_id=current_user.id
    )
    db.add(edit_entry)

    # Update current payment row
    payment.amount = correct_in.new_amount
    payment.fee_type = correct_in.new_fee_type
    payment.payment_mode = correct_in.new_mode
    payment.status = "CORRECTED"
    payment.version += 1

    # Audit log entry
    client_dt = datetime.combine(payment.payment_date, time.min)
    audit = AuditLog(
        user_id=current_user.id,
        action="PAYMENT_CORRECTED",
        entity_type="payments",
        entity_id=payment.id,
        old_value=f"{{\"amount\":{prev_amount}, \"fee_type\":\"{prev_fee_type}\"}}",
        new_value=f"{{\"amount\":{correct_in.new_amount}, \"fee_type\":\"{correct_in.new_fee_type}\", \"reason\":\"{correct_in.reason}\"}}",
        client_timestamp=client_dt
    )
    db.add(audit)

    db.commit()
    db.refresh(payment)
    return payment

@router.get("/student/{student_id}", response_model=List[PaymentResponse])
def get_student_payments(
    student_id: str,
    current_user: User = Depends(require_permission("payment:history")),
    db: Session = Depends(get_db)
):
    account = db.query(StudentFeeAccount).filter(StudentFeeAccount.student_id == student_id).first()
    if not account:
        return []
    
    return db.query(Payment).filter(
        Payment.student_fee_account_id == account.id
    ).order_by(Payment.payment_date.desc(), Payment.created_at.desc()).all()
