# System Architecture & Technical Design: Shiksha Academy

**Application:** Shiksha Academy — Offline-First Tuition Academy Administration & Fee Management System  
**Version:** 1.0 (Production Technical Specification)  
**Author:** Senior Software Architect  

---

## Executive Summary & Architectural Vision

Shiksha Academy requires a robust, high-reliability, offline-first tuition management platform designed for up to 500 active students and multiple administrative staff members. Because staff members frequently operate in environments with unstable or zero internet connectivity, the system's core design prioritizes **local-first data availability, financial ledger immutability, idempotent synchronizations, and deterministic calculations**.

This document outlines the complete technical blueprint required before any code execution begins.

---

## 1. System Architecture

### 1.1 End-to-End Data Flow

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|                                                                                   |
|  +------------------------+        +-------------------------------------------+  |
|  |   React PWA Interface  | <----> |  Local DB (Dexie.js / IndexedDB)          |  |
|  |   (UI / i18n / Views)  |        |  (Students, Accounts, Payments, Cache)    |  |
|  +------------------------+        +-------------------------------------------+  |
|               |                                         ^                         |
|               v                                         |                         |
|  +------------------------+                             |                         |
|  |  Offline Outbox Queue  | ----------------------------+                         |
|  |  (Client Tx Items)     |                                                       |
|  +------------------------+                                                       |
|               |                                                                   |
|               v                                                                   |
|  +------------------------+                                                       |
|  |     Sync Engine        |                                                       |
|  | (Background Worker)    |                                                       |
|  +------------------------+                                                       |
+---------------+-------------------------------------------------------------------+
                | (HTTPS / REST API / TLS 1.3)
                v
+-----------------------------------------------------------------------------------+
|                                  SERVER LAYER                                     |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                        FastAPI Gateway / REST API                           |  |
|  |         (JWT Auth, RBAC Middleware, Pydantic Schema Validation)             |  |
|  +-----------------------------------------------------------------------------+  |
|                                       |                                           |
|                                       v                                           |
|  +-----------------------------------------------------------------------------+  |
|  |                        Sync Engine & Business Logic                         |  |
|  |    (Idempotency Filter, Conflict Resolver, Ledger Event Engine, Audit)     |  |
|  +-----------------------------------------------------------------------------+  |
|                                       |                                           |
|                                       v                                           |
|  +-----------------------------------------------------------------------------+  |
|  |                     PostgreSQL Production Database                          |  |
|  |           (ACID Transactions, Foreign Keys, JSONB Audit, Triggers)          |  |
|  +-----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

### 1.2 Detailed Component Blueprint

1. **Frontend (React PWA):**
   - Built with React 18, TypeScript, and Vite.
   - Utilizes Service Workers (via Workbox) to cache application shell, static assets, and client bundles for 100% offline availability.
2. **Local Database (Dexie.js over IndexedDB):**
   - Serves as the primary data store for the client application.
   - Stores locally synchronized read-models (Students, Fee Accounts, Classes, Academic Years) and payment history.
   - Provides instantaneous UI rendering (< 16ms response) without network roundtrips.
3. **Offline Outbox Queue:**
   - Persistent queue in IndexedDB storing mutating actions (e.g., `CREATE_PAYMENT`, `EDIT_PAYMENT`, `UPDATE_STUDENT`).
   - Every mutation is assigned a globally unique Client Transaction ID (`client_tx_id` UUIDv4) at the moment of user entry.
4. **Client Sync Engine:**
   - Runs in a Web Worker / background loop.
   - Listens for browser `online` events and periodic timers.
   - Batch pushes queued transactions to `/api/v1/sync/push` using exponential backoff and pull updates from `/api/v1/sync/pull`.
5. **API Gateway (FastAPI):**
   - Python-based asynchronous REST API framework.
   - Enforces JWT session validation, fine-grained RBAC permission checks, request rate-limiting, and schema validation.
6. **Backend Core Engine:**
   - Handles idempotent processing of push batches, dynamic balance calculation engine, payment correction history retention, and audit logging.
7. **PostgreSQL Database:**
   - Authoritative central relational storage with strong ACID constraints.
   - Enforces unique index rules, relational keys, soft deletion, and transaction immutability.

---

## 2. Database Design

### 2.1 Complete Relational Schema (PostgreSQL & IndexedDB Mirror)

#### 1. `users`
*Purpose:* Stores administrative staff credentials, profile metadata, and system access status.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Unique user identifier |
| `username` | VARCHAR(50) | No | UNIQUE | UQ_users_username | Login identifier |
| `email` | VARCHAR(255) | No | UNIQUE | UQ_users_email | Email address |
| `password_hash` | VARCHAR(255) | No | None | None | Argon2id password hash |
| `full_name` | VARCHAR(100) | No | None | None | Display name of staff |
| `is_active` | BOOLEAN | No | Default TRUE | IDX_users_active | Account status flag |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Record creation time |
| `updated_at` | TIMESTAMPTZ | No | Default NOW() | None | Record update time |

#### 2. `roles`
*Purpose:* Defines configurable staff role categories (e.g., Super Admin, Fee Manager, Cashier).

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Unique role identifier |
| `name` | VARCHAR(50) | No | UNIQUE | UQ_roles_name | Role identifier name |
| `description` | TEXT | Yes | None | None | Detailed role explanation |
| `is_system` | BOOLEAN | No | Default FALSE | None | Protects core system roles |

#### 3. `permissions`
*Purpose:* Atomically granular access permissions available in the system.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Unique permission ID |
| `code` | VARCHAR(100) | No | UNIQUE | UQ_perm_code | E.g., `payment:create` |
| `module` | VARCHAR(50) | No | None | IDX_perm_module | Module group name |
| `description` | TEXT | Yes | None | None | Human readable capability |

#### 4. `user_roles`
*Purpose:* Junction table mapping users to roles.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | UUID | No | FK -> `users.id` | Composite PK | User assignment |
| `role_id` | UUID | No | FK -> `roles.id` | Composite PK | Role assigned |

#### 5. `role_permissions`
*Purpose:* Junction table mapping permissions to roles.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `role_id` | UUID | No | FK -> `roles.id` | Composite PK | Role entity |
| `permission_id` | UUID | No | FK -> `permissions.id` | Composite PK | Assigned permission |

#### 6. `academic_years`
*Purpose:* Manages academy operational sessions (e.g., 2025–26).

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Unique academic year ID |
| `name` | VARCHAR(20) | No | UNIQUE | UQ_ay_name | E.g. "2025-26" |
| `start_date` | DATE | No | None | None | Session start date |
| `end_date` | DATE | No | None | None | Session end date |
| `is_current` | BOOLEAN | No | Default FALSE | IDX_ay_current | Active year flag |

#### 7. `students`
*Purpose:* Central student master record directory. Supports soft deactivation.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | System student ID |
| `admission_no` | VARCHAR(30) | No | UNIQUE | UQ_students_adm_no | Academy admission number |
| `name` | VARCHAR(100) | No | None | IDX_students_name | Student full name |
| `father_name` | VARCHAR(100) | No | None | None | Father's name |
| `mother_name` | VARCHAR(100) | No | None | None | Mother's name |
| `phone` | VARCHAR(15) | No | None | IDX_students_phone | Contact phone number |
| `class_level` | VARCHAR(20) | No | None | IDX_students_class | Class (e.g. "10") |
| `academic_year_id`| UUID | No | FK -> `academic_years.id` | IDX_students_ay | Enrolled academic year |
| `date_of_admission`| DATE | No | None | None | Admission date |
| `address` | TEXT | No | None | None | Residential address |
| `status` | VARCHAR(20) | No | Default 'ACTIVE' | IDX_students_status | ACTIVE/COMPLETED/TRANSFERRED/DROPPED/INACTIVE |
| `deleted_at` | TIMESTAMPTZ | Yes | Default NULL | None | Soft delete timestamp |
| `version` | INT | No | Default 1 | None | Optimistic locking version |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Creation time |
| `updated_at` | TIMESTAMPTZ | No | Default NOW() | None | Last update time |

#### 8. `fee_structures`
*Purpose:* Global class-wise fee template master per academic year.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Structure ID |
| `academic_year_id`| UUID | No | FK -> `academic_years.id` | UQ_fee_struct | Associated year |
| `class_level` | VARCHAR(20) | No | None | UQ_fee_struct | Class level |
| `admission_fee` | NUMERIC(10,2)| No | CHECK >= 0 | None | Class base admission fee |
| `tuition_fee` | NUMERIC(10,2)| No | CHECK >= 0 | None | Class base tuition fee |
| `version` | INT | No | Default 1 | UQ_fee_struct | Version number |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Template timestamp |

*Unique Constraint:* `UQ_fee_struct` on (`academic_year_id`, `class_level`, `version`).

#### 9. `student_fee_accounts`
*Purpose:* Individual student financial ledger header. Decouples assigned student fees from template changes.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Account ID |
| `student_id` | UUID | No | FK -> `students.id` | UQ_student_ay_account | Linked student |
| `academic_year_id`| UUID | No | FK -> `academic_years.id` | UQ_student_ay_account | Linked academic year |
| `assigned_admission_fee` | NUMERIC(10,2) | No | CHECK >= 0 | None | Assigned admission fee |
| `assigned_tuition_fee`   | NUMERIC(10,2) | No | CHECK >= 0 | None | Assigned tuition fee |
| `admission_fee_discount` | NUMERIC(10,2) | No | Default 0.00 | None | Fee concession |
| `tuition_fee_discount`   | NUMERIC(10,2) | No | Default 0.00 | None | Fee concession |
| `notes` | TEXT | Yes | None | None | Financial account notes |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Account creation date |
| `updated_at` | TIMESTAMPTZ | No | Default NOW() | None | Last update date |

*Unique Constraint:* `UQ_student_ay_account` on (`student_id`, `academic_year_id`).

#### 10. `payments`
*Purpose:* Immutably records every individual cash/UPI fee payment transaction.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | System Payment ID |
| `client_tx_id` | UUID | No | UNIQUE | UQ_payments_client_tx | Offline client transaction UUID |
| `student_fee_account_id` | UUID | No | FK -> `student_fee_accounts.id` | IDX_payments_account | Linked fee account |
| `fee_type` | VARCHAR(20) | No | CHECK IN ('ADMISSION', 'TUITION') | IDX_payments_fee_type | Fee category |
| `amount` | NUMERIC(10,2)| No | CHECK > 0 | None | Received amount |
| `payment_mode` | VARCHAR(10) | No | CHECK IN ('CASH', 'UPI') | IDX_payments_mode | Cash or UPI |
| `upi_reference` | VARCHAR(100)| Yes | None | None | UPI Tx reference number |
| `payment_date` | DATE | No | None | IDX_payments_date | Date payment received |
| `notes` | TEXT | Yes | None | None | Optional payment note |
| `recorded_by_user_id` | UUID | No | FK -> `users.id` | IDX_payments_user | Recording staff ID |
| `device_id` | UUID | Yes | FK -> `devices.id` | None | Device used for recording |
| `status` | VARCHAR(20) | No | Default 'VALID' | IDX_payments_status | VALID / CORRECTED / VOIDED |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Recording timestamp |
| `updated_at` | TIMESTAMPTZ | No | Default NOW() | None | System timestamp |

#### 11. `payment_edit_history`
*Purpose:* Complete audit trail of payment corrections and edits.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Edit record ID |
| `payment_id` | UUID | No | FK -> `payments.id` | IDX_edit_payment_id | Target payment ID |
| `client_tx_id` | UUID | No | UNIQUE | UQ_payment_edit_client_tx | Idempotent edit transaction ID |
| `previous_amount` | NUMERIC(10,2)| No | None | None | Original amount before edit |
| `new_amount` | NUMERIC(10,2)| No | None | None | Corrected amount |
| `previous_fee_type` | VARCHAR(20) | No | None | None | Previous fee type |
| `new_fee_type` | VARCHAR(20) | No | None | None | New fee type |
| `previous_mode` | VARCHAR(10) | No | None | None | Previous mode |
| `new_mode` | VARCHAR(10) | No | None | None | New mode |
| `reason` | TEXT | No | None | None | Mandatory correction reason |
| `edited_by_user_id` | UUID | No | FK -> `users.id` | None | Staff making correction |
| `edited_at` | TIMESTAMPTZ | No | Default NOW() | None | Correction timestamp |

#### 12. `audit_logs`
*Purpose:* Immutable system audit log for security, configuration, and structural edits.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Audit log ID |
| `user_id` | UUID | Yes | FK -> `users.id` | IDX_audit_user | Responsible staff member |
| `device_id` | UUID | Yes | FK -> `devices.id` | None | Client device |
| `action` | VARCHAR(100) | No | None | IDX_audit_action | E.g. `STUDENT_UPDATED`, `FEE_CHANGED` |
| `entity_type` | VARCHAR(50) | No | None | IDX_audit_entity | Table or domain name |
| `entity_id` | UUID | No | None | None | Primary key of subject entity |
| `old_value` | JSONB | Yes | None | None | Snapshot before modification |
| `new_value` | JSONB | Yes | None | None | Snapshot after modification |
| `client_timestamp` | TIMESTAMPTZ | No | None | None | Time action occurred on device |
| `server_timestamp` | TIMESTAMPTZ | No | Default NOW() | IDX_audit_server_ts | Time action ingested by server |
| `ip_address` | VARCHAR(45) | Yes | None | None | Client network IP |

#### 13. `sync_operations`
*Purpose:* Server-side sync journal tracking every client transaction sync attempt.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | Sync operation log ID |
| `sync_batch_id` | UUID | No | None | IDX_sync_batch | Batch request container ID |
| `device_id` | UUID | No | FK -> `devices.id` | IDX_sync_device | Originating device |
| `client_tx_id` | UUID | No | UNIQUE | UQ_sync_client_tx | Idempotency transaction key |
| `entity_name` | VARCHAR(50) | No | None | None | Target entity |
| `operation_type` | VARCHAR(20) | No | CHECK IN ('CREATE','UPDATE','CORRECT') | None | Operation category |
| `status` | VARCHAR(20) | No | CHECK IN ('SUCCESS','DUPLICATE','REJECTED','CONFLICT') | IDX_sync_status | Result status |
| `payload` | JSONB | No | None | None | Exact JSON payload submitted |
| `error_message` | TEXT | Yes | None | None | Detail if rejected |
| `processed_at` | TIMESTAMPTZ | No | Default NOW() | None | System timestamp |

#### 14. `devices`
*Purpose:* Tracks registered staff devices authorized to perform offline synchronization.

| Column | Data Type | Nullable | Constraint | Indexes | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | UUID | No | Primary Key | PK | System device ID |
| `device_identifier`| VARCHAR(255)| No | UNIQUE | UQ_device_ident | Browser fingerprint UUID |
| `device_name` | VARCHAR(100)| No | None | None | E.g. "FrontDesk-Tablet-01" |
| `registered_by_user_id`| UUID | No | FK -> `users.id` | None | User registering device |
| `last_sync_at` | TIMESTAMPTZ | Yes | None | None | Last successful sync |
| `is_active` | BOOLEAN | No | Default TRUE | None | Active authorization flag |
| `created_at` | TIMESTAMPTZ | No | Default NOW() | None | Registration timestamp |

---

## 3. Financial Model

### 3.1 Mathematical Definitions & Operational Equations

Financial accounting in Shiksha Academy is based on an **event-sourced transaction stream** rather than mutable scalar totals.

#### Fee Category Isolation
Admission Fee and Tuition Fee are strictly segregated accounting heads. Payments recorded against Admission Fee NEVER reduce Tuition Fee balances and vice versa.

$$\text{Total Fee Head Payable} = \text{Assigned Fee} - \text{Granted Discount}$$

$$\text{Net Admission Payable} = \text{assigned\_admission\_fee} - \text{admission\_fee\_discount}$$

$$\text{Net Tuition Payable} = \text{assigned\_tuition\_fee} - \text{tuition\_fee\_discount}$$

#### Total Received Calculation
Only payments with `status = 'VALID'` are summed toward a student's paid balance. Corrected payments reflect their updated amount; voided payments contribute 0.

$$\text{Admission Paid} = \sum_{\text{p} \in \text{Payments}_{\text{VALID, ADMISSION}}} \text{p.amount}$$

$$\text{Tuition Paid} = \sum_{\text{p} \in \text{Payments}_{\text{VALID, TUITION}}} \text{p.amount}$$

#### Dynamic Outstanding Balance Formula

$$\text{Admission Outstanding} = \max(0, \text{Net Admission Payable} - \text{Admission Paid})$$

$$\text{Tuition Outstanding} = \max(0, \text{Net Tuition Payable} - \text{Tuition Paid})$$

$$\text{Total Student Balance} = \text{Admission Outstanding} + \text{Tuition Outstanding}$$

### 3.2 Historical Fee Protection Architecture

When an Administrator updates a class fee structure (e.g., Class 10 Tuition Fee increases from ₹25,000 to ₹28,000):
1. A NEW record is inserted into `fee_structures` with an incremented `version` number (or effective timestamp).
2. Pre-existing records in `student_fee_accounts` ARE NOT MODIFIED. Historical assigned fees remain frozen at their assigned values.
3. New students admitted after the fee update inherit the latest active version of `fee_structures`.

---

## 4. Offline Synchronization Design

### 4.1 Deep-Dive Sync Scenarios & Resolution Policies

```
+-----------------------------------------------------------------------------------+
|                        OFFLINE SYNCHRONIZATION MATRIX                             |
+--------------------------+--------------------------------+-----------------------+
| Scenario                 | Root Cause                     | Resolution Mechanism  |
+--------------------------+--------------------------------+-----------------------+
| 1. Parallel Payments     | Staff A & B offline record     | Commutative Additive  |
|    for same student      | payments for Student S1        | Transaction Ledger    |
+--------------------------+--------------------------------+-----------------------+
| 2. Re-sent Network Batch | Network drop causes client retry| `client_tx_id`        |
|                          | of already received sync       | Idempotency Dedupe    |
+--------------------------+--------------------------------+-----------------------+
| 3. Concurrent Master     | Staff A edits phone;           | Field-Level Delta     |
|    Data Edit             | Staff B edits address          | Version Vector Merge  |
+--------------------------+--------------------------------+-----------------------+
| 4. Offline Payment Edit  | Payment P1 edited offline while| Immutable Correction  |
|                          | P1 exists on server            | Log & Event Chain     |
+--------------------------+--------------------------------+-----------------------+
| 5. Constraint Rejection  | Payment recorded for soft-     | Sync Outbox Quarantine|
|                          | deactivated student            | & User Alert Modal    |
+--------------------------+--------------------------------+-----------------------+
```

#### Detailed Resolution Specifications:

1. **Staff A and Staff B offline record payments for the same student:**
   - *Mechanism:* Payments are modeled as append-only event transactions with distinct `client_tx_id`s (`TX-A1` and `TX-B1`).
   - *Result:* When Staff A and Staff B reconnect, both transactions push successfully. The server appends both records into `payments`. The total balance recalculates deterministically as $\text{Total Paid} = \text{Amount}_A + \text{Amount}_B$. Zero conflicts, zero lost payments.

2. **Accidental duplicate synchronization (Network Retry / Double Ingestion):**
   - *Mechanism:* Client sends batch containing `client_tx_id = UUID-100`. The server processes it, but HTTP response drops. Client retries sending `UUID-100`.
   - *Result:* Server checks `payments.client_tx_id` and `sync_operations.client_tx_id`. Detecting `UUID-100` already exists, the server short-circuits processing, marks status as `DUPLICATE`, skips DB re-insertion, and returns HTTP 200/208 with the original success acknowledgment.

3. **Two staff members edit the same student offline:**
   - *Mechanism:* Staff A updates `phone = "9876543210"`. Staff B updates `address = "New Street"`.
   - *Result:* Field-level differential sync. When syncing, payload includes updated fields and base `version`. Server checks diff: since changed attributes do not overlap, server merges both edits into student record and increments `version`. If attributes conflict (e.g. different phones), the edit with the latest `client_timestamp` wins, and an audit record logs the overwritten value.

4. **Payment edited while offline:**
   - *Mechanism:* Staff A enters payment $P_1$ (₹5,000) at 10:00 AM offline. At 10:15 AM offline, Staff A corrects $P_1$ to ₹500.
   - *Result:* Local queue maintains $P_1$ creation transaction (`TX-CREATE`) and $P_1$ edit transaction (`TX-EDIT`). On sync, server processes `TX-CREATE` first, creating the payment row, then processes `TX-EDIT`, updating `payments.amount = 500` and inserting a detailed record into `payment_edit_history`.

5. **Server rejects an operation (Hard Validation Failure):**
   - *Mechanism:* Payment submitted for a student account that was deactivated or flagged for audit.
   - *Result:* Server marks transaction status `REJECTED` in `sync_operations` and responds with specific error code. Client sync engine flags the outbox item as `FAILED_NEEDS_ATTENTION`, notifies user via Sync Center UI badge, and stops auto-retry for that single item without blocking unrelated queued items.

---

## 5. Role-Based Access Control (RBAC)

### 5.1 Roles Definition

1. **Super Administrator:** Complete system authority across all modules, configurations, staff management, audit logs, and fee templates.
2. **Administrator / Fee Manager:** Authority over student records, fee configuration, payment entry, payment corrections, and reports. Cannot delete staff or modify system security settings.
3. **Staff / Cashier:** Restricted operational access. Can search students, view balance summaries, and record payments. Cannot edit historical payments or alter fee structures.

### 5.2 Granular Permissions Matrix

| Permission Code | Permission Description | Super Admin | Fee Manager | Staff / Cashier |
| :--- | :--- | :---: | :---: | :---: |
| `student:read` | Search & view student profile | Yes | Yes | Yes |
| `student:create` | Register new student | Yes | Yes | No |
| `student:update` | Edit student demographic details | Yes | Yes | No |
| `student:status` | Change student status (Deactivate) | Yes | Yes | No |
| `fee_struct:manage` | Create & update class fee templates | Yes | Yes | No |
| `student_fee:assign`| Override individual student fee/discount | Yes | Yes | No |
| `payment:create` | Record new fee payment | Yes | Yes | Yes |
| `payment:edit` | Correct an existing payment entry | Yes | Yes | No |
| `payment:history` | View complete payment history | Yes | Yes | Yes |
| `reports:view` | Access financial analytics & dashboards | Yes | Yes | Restricted |
| `reports:export` | Generate & download PDF reports | Yes | Yes | Restricted |
| `staff:manage` | Add, edit, or disable staff accounts | Yes | No | No |
| `audit:view` | Inspect system audit logs | Yes | No | No |
| `system:sync` | Execute offline sync operations | Yes | Yes | Yes |

---

## 6. API Design

All endpoints follow standard REST conventions under `/api/v1`. Authenticated with HTTP Bearer JWT headers.

### 6.1 Endpoint Specification

```
====================================================================================
MODULE: AUTHENTICATION & USER MANAGEMENT
====================================================================================
POST   /api/v1/auth/login             -> Login credentials; returns JWT access/refresh tokens
POST   /api/v1/auth/refresh           -> Exchange refresh token for new access token
GET    /api/v1/auth/me                -> Get currently logged-in user profile & permissions
POST   /api/v1/auth/logout            -> Invalidate session refresh tokens

====================================================================================
MODULE: STUDENT MASTER
====================================================================================
GET    /api/v1/students               -> List/search students (query: name, adm_no, phone, class)
POST   /api/v1/students               -> Create new student & auto-initialize fee account
GET    /api/v1/students/{id}          -> Get student profile details
PUT    /api/v1/students/{id}          -> Update student details
PATCH  /api/v1/students/{id}/status   -> Deactivate/change student status

====================================================================================
MODULE: ACADEMIC YEARS & FEE STRUCTURES
====================================================================================
GET    /api/v1/academic-years         -> List all academic years
POST   /api/v1/academic-years         -> Create new academic year
GET    /api/v1/fee-structures         -> Get class-wise fee templates for academic year
POST   /api/v1/fee-structures         -> Create or increment version of class fee template
GET    /api/v1/student-fees/{student_id} -> Get assigned fee account & calculated balances

====================================================================================
MODULE: PAYMENTS & LEDGER
====================================================================================
POST   /api/v1/payments               -> Record payment (Idempotent via client_tx_id header/body)
PUT    /api/v1/payments/{id}/correct  -> Correct payment entry (Requires reason & permission)
GET    /api/v1/payments/student/{id}  -> Get financial history & payment ledger for student

====================================================================================
MODULE: OFFLINE SYNCHRONIZATION
====================================================================================
POST   /api/v1/sync/push              -> Batch ingest offline client transaction items
POST   /api/v1/sync/pull              -> Pull incremental changes since last_sync_timestamp

====================================================================================
MODULE: REPORTS & PDF GENERATION
====================================================================================
GET    /api/v1/reports/daily          -> Get daily collection summary (Cash/UPI metrics)
GET    /api/v1/reports/monthly        -> Get monthly collection & balance analysis
GET    /api/v1/reports/academic-year  -> Get academic-year macro report
POST   /api/v1/reports/export-pdf     -> Stream compiled PDF document based on report filter

====================================================================================
MODULE: AUDIT & STAFF ADMINISTRATION
====================================================================================
GET    /api/v1/staff                  -> Manage staff accounts & role assignments
GET    /api/v1/audit-logs             -> Query system audit trail
```

---

## 7. Frontend Architecture

### 7.1 Architecture Stack & Component Layout

- **Framework:** React 18 with TypeScript.
- **Build Tooling:** Vite + Workbox PWA Plugin.
- **Local Storage Engine:** Dexie.js (IndexedDB wrapper) with live queries (`useLiveQuery`).
- **State Management:**
  - `TanStack Query (React Query)` for remote API data sync and caching.
  - `Zustand` for UI state, current locale, active offline status, and sync queue status.
- **Routing:** React Router v6 with Auth & RBAC route guards.

```
src/
├── app/                  # Application router & context providers
├── assets/               # Branding, logos, static images
├── components/           # Reusable UI components
│   ├── ui/               # Primary primitives (Buttons, Inputs, Modals, Badges)
│   ├── layout/           # Navigation Header, Sidebar, Container
│   ├── sync/             # Offline Sync Banner, Outbox Monitor Modal
│   └── feedback/         # Toast alerts, Skeleton loaders, Error boundaries
├── db/                   # Local IndexedDB Schema & Dexie Instance
│   ├── schema.ts         # Local database tables definitions
│   └── outbox.ts         # Offline outbox queue manager
├── features/             # Domain feature modules
│   ├── auth/             # Login forms, token storage, RBAC hooks
│   ├── students/         # Student list, search bar, profile view, add/edit modal
│   ├── payments/         # Payment recording drawer, payment history, correction dialog
│   ├── fees/             # Class fee template manager, discount assignment
│   ├── dashboard/        # Summary metrics cards, collection charts
│   ├── reports/          # Report filters, data tables, PDF previewer
│   └── audit/            # Audit log viewer
├── hooks/                # Global React hooks (useOnlineStatus, useI18n, useSync)
├── i18n/                 # Multilingual dictionaries (en, te, hi)
├── services/             # Axios API client, Sync Engine background worker
└── utils/                # Currency formatters, date utilities, validators
```

### 7.2 Sync UI & Loading/Error Strategy

1. **Status Banner:** Persistent top navigation banner indicating system status:
   - `Online (Synced)` [Green Indicator]
   - `Offline Mode (Changes queued locally)` [Amber Indicator]
   - `Syncing 4 items...` [Blue Spinner]
   - `Sync Alert: 1 item requires attention` [Red Indicator]
2. **Optimistic Updates:** UI immediately updates local IndexedDB state upon user action (e.g. payment entry), providing instant user feedback. Outbox transaction queued in background.
3. **Graceful Fallbacks:** Empty states, offline-disabled action buttons (with clear tooltips), skeleton placeholders during initial load.

---

## 8. Security Architecture

1. **Password Hashing:**
   - Server-side password verification utilizing **Argon2id** (m=65536, t=3, p=4) or **Bcrypt** (work factor 12).
2. **Authentication & Session Tokens:**
   - Short-lived Access JWTs (15-minute validity) passed via `Authorization: Bearer` header.
   - Long-lived Refresh Tokens (7-day validity) stored in `HttpOnly`, `SameSite=Strict`, `Secure` cookies.
3. **Authorization & RBAC Enforcement:**
   - FastAPI dependencies enforce role permissions on every route (e.g., `@require_permission("payment:edit")`).
4. **Data Integrity & Protection:**
   - All client-server transmission over TLS 1.3.
   - SQL Injection prevention using SQLAlchemy ORM parameterized queries.
   - XSS protection via React DOM escaping and Strict Content Security Policy (CSP) headers.
5. **Offline Storage Security:**
   - Sensitive local data (e.g. session metadata) in Web Storage encrypted using AES-GCM via browser Web Crypto API.
   - Session data automatically purged upon explicit user logout.

---

## 9. PDF Reporting Architecture

### 9.1 PDF Generation Pipeline (Dual-Mode Capabilities)

To satisfy the **100% offline-first** requirement, PDF generation is implemented via a **Hybrid Strategy**:

```
+-----------------------------------------------------------------------------------+
|                            HYBRID PDF GENERATION PIPELINE                         |
+-----------------------------------------------------------------------------------+
                                  |
               Is Connectivity Available?
              /                          \
            YES                           NO
            /                              \
           v                                v
+-----------------------+        +-----------------------+
| Backend Service       |        | Client-Side Renderer  |
| (WeasyPrint / HTML)   |        | (@react-pdf/renderer) |
+-----------------------+        +-----------------------+
           \                                /
            v                              v
+-----------------------------------------------------------------------------------+
|                        Compiled Standard PDF Document                             |
|    (Shiksha Academy Header, Watermark, Formatted Tables, Summary Totals)         |
+-----------------------------------------------------------------------------------+
```

1. **Online Mode (Server-side rendering):**
   - High-fidelity PDF generation using **WeasyPrint** / **ReportLab** in FastAPI backend.
   - Jinja2 templates render HTML/CSS reports convert to crisp, vector PDF streams returned as downloadable attachments.
2. **Offline Mode (Client-side rendering):**
   - Client uses `@react-pdf/renderer` or `jspdf` + `jspdf-autotable` directly in browser.
   - Pulls data directly from local IndexedDB database, compiles PDF document in client memory, and triggers instant local download without backend dependence.

---

## 10. Multilingual Architecture (i18n)

### 10.1 Internationalization System Specification

The application UI supports **English**, **Telugu (తెలుగు)**, and **Hindi (हिंदी)**.

#### Technical Core Rules:
1. **Canonical Database Records:** Database entity values (e.g., payment modes `'CASH'`, `'UPI'`, status `'ACTIVE'`) are strictly stored as canonical English codes in both PostgreSQL and IndexedDB.
2. **Translation Layer:** Frontend uses `react-i18next`. Translation keys are mapped via localized JSON bundles (`locales/en.json`, `locales/te.json`, `locales/hi.json`).
3. **Dynamic Currency & Date Formatting:** Currency amounts formatted using `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })` displaying standard ₹ notation across all languages. Dates formatted according to active locale context.

#### Translation Key Sample Matrix:

| Key | English | Telugu (తెలుగు) | Hindi (हिंदी) |
| :--- | :--- | :--- | :--- |
| `nav.dashboard` | Dashboard | డాష్‌బోర్డ్ | डैशबोर्ड |
| `nav.students` | Students | విద్యార్థులు | छात्र |
| `nav.payments` | Payments | చెల్లింపులు | भुगतान |
| `nav.reports` | Reports | నివేదికలు | रिपोर्ट |
| `fee.admission` | Admission Fee | ప్రవేశ రుసుము | प्रवेश शुल्क |
| `fee.tuition` | Tuition Fee | బోధనా రుసుము | शिक्षण शुल्क |
| `btn.record_payment` | Record Payment | చెల్లింపును నమోదు చేయండి | भुगतान दर्ज करें |

---

## 11. AI Boundary & Data Isolation Architecture

### 11.1 Structural Isolation Rules & Security Boundary

```
+-----------------------------------------------------------------------------------+
|                         SYSTEM DATA BOUNDARY ARCHITECTURE                         |
+-----------------------------------------------------------------------------------+

     AUTHORITATIVE WRITE DOMAIN                  READ-ONLY AI ANALYTICS DOMAIN
+----------------------------------+          +----------------------------------+
|  Deterministic Financial Engine  |          |   AI Analytics & Insights Module |
|  - PostgreSQL Financial Ledger   |          |   - Read-Only SQL View / Replica |
|  - Idempotent Sync Processor     | -------> |   - Natural Language Query Agent |
|  - Strict Audit Log Pipeline     |  (READ   |   - Summary Insights Visualizer  |
|  - Authoritative Balance Logic   |   ONLY)  |                                  |
+----------------------------------+          +----------------------------------+
                 ^                                             |
                 | (MUST NEVER WRITE / ALTER)                  v
                 +---------------------------------------------X  CANNOT WRITE/EDIT
```

### 11.2 Strict Technical AI Principles:
1. **Zero Write Permission:** The AI module is provided with a **Read-Only Database Connection String / Scoped Analytics API Endpoint**. The database user assigned to the AI service has ZERO `INSERT`, `UPDATE`, or `DELETE` privileges.
2. **Non-Authoritative Operations:** Financial balances, outstanding fee calculations, fee collection reporting, payment edits, and payment recording logic are executed **100% by deterministic code** (Python/TypeScript math functions). The AI engine is NEVER called to calculate balances or verify financial validity.
3. **Optional Modular Attachment:** The system remains completely operational if the AI engine is disabled, uninstalled, or turned off.

---

## 12. Project Folder Structure

```
shiksha-academy/
├── README.md
├── docker-compose.yml
├── .gitignore
│
├── apps/
│   ├── api/                           # FastAPI Backend Application
│   │   ├── Dockerfile
│   │   ├── pyproject.toml
│   │   ├── alembic/                   # Database Migration Scripts
│   │   │   └── versions/
│   │   └── app/
│   │       ├── main.py                # FastAPI Application Entrypoint
│   │       ├── config.py              # Environment Configuration
│   │       ├── db/                    # SQLAlchemy Session Setup & Base Models
│   │       ├── models/                # SQLAlchemy Relational ORM Models
│   │       ├── schemas/               # Pydantic Request/Response Schemas
│   │       ├── api/                   # REST API Routers
│   │       │   ├── v1/
│   │       │   │   ├── auth.py
│   │       │   │   ├── students.py
│   │       │   │   ├── fee_structures.py
│   │       │   │   ├── payments.py
│   │       │   │   ├── sync.py
│   │       │   │   ├── reports.py
│   │       │   │   └── audit.py
│   │       ├── core/                  # Security, Auth, RBAC Middleware
│   │       ├── services/              # Business Logic & Financial Ledger Engine
│   │       └── reports/               # PDF Generation Templates (Jinja2/WeasyPrint)
│   │
│   └── web/                           # React Vite PWA Frontend
│       ├── Dockerfile
│       ├── package.json
│       ├── vite.config.ts
│       ├── index.html
│       ├── public/                    # Service Worker & PWA Manifest
│       └── src/                       # React TypeScript Source Code
│           ├── main.tsx
│           ├── App.tsx
│           ├── app/
│           ├── components/
│           ├── db/                    # IndexedDB / Dexie Setup & Outbox Queue
│           ├── features/
│           ├── hooks/
│           ├── i18n/
│           ├── services/
│           └── utils/
│
└── shared/                            # Shared Data Contracts & Schemas
    └── contracts/                     # JSON Schemas for API & Sync Payloads
```

---

## 13. Implementation Phases

```
+-----------------------------------------------------------------------------------+
|                            DEVELOPMENT ROADMAP PHASES                             |
+-----------------------------------------------------------------------------------+
|  Phase 1: Architecture Core, Foundation & Auth (DB Models, JWT, RBAC)             |
|  Phase 2: Master Data Management (Students, Classes, Academic Years, Fee Config)  |
|  Phase 3: Financial Engine & Payment Transaction Layer (Cash/UPI Ledger, Edits)   |
|  Phase 4: Offline Outbox Queue & Synchronization Engine (Idempotent Sync Push)    |
|  Phase 5: Financial Reporting, Dashboards & Dual PDF Generation Engine            |
|  Phase 6: Multilingual i18n, UI Polish, Audit Security & End-to-End Verification   |
+-----------------------------------------------------------------------------------+
```

### Phase 1: Architecture Core, Foundation & Authentication
- **Objective:** Establish monorepo structure, PostgreSQL database schemas with Alembic migrations, FastAPI core, React SPA shell, and RBAC authentication system.
- **Modules Involved:** `apps/api/app/db/`, `models/`, `core/`, `apps/web/src/db/`, `features/auth/`.
- **Database Changes:** Tables created: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `devices`, `audit_logs`.
- **APIs Implemented:** `POST /auth/login`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/logout`.
- **Tests:** Password hashing unit tests, JWT token lifespan tests, RBAC route permission guards tests.
- **Acceptance Criteria:** Users can authenticate securely, receive scoped permissions, and access guarded endpoints based on assigned roles.

### Phase 2: Master Data & Fee Administration
- **Objective:** Build student registration, academic year management, class fee templates, and individual student fee account initializations.
- **Modules Involved:** `students/`, `fees/`, `academic-years/` (Backend & Frontend).
- **Database Changes:** Tables created: `academic_years`, `students`, `fee_structures`, `student_fee_accounts`.
- **APIs Implemented:** `GET/POST /students`, `PUT /students/{id}`, `PATCH /students/{id}/status`, `GET/POST /fee-structures`, `GET /student-fees/{id}`.
- **Tests:** Student admission number uniqueness test, fee structure versioning test, historical assignment protection test.
- **Acceptance Criteria:** Admin can register students, set class fee templates, and modify individual student discounts without affecting global historical fee records.

### Phase 3: Transactional Financial Engine & Payment Recording
- **Objective:** Implement append-only payment transaction engine, balance calculation logic, and payment correction auditing.
- **Modules Involved:** `payments/`, `services/financial_ledger.py`, `payment_edit_history`.
- **Database Changes:** Tables created: `payments`, `payment_edit_history`.
- **APIs Implemented:** `POST /payments`, `PUT /payments/{id}/correct`, `GET /payments/student/{id}`.
- **Tests:** Outstanding balance formula test ($\text{Fee} - \text{Payments}$), payment correction audit trail test, zero/negative payment validation test.
- **Acceptance Criteria:** Staff can record Cash or UPI payments for Admission or Tuition fees; corrections update current balances while retaining immutable edit history.

### Phase 4: Offline Outbox Queue & Synchronization Engine
- **Objective:** Develop client-side Dexie IndexedDB outbox queue, background sync worker, and server-side idempotent push/pull engine.
- **Modules Involved:** `apps/web/src/db/outbox.ts`, `services/sync.ts`, `apps/api/app/api/v1/sync.py`, `services/sync_processor.py`.
- **Database Changes:** Tables created: `sync_operations`.
- **APIs Implemented:** `POST /api/v1/sync/push`, `POST /api/v1/sync/pull`.
- **Tests:** Offline payment creation & sync test, idempotent duplicate `client_tx_id` test, concurrent edit merge test.
- **Acceptance Criteria:** Staff can perform student search, balance viewing, and payment entries completely offline; when reconnected, changes sync seamlessly without duplicate records.

### Phase 5: Financial Reporting, Dashboards & Dual PDF Generation
- **Objective:** Construct daily, monthly, and academic-year analytics dashboards with online and offline PDF report export capabilities.
- **Modules Involved:** `features/dashboard/`, `features/reports/`, `apps/api/app/reports/`.
- **Database Changes:** None. Uses optimized analytical SQL queries & IndexedDB indices.
- **APIs Implemented:** `GET /reports/daily`, `GET /reports/monthly`, `GET /reports/academic-year`, `POST /reports/export-pdf`.
- **Tests:** Financial aggregation logic unit test, client-side offline PDF generation test, server-side PDF generation test.
- **Acceptance Criteria:** Dashboard displays accurate collection totals by Cash vs UPI; PDF reports compile and download correctly both online and offline.

### Phase 6: Multilingual i18n, UI Polish, Audit Security & System Hardening
- **Objective:** Integrate English, Telugu, and Hindi translations, finalize UI responsiveness, verify full audit trail, and complete security review.
- **Modules Involved:** `src/i18n/`, `components/ui/`, `features/audit/`.
- **Database Changes:** Final tuning of indexes.
- **APIs Implemented:** `GET /api/v1/audit-logs`, `GET /api/v1/staff`.
- **Tests:** Multilingual language switcher test, full end-to-end offline sync simulation, audit log verification test.
- **Acceptance Criteria:** UI toggles cleanly between English, Telugu, and Hindi; all critical actions generate structured audit entries; system meets all PRD requirements.

---

## ARCHITECTURAL DECISIONS REQUIRING APPROVAL

The following architectural decisions are presented for user review before proceeding to implementation code:

1. **Client-Side Storage Engine Selection:**
   - *Proposal:* Use **Dexie.js over IndexedDB**.
   - *Rationale:* Dexie provides a lightweight, highly reliable, promise-based API with native observable live queries (`useLiveQuery`), making offline database manipulation in React efficient and simple.

2. **Dual PDF Generation Strategy:**
   - *Proposal:* Implement **Client-Side PDF Generation (`@react-pdf/renderer` or `jspdf`)** as the primary offline report engine, supplemented by **Backend Server-Side Generation (WeasyPrint / Jinja2)** when online.
   - *Rationale:* Ensures staff can generate and print official PDF fee receipts and reports even during prolonged internet outages.

3. **Master Data Conflict Resolution Policy:**
   - *Proposal:* Implement **Field-Level Differential Delta Merging** with **Last-Write-Wins (Server/Client Timestamp)** for non-financial student demographic updates (e.g. phone number, address).
   - *Rationale:* Financial payments do not conflict because they are strictly additive event transactions. Student demographic edits rarely overlap, and field-level delta merging resolves non-overlapping edits automatically without prompt friction.

4. **Offline Local Encryption:**
   - *Proposal:* Sensitive offline operational cache stored in IndexedDB rely on browser origin isolation combined with WebCrypto AES-GCM encryption for stored user tokens.
   - *Rationale:* Provides optimal balance between high offline performance and local data privacy on shared academy devices.

5. **Technology Stack Confirmation:**
   - *Frontend:* React 18 + TypeScript + Vite + PWA (Workbox) + TailwindCSS / Vanilla CSS + Dexie.js + i18next.
   - *Backend:* Python 3.11 + FastAPI + Async SQLAlchemy 2.0 + Alembic + PostgreSQL.
   - *Rationale:* High performance, robust type safety, rapid API development, and reliable ACID database guarantees for financial data.
