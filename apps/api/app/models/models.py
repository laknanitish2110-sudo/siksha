import uuid
from datetime import datetime, date
from sqlalchemy import (
    Column, String, Boolean, DateTime, Date, Numeric, Integer, Text, ForeignKey, CheckConstraint, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.db.session import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    roles = relationship("Role", secondary="user_roles", back_populates="users")


class Role(Base):
    __tablename__ = "roles"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(50), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)

    users = relationship("User", secondary="user_roles", back_populates="roles")
    permissions = relationship("Permission", secondary="role_permissions", back_populates="roles")


class Permission(Base):
    __tablename__ = "permissions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    code = Column(String(100), unique=True, nullable=False, index=True)
    module = Column(String(50), nullable=False, index=True)
    description = Column(Text, nullable=True)

    roles = relationship("Role", secondary="role_permissions", back_populates="permissions")


class UserRole(Base):
    __tablename__ = "user_roles"

    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)


class RolePermission(Base):
    __tablename__ = "role_permissions"

    role_id = Column(String(36), ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(String(36), ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)


class Device(Base):
    __tablename__ = "devices"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    device_token = Column(String(255), unique=True, nullable=False, index=True)
    device_name = Column(String(100), nullable=False)
    registered_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class AcademicYear(Base):
    __tablename__ = "academic_years"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    name = Column(String(20), unique=True, nullable=False) # e.g. "2025-26"
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_current = Column(Boolean, default=False, nullable=False, index=True)


class Student(Base):
    __tablename__ = "students"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    admission_no = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    father_name = Column(String(100), nullable=False)
    mother_name = Column(String(100), nullable=False)
    phone = Column(String(15), nullable=False, index=True)
    class_level = Column(String(20), nullable=False, index=True) # e.g. "10"
    academic_year_id = Column(String(36), ForeignKey("academic_years.id"), nullable=False, index=True)
    date_of_admission = Column(Date, nullable=False)
    address = Column(Text, nullable=False)
    status = Column(String(20), default="ACTIVE", nullable=False, index=True) # ACTIVE/COMPLETED/TRANSFERRED/DROPPED/INACTIVE
    deleted_at = Column(DateTime, nullable=True)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    fee_accounts = relationship("StudentFeeAccount", back_populates="student")


class FeeStructure(Base):
    __tablename__ = "fee_structures"
    __table_args__ = (
        UniqueConstraint('academic_year_id', 'class_level', 'version', name='uq_fee_struct'),
        CheckConstraint('admission_fee >= 0', name='check_fs_admission_fee_non_negative'),
        CheckConstraint('tuition_fee >= 0', name='check_fs_tuition_fee_non_negative'),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id"), nullable=False)
    class_level = Column(String(20), nullable=False)
    admission_fee = Column(Numeric(10, 2), nullable=False)
    tuition_fee = Column(Numeric(10, 2), nullable=False)
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class StudentFeeAccount(Base):
    __tablename__ = "student_fee_accounts"
    __table_args__ = (
        UniqueConstraint('student_id', 'academic_year_id', name='uq_student_ay_account'),
        CheckConstraint('assigned_admission_fee >= 0', name='check_sfa_admission_fee_non_negative'),
        CheckConstraint('assigned_tuition_fee >= 0', name='check_sfa_tuition_fee_non_negative'),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    student_id = Column(String(36), ForeignKey("students.id"), nullable=False)
    academic_year_id = Column(String(36), ForeignKey("academic_years.id"), nullable=False)
    assigned_admission_fee = Column(Numeric(10, 2), nullable=False)
    assigned_tuition_fee = Column(Numeric(10, 2), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    student = relationship("Student", back_populates="fee_accounts")
    payments = relationship("Payment", back_populates="fee_account")


class Payment(Base):
    __tablename__ = "payments"
    __table_args__ = (
        CheckConstraint('amount >= 0', name='check_payment_amount_non_negative'),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    client_tx_id = Column(String(36), unique=True, nullable=False, index=True)
    student_fee_account_id = Column(String(36), ForeignKey("student_fee_accounts.id"), nullable=False, index=True)
    fee_type = Column(String(20), nullable=False, index=True) # ADMISSION / TUITION
    amount = Column(Numeric(10, 2), nullable=False)
    payment_mode = Column(String(10), nullable=False, index=True) # CASH / UPI
    upi_reference = Column(String(100), nullable=True)
    payment_date = Column(Date, nullable=False, index=True)
    notes = Column(Text, nullable=True)
    recorded_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=True)
    status = Column(String(30), default="VALID", nullable=False, index=True) # VALID / CORRECTED / VOIDED / CONFLICT_QUARANTINED
    version = Column(Integer, default=1, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    fee_account = relationship("StudentFeeAccount", back_populates="payments")
    edit_history = relationship("PaymentEditHistory", back_populates="payment")


class PaymentEditHistory(Base):
    __tablename__ = "payment_edit_history"
    __table_args__ = (
        CheckConstraint('new_amount >= 0', name='check_edit_new_amount_non_negative'),
    )

    id = Column(String(36), primary_key=True, default=generate_uuid)
    payment_id = Column(String(36), ForeignKey("payments.id"), nullable=False, index=True)
    client_tx_id = Column(String(36), unique=True, nullable=False, index=True)
    previous_amount = Column(Numeric(10, 2), nullable=False)
    new_amount = Column(Numeric(10, 2), nullable=False)
    previous_fee_type = Column(String(20), nullable=False)
    new_fee_type = Column(String(20), nullable=False)
    previous_mode = Column(String(10), nullable=False)
    new_mode = Column(String(10), nullable=False)
    reason = Column(Text, nullable=False)
    edited_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    edited_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    payment = relationship("Payment", back_populates="edit_history")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=True)
    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(50), nullable=False, index=True)
    entity_id = Column(String(36), nullable=False)
    old_value = Column(Text, nullable=True) # Stored as JSON string
    new_value = Column(Text, nullable=True) # Stored as JSON string
    client_timestamp = Column(DateTime, nullable=False)
    server_timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)


class SyncOperation(Base):
    __tablename__ = "sync_operations"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    sync_batch_id = Column(String(36), nullable=False, index=True)
    device_id = Column(String(36), ForeignKey("devices.id"), nullable=False, index=True)
    client_tx_id = Column(String(36), unique=True, nullable=False, index=True)
    entity_name = Column(String(50), nullable=False)
    operation_type = Column(String(20), nullable=False) # CREATE / UPDATE / CORRECT
    status = Column(String(30), nullable=False, index=True) # SUCCESS / DUPLICATE / REJECTED / CONFLICT_QUARANTINED
    payload = Column(Text, nullable=False) # Stored as JSON string
    error_message = Column(Text, nullable=True)
    processed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
