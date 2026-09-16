from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Any
from datetime import datetime, date
from decimal import Decimal

# --- AUTH SCHEMAS ---
class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RoleSummary(BaseModel):
    id: str
    name: str
    permissions: List[str]

    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    full_name: str
    is_active: bool
    roles: List[RoleSummary]

    class Config:
        from_attributes = True

# --- DEVICE SCHEMAS ---
class DeviceRegister(BaseModel):
    device_name: str
    device_identifier: Optional[str] = None

class DeviceResponse(BaseModel):
    id: str
    device_token: str
    device_name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

# --- ACADEMIC YEAR SCHEMAS ---
class AcademicYearCreate(BaseModel):
    name: str # e.g. "2025-26"
    start_date: date
    end_date: date
    is_current: bool = False

class AcademicYearResponse(BaseModel):
    id: str
    name: str
    start_date: date
    end_date: date
    is_current: bool

    class Config:
        from_attributes = True

# --- STUDENT SCHEMAS ---
class StudentCreate(BaseModel):
    admission_no: str
    name: str
    father_name: str
    mother_name: str
    phone: str
    class_level: str
    academic_year_id: str
    date_of_admission: date
    address: str

class StudentUpdate(BaseModel):
    name: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    phone: Optional[str] = None
    class_level: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    version: Optional[int] = None

class StudentResponse(BaseModel):
    id: str
    admission_no: str
    name: str
    father_name: str
    mother_name: str
    phone: str
    class_level: str
    academic_year_id: str
    date_of_admission: date
    address: str
    status: str
    version: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- FEE STRUCTURE SCHEMAS ---
class FeeStructureCreate(BaseModel):
    academic_year_id: str
    class_level: str
    admission_fee: Decimal = Field(..., ge=0)
    tuition_fee: Decimal = Field(..., ge=0)

class FeeStructureResponse(BaseModel):
    id: str
    academic_year_id: str
    class_level: str
    admission_fee: Decimal
    tuition_fee: Decimal
    version: int

    class Config:
        from_attributes = True

# --- STUDENT FEE ACCOUNT SCHEMAS ---
class StudentFeeAccountResponse(BaseModel):
    id: str
    student_id: str
    academic_year_id: str
    assigned_admission_fee: Decimal
    assigned_tuition_fee: Decimal
    admission_paid: Decimal = Decimal("0.00")
    tuition_paid: Decimal = Decimal("0.00")
    admission_outstanding: Decimal = Decimal("0.00")
    tuition_outstanding: Decimal = Decimal("0.00")
    total_outstanding: Decimal = Decimal("0.00")

    class Config:
        from_attributes = True

# --- PAYMENT SCHEMAS ---
class PaymentCreate(BaseModel):
    client_tx_id: str
    student_fee_account_id: str
    fee_type: str # ADMISSION / TUITION
    amount: Decimal = Field(..., gt=0)
    payment_mode: str # CASH / UPI
    upi_reference: Optional[str] = None
    payment_date: date
    notes: Optional[str] = None

class PaymentCorrect(BaseModel):
    client_tx_id: str
    new_amount: Decimal = Field(..., gt=0)
    new_fee_type: str
    new_mode: str
    reason: str

class PaymentResponse(BaseModel):
    id: str
    client_tx_id: str
    student_fee_account_id: str
    fee_type: str
    amount: Decimal
    payment_mode: str
    upi_reference: Optional[str]
    payment_date: date
    notes: Optional[str]
    recorded_by_user_id: str
    status: str
    version: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- SYNC SCHEMAS ---
class SyncOperationItem(BaseModel):
    client_tx_id: str
    entity_name: str # "payments", "payment_corrections", "students"
    operation_type: str # "CREATE", "UPDATE", "CORRECT"
    client_timestamp: datetime
    payload: dict

class SyncPushRequest(BaseModel):
    device_token: str
    sync_batch_id: str
    operations: List[SyncOperationItem]

class SyncOpResult(BaseModel):
    client_tx_id: str
    status: str # SUCCESS / DUPLICATE / REJECTED / CONFLICT_QUARANTINED
    error_message: Optional[str] = None

class SyncPushResponse(BaseModel):
    sync_batch_id: str
    processed_count: int
    results: List[SyncOpResult]

# --- REPORT SCHEMAS ---
class DailyReportResponse(BaseModel):
    report_date: date
    total_collection: Decimal
    cash_collection: Decimal
    upi_collection: Decimal
    transaction_count: int
    admission_collection: Decimal
    tuition_collection: Decimal

class MonthlyReportResponse(BaseModel):
    year: int
    month: int
    total_collection: Decimal
    cash_collection: Decimal
    upi_collection: Decimal
    transaction_count: int
    total_paid_students: int
    total_outstanding_amount: Decimal

class AcademicYearReportResponse(BaseModel):
    academic_year: str
    total_students: int
    total_expected_fees: Decimal
    total_collected: Decimal
    total_outstanding: Decimal
    cash_collected: Decimal
    upi_collected: Decimal
