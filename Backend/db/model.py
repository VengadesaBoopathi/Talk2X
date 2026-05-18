from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import DeclarativeBase, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class RedditUser(Base):
    __tablename__ = "reddit_users"

    username = mapped_column(String, primary_key=True)
    last_scraped_at = mapped_column(DateTime, nullable=True, default=None)
    total_posts = mapped_column(Integer, default=0, nullable=False)
    total_comments = mapped_column(Integer, default=0, nullable=False)
    scrape_status = mapped_column(String, default="idle", nullable=False)
    created_at = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    errors = relationship("ScrapeError", back_populates="user")


class ScrapeError(Base):
    __tablename__ = "scrape_errors"

    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    username = mapped_column(String, ForeignKey("reddit_users.username"), nullable=False)
    error_message = mapped_column(String, nullable=False)
    occurred_at = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    user = relationship("RedditUser", back_populates="errors")


class ExpertDiscoveryCache(Base):
    __tablename__ = "expert_discovery_cache"

    query = mapped_column(String, primary_key=True)
    result_json = mapped_column(String, nullable=False)
    created_at = mapped_column(DateTime, default=datetime.utcnow)


class QueryEmbeddingCache(Base):
    """
    Stores per-user RAG query results keyed by (username, query_text).
    Also stores the embedding vector as a JSON-serialised float list so
    we can do cosine similarity at lookup time without re-embedding.

    Entries expire after 24 hours (enforced at read time in crud.py).
    """
    __tablename__ = "query_embedding_cache"

    id = mapped_column(Integer, primary_key=True, autoincrement=True)
    username = mapped_column(String, nullable=False, index=True)
    query_text = mapped_column(Text, nullable=False)
    # JSON-encoded list[float]  e.g. "[0.12, -0.34, ...]"
    query_embedding = mapped_column(Text, nullable=False)
    # JSON-encoded RAG response string (the full streamed answer)
    cached_response = mapped_column(Text, nullable=False)
    created_at = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
