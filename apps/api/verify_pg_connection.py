import sys
from app.config import settings
from app.db.session import engine, Base
from app.models import models

def main():
    url = settings.DATABASE_URL
    is_present = bool(url)
    is_postgres = url.startswith("postgresql")
    
    print(f"DATABASE_URL present: {is_present}")
    print(f"PostgreSQL URL: {is_postgres}")

    if not is_postgres:
        print("STATUS: NOT_POSTGRESQL")
        sys.exit(1)

    try:
        # Verify connection and create tables if needed
        Base.metadata.create_all(bind=engine)
        print("Supabase PostgreSQL Connection: PASS")
    except Exception as e:
        print(f"Supabase PostgreSQL Connection: FAIL ({type(e).__name__})")
        sys.exit(2)

if __name__ == "__main__":
    main()
