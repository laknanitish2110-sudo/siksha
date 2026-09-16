from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from app.db.session import get_db
from app.models.models import User, Payment, StudentFeeAccount, Student
from app.core.rbac import require_permission, get_current_user
from app.schemas.schemas import DailyReportResponse, MonthlyReportResponse, AcademicYearReportResponse

router = APIRouter()

@router.get("/daily", response_model=DailyReportResponse)
def get_daily_report(
    target_date: Optional[date] = Query(None),
    current_user: User = Depends(require_permission("reports:view")),
    db: Session = Depends(get_db)
):
    if not target_date:
        target_date = date.today()

    payments = db.query(Payment).filter(
        Payment.payment_date == target_date,
        Payment.status.in_(["VALID", "CORRECTED"])
    ).all()

    total = sum(p.amount for p in payments) if payments else Decimal("0.00")
    cash = sum(p.amount for p in payments if p.payment_mode == "CASH") if payments else Decimal("0.00")
    upi = sum(p.amount for p in payments if p.payment_mode == "UPI") if payments else Decimal("0.00")
    adm = sum(p.amount for p in payments if p.fee_type == "ADMISSION") if payments else Decimal("0.00")
    tui = sum(p.amount for p in payments if p.fee_type == "TUITION") if payments else Decimal("0.00")

    return DailyReportResponse(
        report_date=target_date,
        total_collection=total,
        cash_collection=cash,
        upi_collection=upi,
        transaction_count=len(payments),
        admission_collection=adm,
        tuition_collection=tui
    )

@router.get("/monthly", response_model=MonthlyReportResponse)
def get_monthly_report(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    current_user: User = Depends(require_permission("reports:view")),
    db: Session = Depends(get_db)
):
    start_d = date(year, month, 1)
    if month == 12:
        end_d = date(year + 1, 1, 1)
    else:
        end_d = date(year, month + 1, 1)

    payments = db.query(Payment).filter(
        Payment.payment_date >= start_d,
        Payment.payment_date < end_d,
        Payment.status.in_(["VALID", "CORRECTED"])
    ).all()

    total = sum(p.amount for p in payments) if payments else Decimal("0.00")
    cash = sum(p.amount for p in payments if p.payment_mode == "CASH") if payments else Decimal("0.00")
    upi = sum(p.amount for p in payments if p.payment_mode == "UPI") if payments else Decimal("0.00")

    # Count distinct accounts paid this month
    account_ids = set(p.student_fee_account_id for p in payments)

    # Calculate total outstanding across all active fee accounts
    all_accounts = db.query(StudentFeeAccount).all()
    total_outstanding = Decimal("0.00")
    for acc in all_accounts:
        paid_adm = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.student_fee_account_id == acc.id,
            Payment.fee_type == "ADMISSION",
            Payment.status.in_(["VALID", "CORRECTED"])
        ).scalar()
        paid_tui = db.query(func.coalesce(func.sum(Payment.amount), 0)).filter(
            Payment.student_fee_account_id == acc.id,
            Payment.fee_type == "TUITION",
            Payment.status.in_(["VALID", "CORRECTED"])
        ).scalar()

        out_adm = max(Decimal("0.00"), acc.assigned_admission_fee - Decimal(str(paid_adm)))
        out_tui = max(Decimal("0.00"), acc.assigned_tuition_fee - Decimal(str(paid_tui)))
        total_outstanding += (out_adm + out_tui)

    return MonthlyReportResponse(
        year=year,
        month=month,
        total_collection=total,
        cash_collection=cash,
        upi_collection=upi,
        transaction_count=len(payments),
        total_paid_students=len(account_ids),
        total_outstanding_amount=total_outstanding
    )
