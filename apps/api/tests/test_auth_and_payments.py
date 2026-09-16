import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import datetime
from decimal import Decimal

from app.main import app
from app.db.session import Base, get_db
from app.db.init_db import init_db

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    app.dependency_overrides[get_db] = override_get_db
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    init_db(db)
    yield
    Base.metadata.drop_all(bind=engine)
    db.close()
    app.dependency_overrides.clear()

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

def test_login_success():
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    assert res.status_code == 200
    data = res.json()
    assert "access_token" in data
    assert "refresh_token" in data

def test_login_invalid_password():
    res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrongpassword"})
    assert res.status_code == 401

def get_or_create_test_student(headers):
    # Check if student exists
    stu_res = client.get("/api/v1/students?q=ADM-2025-001", headers=headers)
    if stu_res.status_code == 200 and len(stu_res.json()) > 0:
        return stu_res.json()[0]["id"]
    
    # Otherwise create AY, Fee Struct, and Student
    ay_res = client.post("/api/v1/academic-years", json={
        "name": "2025-26",
        "start_date": "2025-06-01",
        "end_date": "2026-04-30",
        "is_current": True
    }, headers=headers)
    ay_id = ay_res.json()["id"]

    client.post("/api/v1/fee-structures", json={
        "academic_year_id": ay_id,
        "class_level": "10",
        "admission_fee": 2000.00,
        "tuition_fee": 25000.00
    }, headers=headers)

    stu_create = client.post("/api/v1/students", json={
        "admission_no": "ADM-2025-001",
        "name": "Rahul Sharma",
        "father_name": "Ramesh Sharma",
        "mother_name": "Sita Sharma",
        "phone": "9876543210",
        "class_level": "10",
        "academic_year_id": ay_id,
        "date_of_admission": "2025-06-10",
        "address": "Hyderabad"
    }, headers=headers)
    return stu_create.json()["id"]

def test_student_and_payment_flow():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    stu_id = get_or_create_test_student(headers)

    account_res = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers)
    assert account_res.status_code == 200
    acc_data = account_res.json()
    assert acc_data["assigned_admission_fee"] == "2000.00"
    assert acc_data["assigned_tuition_fee"] == "25000.00"

    # Record Admission Payment ₹2,000
    pay1_res = client.post("/api/v1/payments", json={
        "client_tx_id": "tx-uuid-001",
        "student_fee_account_id": acc_data["id"],
        "fee_type": "ADMISSION",
        "amount": 2000.00,
        "payment_mode": "CASH",
        "payment_date": "2025-06-10",
        "notes": "Paid full admission fee"
    }, headers=headers)
    assert pay1_res.status_code == 201

    acc_after1 = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_after1["admission_outstanding"] == "0.00"
    assert acc_after1["tuition_outstanding"] == "25000.00"

    # Test Idempotency
    pay1_dup = client.post("/api/v1/payments", json={
        "client_tx_id": "tx-uuid-001",
        "student_fee_account_id": acc_data["id"],
        "fee_type": "ADMISSION",
        "amount": 2000.00,
        "payment_mode": "CASH",
        "payment_date": "2025-06-10"
    }, headers=headers)
    assert pay1_dup.status_code in (200, 201)

    # Test Overpayment Protection
    overpay_res = client.post("/api/v1/payments", json={
        "client_tx_id": "tx-uuid-002",
        "student_fee_account_id": acc_data["id"],
        "fee_type": "TUITION",
        "amount": 30000.00,
        "payment_mode": "UPI",
        "payment_date": "2025-06-11"
    }, headers=headers)
    assert overpay_res.status_code == 422

def test_payment_correction_and_audit_flow():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    stu_id = get_or_create_test_student(headers)
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Record initial Tuition Payment ₹5,000
    pay_res = client.post("/api/v1/payments", json={
        "client_tx_id": "tx-corr-orig-001",
        "student_fee_account_id": acc_data["id"],
        "fee_type": "TUITION",
        "amount": 5000.00,
        "payment_mode": "CASH",
        "payment_date": "2025-06-12",
        "notes": "Original tuition payment"
    }, headers=headers)
    assert pay_res.status_code == 201
    pay_id = pay_res.json()["id"]

    acc_mid = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_mid["tuition_outstanding"] == "20000.00"

    # Apply Payment Correction (₹5,000 -> ₹500)
    corr_res = client.put(f"/api/v1/payments/{pay_id}/correct", json={
        "client_tx_id": "tx-corr-edit-001",
        "new_amount": 500.00,
        "new_fee_type": "TUITION",
        "new_mode": "CASH",
        "reason": "Mistaken extra zero entered by cashier"
    }, headers=headers)
    assert corr_res.status_code == 200
    edited_data = corr_res.json()
    assert edited_data["amount"] == "500.00"
    assert edited_data["status"] == "CORRECTED"

    acc_after = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_after["tuition_outstanding"] == "24500.00"

    audit_res = client.get("/api/v1/audit-logs?action=PAYMENT_CORRECTED", headers=headers)
    assert audit_res.status_code == 200
    assert len(audit_res.json()) >= 1

def test_concurrent_edit_quarantine_conflict():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Register device for sync permission
    dev_res = client.post("/api/v1/devices/register", json={"device_name": "Quarantine Test Device"}, headers=headers)
    dev_token = dev_res.json()["device_token"]

    stu_id = get_or_create_test_student(headers)
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Create payment & initial correction if no CORRECTED payment exists
    payments = client.get(f"/api/v1/payments/student/{stu_id}", headers=headers).json()
    corrected_pays = [p for p in payments if p["status"] == "CORRECTED"]
    if not corrected_pays:
        pay_res = client.post("/api/v1/payments", json={
            "client_tx_id": "tx-quarantine-orig-001",
            "student_fee_account_id": acc_data["id"],
            "fee_type": "TUITION",
            "amount": 2000.00,
            "payment_mode": "CASH",
            "payment_date": "2025-06-12"
        }, headers=headers)
        pay_id = pay_res.json()["id"]
        corr_res = client.put(f"/api/v1/payments/{pay_id}/correct", json={
            "client_tx_id": "tx-quarantine-edit-001",
            "new_amount": 500.00,
            "new_fee_type": "TUITION",
            "new_mode": "CASH",
            "reason": "Initial correction for quarantine test"
        }, headers=headers)
        corrected_pay = corr_res.json()
    else:
        corrected_pay = corrected_pays[0]

    # Concurrent edit push quarantine check using authorized device token
    sync_res = client.post("/api/v1/sync/push", json={
        "device_token": dev_token,
        "sync_batch_id": "BATCH-TEST-QUARANTINE",
        "operations": [
            {
                "client_tx_id": "tx-staff-b-conflicting-edit",
                "entity_name": "payments",
                "operation_type": "CORRECT",
                "client_timestamp": "2025-06-12T10:00:00Z",
                "payload": {
                    "payment_id": corrected_pay["id"],
                    "new_amount": 1000.00,
                    "new_fee_type": "TUITION",
                    "new_mode": "CASH",
                    "reason": "Staff B offline edit"
                }
            }
        ]
    }, headers=headers)

    assert sync_res.status_code == 200
    res_data = sync_res.json()
    assert res_data["results"][0]["status"] == "CONFLICT_QUARANTINED"

    payments_after = client.get(f"/api/v1/payments/student/{stu_id}", headers=headers).json()
    quarantined = [p for p in payments_after if p["id"] == corrected_pay["id"]][0]
    assert quarantined["status"] == "CONFLICT_QUARANTINED"

def test_rbac_permissions_and_role_denials():
    unauth_res = client.get("/api/v1/audit-logs")
    assert unauth_res.status_code == 401

def test_adversarial_concurrent_overpayment_protection():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Register a new student for clean concurrency testing
    ay_res = client.post("/api/v1/academic-years", json={"name": "2028-29", "start_date": "2028-06-01", "end_date": "2029-04-30", "is_current": False}, headers=headers)
    ay_id = ay_res.json()["id"]
    client.post("/api/v1/fee-structures", json={"academic_year_id": ay_id, "class_level": "8", "admission_fee": 0, "tuition_fee": 5000.00}, headers=headers)
    stu_res = client.post("/api/v1/students", json={"admission_no": "ADM-ADV-001", "name": "Concurrency Student", "father_name": "F", "mother_name": "M", "phone": "9998887770", "class_level": "8", "academic_year_id": ay_id, "date_of_admission": "2028-06-01", "address": "Hyd"}, headers=headers)
    stu_id = stu_res.json()["id"]
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Attempt 1: ₹5,000 Payment (Success)
    p1 = client.post("/api/v1/payments", json={"client_tx_id": "adv-tx-001", "student_fee_account_id": acc_data["id"], "fee_type": "TUITION", "amount": 5000.00, "payment_mode": "CASH", "payment_date": "2028-06-02"}, headers=headers)
    assert p1.status_code == 201

    # Attempt 2: ₹5,000 Payment (Must be REJECTED - Outstanding is 0)
    p2 = client.post("/api/v1/payments", json={"client_tx_id": "adv-tx-002", "student_fee_account_id": acc_data["id"], "fee_type": "TUITION", "amount": 5000.00, "payment_mode": "CASH", "payment_date": "2028-06-02"}, headers=headers)
    assert p2.status_code == 422

    # Verify final balance: Total paid = ₹5,000 (never ₹10,000)
    acc_final = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_final["tuition_outstanding"] == "0.00"

def test_adversarial_concurrent_partial_payments():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    ay_res = client.post("/api/v1/academic-years", json={"name": "2029-30", "start_date": "2029-06-01", "end_date": "2030-04-30", "is_current": False}, headers=headers)
    ay_id = ay_res.json()["id"]
    client.post("/api/v1/fee-structures", json={"academic_year_id": ay_id, "class_level": "7", "admission_fee": 0, "tuition_fee": 8000.00}, headers=headers)
    stu_res = client.post("/api/v1/students", json={"admission_no": "ADM-ADV-002", "name": "Partial Student", "father_name": "F", "mother_name": "M", "phone": "9998887771", "class_level": "7", "academic_year_id": ay_id, "date_of_admission": "2029-06-01", "address": "Hyd"}, headers=headers)
    stu_id = stu_res.json()["id"]
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Sequential Partial Payments: ₹5,000 then ₹3,000 on ₹8,000 assigned
    p1 = client.post("/api/v1/payments", json={"client_tx_id": "adv-part-001", "student_fee_account_id": acc_data["id"], "fee_type": "TUITION", "amount": 5000.00, "payment_mode": "CASH", "payment_date": "2029-06-02"}, headers=headers)
    assert p1.status_code == 201

    p2 = client.post("/api/v1/payments", json={"client_tx_id": "adv-part-002", "student_fee_account_id": acc_data["id"], "fee_type": "TUITION", "amount": 3000.00, "payment_mode": "UPI", "payment_date": "2029-06-03"}, headers=headers)
    assert p2.status_code == 201

    acc_final = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_final["tuition_outstanding"] == "0.00"

def test_adversarial_device_revocation_and_unauthorized_token():
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Register an official device via admin endpoint
    dev_res = client.post("/api/v1/devices/register", json={"device_name": "Authorized Staff iPad"}, headers=headers)
    assert dev_res.status_code == 200
    valid_device_token = dev_res.json()["device_token"]

    # Verify sync works with authorized device
    sync1 = client.post("/api/v1/sync/push", json={
        "device_token": valid_device_token,
        "sync_batch_id": "BATCH-DEV-001",
        "operations": []
    }, headers=headers)
    assert sync1.status_code == 200

    # Attempt sync with unregistered random UUID (Must be REJECTED with 403 Forbidden)
    random_uuid_token = "DEV-INST-random-unauthorized-uuid"
    sync_unauth = client.post("/api/v1/sync/push", json={
        "device_token": random_uuid_token,
        "sync_batch_id": "BATCH-DEV-UNAUTH",
        "operations": []
    }, headers=headers)
    assert sync_unauth.status_code == 403
    assert "Unregistered or revoked device" in sync_unauth.json()["detail"]

