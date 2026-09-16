import pytest
import concurrent.futures
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.config import settings

from app.db.session import SessionLocal, engine, Base
from app.db.init_db import init_db

def is_postgres():
    return settings.DATABASE_URL.startswith("postgresql")

@pytest.fixture
def client():
    app.dependency_overrides.clear()
    return TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def setup_db():
    app.dependency_overrides.clear()
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    init_db(db)
    yield
    db.close()

import uuid

@pytest.mark.skipif(not is_postgres(), reason="PostgreSQL database required for PG concurrency tests")
def test_pg_1_concurrent_full_overpayment(client):
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    uid = str(uuid.uuid4())[:6]
    ay_name = f"2031-{uid}"
    adm_no = f"ADM-PG1-{uid}"

    # Setup Academic Year & Fee Structure (Assigned Tuition = ₹5,000)
    ay_res = client.post("/api/v1/academic-years", json={"name": ay_name, "start_date": "2031-06-01", "end_date": "2032-04-30", "is_current": False}, headers=headers)
    ay_id = ay_res.json()["id"]
    client.post("/api/v1/fee-structures", json={"academic_year_id": ay_id, "class_level": "5", "admission_fee": 0, "tuition_fee": 5000.00}, headers=headers)
    
    # Create Student & Account
    stu_res = client.post("/api/v1/students", json={"admission_no": adm_no, "name": "PG1 Student", "father_name": "F", "mother_name": "M", "phone": "9990001111", "class_level": "5", "academic_year_id": ay_id, "date_of_admission": "2031-06-01", "address": "Hyd"}, headers=headers)
    stu_id = stu_res.json()["id"]
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Concurrent Requests: A = ₹5,000, B = ₹5,000
    def send_payment(tx_id):
        return client.post("/api/v1/payments", json={
            "client_tx_id": tx_id,
            "student_fee_account_id": acc_data["id"],
            "fee_type": "TUITION",
            "amount": 5000.00,
            "payment_mode": "CASH",
            "payment_date": "2031-06-02"
        }, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(send_payment, f"pg1-tx-A-{uid}")
        f2 = executor.submit(send_payment, f"pg1-tx-B-{uid}")
        res1 = f1.result()
        res2 = f2.result()

    statuses = [res1.status_code, res2.status_code]
    assert 201 in statuses, "At least one payment must succeed"
    assert 422 in statuses or 500 in statuses, "The second concurrent payment must be rejected"

    # Verify directly from DB/API
    acc_final = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_final["tuition_outstanding"] == "0.00"

@pytest.mark.skipif(not is_postgres(), reason="PostgreSQL database required for PG concurrency tests")
def test_pg_2_concurrent_valid_partial_payments(client):
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    uid = str(uuid.uuid4())[:6]
    ay_name = f"2032-{uid}"
    adm_no = f"ADM-PG2-{uid}"

    # Setup Academic Year & Fee Structure (Assigned Tuition = ₹8,000)
    ay_res = client.post("/api/v1/academic-years", json={"name": ay_name, "start_date": "2032-06-01", "end_date": "2033-04-30", "is_current": False}, headers=headers)
    ay_id = ay_res.json()["id"]
    client.post("/api/v1/fee-structures", json={"academic_year_id": ay_id, "class_level": "6", "admission_fee": 0, "tuition_fee": 8000.00}, headers=headers)
    
    # Create Student & Account
    stu_res = client.post("/api/v1/students", json={"admission_no": adm_no, "name": "PG2 Student", "father_name": "F", "mother_name": "M", "phone": "9990002222", "class_level": "6", "academic_year_id": ay_id, "date_of_admission": "2032-06-01", "address": "Hyd"}, headers=headers)
    stu_id = stu_res.json()["id"]
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Concurrent Requests: A = ₹5,000, B = ₹3,000
    def send_payment(tx_id, amount):
        return client.post("/api/v1/payments", json={
            "client_tx_id": tx_id,
            "student_fee_account_id": acc_data["id"],
            "fee_type": "TUITION",
            "amount": amount,
            "payment_mode": "CASH",
            "payment_date": "2032-06-02"
        }, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(send_payment, f"pg2-tx-A-{uid}", 5000.00)
        f2 = executor.submit(send_payment, f"pg2-tx-B-{uid}", 3000.00)
        res1 = f1.result()
        res2 = f2.result()

    assert res1.status_code == 201
    assert res2.status_code == 201

    acc_final = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_final["tuition_outstanding"] == "0.00"

@pytest.mark.skipif(not is_postgres(), reason="PostgreSQL database required for PG concurrency tests")
def test_pg_3_concurrent_partial_overpayment(client):
    login_res = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ShikshaAdmin2026!SecureEnv"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    uid = str(uuid.uuid4())[:6]
    ay_name = f"2033-{uid}"
    adm_no = f"ADM-PG3-{uid}"

    # Setup Academic Year & Fee Structure (Assigned Tuition = ₹8,000)
    ay_res = client.post("/api/v1/academic-years", json={"name": ay_name, "start_date": "2033-06-01", "end_date": "2034-04-30", "is_current": False}, headers=headers)
    ay_id = ay_res.json()["id"]
    client.post("/api/v1/fee-structures", json={"academic_year_id": ay_id, "class_level": "9", "admission_fee": 0, "tuition_fee": 8000.00}, headers=headers)
    
    # Create Student & Account
    stu_res = client.post("/api/v1/students", json={"admission_no": adm_no, "name": "PG3 Student", "father_name": "F", "mother_name": "M", "phone": "9990003333", "class_level": "9", "academic_year_id": ay_id, "date_of_admission": "2033-06-01", "address": "Hyd"}, headers=headers)
    stu_id = stu_res.json()["id"]
    acc_data = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()

    # Concurrent Requests: A = ₹5,000, B = ₹5,000 (Sum = ₹10,000 > ₹8,000)
    def send_payment(tx_id):
        return client.post("/api/v1/payments", json={
            "client_tx_id": tx_id,
            "student_fee_account_id": acc_data["id"],
            "fee_type": "TUITION",
            "amount": 5000.00,
            "payment_mode": "CASH",
            "payment_date": "2033-06-02"
        }, headers=headers)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        f1 = executor.submit(send_payment, f"pg3-tx-A-{uid}")
        f2 = executor.submit(send_payment, f"pg3-tx-B-{uid}")
        res1 = f1.result()
        res2 = f2.result()

    statuses = [res1.status_code, res2.status_code]
    assert 201 in statuses, "One payment must succeed"
    assert 422 in statuses or 500 in statuses, "One payment must be rejected"

    acc_final = client.get(f"/api/v1/student-fees/{stu_id}", headers=headers).json()
    assert acc_final["tuition_outstanding"] == "3000.00"
