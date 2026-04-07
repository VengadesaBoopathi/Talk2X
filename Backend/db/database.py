import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv
from .models import Base

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL is None:
    raise ValueError("DATABASE_URL is not set in environment variables")

engine = create_engine(DATABASE_URL, echo=True)
Base.metadata.create_all(bind = engine)

SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False
)

def get_db():
    """
    FastAPI dependency that provides a database session per request.
    Guarantees session is closed after request completes or fails.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
