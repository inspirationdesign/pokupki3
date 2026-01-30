import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Remove quotes if they were accidentally included in the Env Var
    DATABASE_URL = DATABASE_URL.strip().strip("'").strip('"')

    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
    elif DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

    print(f"DEBUG: Connection URL starts with: {DATABASE_URL.split('://')[0]}://...")
    try:
        from urllib.parse import urlparse
        # Parsing with a dummy scheme to ensure username/password extraction works even if sqlalchemy differs
        parsed = urlparse(DATABASE_URL)
        print(f"DEBUG: DETECTED HOSTNAME: '{parsed.hostname}'")
        print(f"DEBUG: DETECTED PORT: '{parsed.port}'")
        if parsed.hostname and ('@' in parsed.username if parsed.username else False):
             print("WARNING: Username contains '@'. This might be fine.")
    except Exception as e:
        print(f"DEBUG: Could not parse URL for debugging: {e}")

# Fix for Supabase/PgBouncer: Disable prepared statements
engine = create_async_engine(
    DATABASE_URL, 
    echo=True,
    connect_args={
        "statement_cache_size": 0
    }
)

AsyncSessionLocal = sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

Base = declarative_base()

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
