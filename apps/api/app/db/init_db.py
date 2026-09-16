from sqlalchemy.orm import Session
from app.db.session import engine, Base
from app.models.models import User, Role, Permission, UserRole, RolePermission
from app.core.security import get_password_hash

PERMISSIONS = [
    # Student Master
    ("student:read", "student", "Search & view student profiles"),
    ("student:create", "student", "Register new student"),
    ("student:update", "student", "Edit student demographic information"),
    ("student:status", "student", "Deactivate/change student status"),
    # Fee Management
    ("fee_struct:manage", "fee", "Create/update class fee templates"),
    ("student_fee:assign", "fee", "Override individual student fee account"),
    # Payments
    ("payment:create", "payment", "Record new fee payment (Cash/UPI)"),
    ("payment:correct", "payment", "Correct an existing payment entry"),
    ("payment:history", "payment", "View student payment history"),
    # Reports
    ("reports:view", "reports", "Access financial dashboards & reports"),
    ("reports:export", "reports", "Export PDF reports"),
    # System Administration
    ("staff:manage", "admin", "Manage staff accounts & permissions"),
    ("audit:view", "admin", "View system audit logs"),
    ("sync:execute", "system", "Perform offline synchronization"),
]

def init_db(db: Session):
    # Create all tables
    bind = db.get_bind()
    Base.metadata.create_all(bind=bind)

    # 1. Seed Permissions
    perm_map = {}
    for code, module, desc in PERMISSIONS:
        perm = db.query(Permission).filter(Permission.code == code).first()
        if not perm:
            perm = Permission(code=code, module=module, description=desc)
            db.add(perm)
            db.flush()
        perm_map[code] = perm

    # 2. Seed Roles
    # Super Admin Role
    super_admin_role = db.query(Role).filter(Role.name == "Super Admin").first()
    if not super_admin_role:
        super_admin_role = Role(name="Super Admin", description="Full system authority across all modules", is_system=True)
        db.add(super_admin_role)
        db.flush()
        # Add all permissions
        for perm in perm_map.values():
            db.add(RolePermission(role_id=super_admin_role.id, permission_id=perm.id))

    # Fee Administrator Role
    fee_admin_role = db.query(Role).filter(Role.name == "Fee Administrator").first()
    if not fee_admin_role:
        fee_admin_role = Role(name="Fee Administrator", description="Manages students, fees, payments, corrections and reports", is_system=True)
        db.add(fee_admin_role)
        db.flush()
        fee_admin_perms = [
            "student:read", "student:create", "student:update", "student:status",
            "fee_struct:manage", "student_fee:assign",
            "payment:create", "payment:correct", "payment:history",
            "reports:view", "reports:export", "sync:execute"
        ]
        for p_code in fee_admin_perms:
            if p_code in perm_map:
                db.add(RolePermission(role_id=fee_admin_role.id, permission_id=perm_map[p_code].id))

    # Staff / Cashier Role
    staff_role = db.query(Role).filter(Role.name == "Staff").first()
    if not staff_role:
        staff_role = Role(name="Staff", description="Restricted access for searching students and recording payments", is_system=True)
        db.add(staff_role)
        db.flush()
        staff_perms = [
            "student:read", "payment:create", "payment:history", "sync:execute"
        ]
        for p_code in staff_perms:
            if p_code in perm_map:
                db.add(RolePermission(role_id=staff_role.id, permission_id=perm_map[p_code].id))

    # 3. Seed Default Super Admin User if no users exist
    admin_user = db.query(User).filter(User.username == "admin").first()
    if not admin_user:
        import os
        from app.config import settings
        env = settings.ENVIRONMENT.lower()
        initial_admin_pass = os.getenv("ADMIN_INITIAL_PASSWORD")
        if not initial_admin_pass:
            if env == "production":
                raise ValueError("PRODUCTION DEPLOYMENT ERROR: ADMIN_INITIAL_PASSWORD environment variable must be set in production to seed super admin.")
            initial_admin_pass = "ShikshaAdmin2026!SecureEnv"
        
        admin_user = User(
            username="admin",
            email="admin@shiksha.local",
            password_hash=get_password_hash(initial_admin_pass),
            full_name="System Administrator",
            is_active=True
        )
        db.add(admin_user)
        db.flush()
        db.add(UserRole(user_id=admin_user.id, role_id=super_admin_role.id))

    db.commit()
