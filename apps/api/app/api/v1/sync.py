import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from decimal import Decimal
from datetime import datetime
from app.db.session import get_db
from app.models.models import User, Device, Payment, PaymentEditHistory, Student, SyncOperation, AuditLog
from app.core.rbac import require_permission, get_current_user
from app.schemas.schemas import SyncPushRequest, SyncPushResponse, SyncOpResult

router = APIRouter()

@router.post("/push", response_model=SyncPushResponse)
def sync_push(
    push_req: SyncPushRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Enforce authoritative device authorization (no auto-registration of unknown UUID tokens)
    device = db.query(Device).filter(Device.device_token == push_req.device_token, Device.is_active == True).first()
    if not device:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unregistered or revoked device. Devices must be explicitly registered by an Administrator before synchronization."
        )

    results = []
    processed_count = 0

    for op in push_req.operations:
        # Check idempotency via client_tx_id
        existing_op = db.query(SyncOperation).filter(SyncOperation.client_tx_id == op.client_tx_id).first()
        if existing_op:
            results.append(SyncOpResult(client_tx_id=op.client_tx_id, status="DUPLICATE", error_message="Already processed"))
            continue

        op_status = "SUCCESS"
        err_msg = None

        try:
            payload = op.payload

            if op.entity_name == "payments" and op.operation_type == "CREATE":
                # Check payment idempotency
                existing_p = db.query(Payment).filter(Payment.client_tx_id == op.client_tx_id).first()
                if not existing_p:
                    # Concurrency protection & overpayment check
                    account = db.query(StudentFeeAccount).filter(
                        StudentFeeAccount.id == payload["student_fee_account_id"]
                    ).with_for_update().first()
                    
                    if not account:
                        op_status = "REJECTED"
                        err_msg = "Student fee account not found"
                    else:
                        paid_res = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
                            Payment.student_fee_account_id == account.id,
                            Payment.fee_type == payload["fee_type"],
                            Payment.status.in_(["VALID", "CORRECTED"])
                        ).scalar()

                        already_paid = Decimal(str(paid_res))
                        assigned_fee = Decimal(str(account.assigned_admission_fee)) if payload["fee_type"] == "ADMISSION" else Decimal(str(account.assigned_tuition_fee))
                        current_outstanding = max(Decimal("0.00"), assigned_fee - already_paid)
                        pay_amount = Decimal(str(payload["amount"]))

                        if pay_amount > current_outstanding:
                            op_status = "REJECTED"
                            err_msg = f"Overpayment prohibited: Payment (₹{pay_amount}) exceeds remaining balance (₹{current_outstanding})"
                        else:
                            p_date = datetime.strptime(payload["payment_date"], "%Y-%m-%d").date() if isinstance(payload["payment_date"], str) else payload["payment_date"]
                            payment = Payment(
                                client_tx_id=op.client_tx_id,
                                student_fee_account_id=payload["student_fee_account_id"],
                                fee_type=payload["fee_type"],
                                amount=pay_amount,
                                payment_mode=payload["payment_mode"],
                                upi_reference=payload.get("upi_reference"),
                                payment_date=p_date,
                                notes=payload.get("notes"),
                                recorded_by_user_id=current_user.id,
                        device_id=device.id,
                        status="VALID",
                        version=1
                    )
                    db.add(payment)

            elif op.entity_name == "payments" and op.operation_type == "CORRECT":
                payment_id = payload["payment_id"]
                payment = db.query(Payment).filter(Payment.id == payment_id).first()
                if not payment:
                    op_status = "REJECTED"
                    err_msg = "Target payment not found"
                else:
                    # Check for concurrent edit conflict
                    if payment.status == "CORRECTED" and payment.version > 1:
                        # Dual offline edit detected -> QUARANTINE
                        payment.status = "CONFLICT_QUARANTINED"
                        op_status = "CONFLICT_QUARANTINED"
                        err_msg = "Concurrent offline correction conflict detected. Quarantined for Admin review."
                    else:
                        prev_amount = payment.amount
                        prev_fee_type = payment.fee_type
                        prev_mode = payment.payment_mode

                        new_amount = Decimal(str(payload["new_amount"]))
                        new_fee_type = payload["new_fee_type"]
                        new_mode = payload["new_mode"]

                        edit_history = PaymentEditHistory(
                            payment_id=payment.id,
                            client_tx_id=op.client_tx_id,
                            previous_amount=prev_amount,
                            new_amount=new_amount,
                            previous_fee_type=prev_fee_type,
                            new_fee_type=new_fee_type,
                            previous_mode=prev_mode,
                            new_mode=new_mode,
                            reason=payload.get("reason", "Offline Correction"),
                            edited_by_user_id=current_user.id
                        )
                        db.add(edit_history)

                        payment.amount = new_amount
                        payment.fee_type = new_fee_type
                        payment.payment_mode = new_mode
                        payment.status = "CORRECTED"
                        payment.version += 1

            elif op.entity_name == "students" and op.operation_type == "UPDATE":
                student_id = payload["student_id"]
                student = db.query(Student).filter(Student.id == student_id).first()
                if student:
                    # Field level merge
                    if "phone" in payload: student.phone = payload["phone"]
                    if "address" in payload: student.address = payload["address"]
                    if "name" in payload: student.name = payload["name"]
                    student.version += 1

            # Save sync operation record
            sync_rec = SyncOperation(
                sync_batch_id=push_req.sync_batch_id,
                device_id=device.id,
                client_tx_id=op.client_tx_id,
                entity_name=op.entity_name,
                operation_type=op.operation_type,
                status=op_status,
                payload=json.dumps(payload),
                error_message=err_msg
            )
            db.add(sync_rec)
            db.commit()
            processed_count += 1
            results.append(SyncOpResult(client_tx_id=op.client_tx_id, status=op_status, error_message=err_msg))

        except Exception as e:
            db.rollback()
            results.append(SyncOpResult(client_tx_id=op.client_tx_id, status="REJECTED", error_message=str(e)))

    device.last_sync_at = datetime.utcnow()
    db.commit()

    return SyncPushResponse(
        sync_batch_id=push_req.sync_batch_id,
        processed_count=processed_count,
        results=results
    )
