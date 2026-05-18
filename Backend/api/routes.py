from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json

from ..db.database import get_db
from ..db.crud import get_user, get_or_create_user
from ..db.model import QueryEmbeddingCache
from ..scraper.scraper import scrape_user_background
from ..rag.pipeline import run_rag_pipeline
from ..rag.vector_store import get_or_create_collection
from ..rag.embeddings import embed_query
from ..expertfinder.subreddit_validator import cosine_similarity

router = APIRouter()

QUERY_CACHE_TTL_HOURS = 24
QUERY_SIMILARITY_THRESHOLD = 0.70


class ChatRequest(BaseModel):
    query: str
    chat_history: list[dict]


# ── Query embedding cache helpers ────────────────────────────────────────────

def _get_similar_cached_response(
    db: Session,
    username: str,
    query_embedding: list[float],
) -> str | None:
    """
    Scans cached query embeddings for this user.
    Returns the cached response if any stored query has cosine similarity
    >= QUERY_SIMILARITY_THRESHOLD with the incoming embedding.
    Ignores entries older than QUERY_CACHE_TTL_HOURS.
    Returns None if no match found.
    """
    cutoff = datetime.utcnow() - timedelta(hours=QUERY_CACHE_TTL_HOURS)
    entries = (
        db.query(QueryEmbeddingCache)
        .filter(
            QueryEmbeddingCache.username == username,
            QueryEmbeddingCache.created_at >= cutoff,
        )
        .all()
    )

    best_score = 0.0
    best_response = None

    for entry in entries:
        stored_embedding = json.loads(entry.query_embedding)
        score = cosine_similarity(query_embedding, stored_embedding)
        if score > best_score:
            best_score = score
            best_response = entry.cached_response

    if best_score >= QUERY_SIMILARITY_THRESHOLD:
        return best_response

    return None


def _store_query_cache(
    db: Session,
    username: str,
    query_text: str,
    query_embedding: list[float],
    response_text: str,
) -> None:
    """
    Persists a query + its embedding + the full response to the cache table.
    """
    entry = QueryEmbeddingCache(
        username=username,
        query_text=query_text,
        query_embedding=json.dumps(query_embedding),
        cached_response=response_text,
    )
    db.add(entry)
    db.commit()


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/scrape/{username}")
async def scrape_user_route(
    username: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> dict:
    username = username.lower()
    user = get_user(db, username)
    if user and user.scrape_status == "in_progress":
        raise HTTPException(status_code=400, detail="Scrape already in progress")
    background_tasks.add_task(scrape_user_background, username)
    return JSONResponse(status_code=202, content={"status": "scrape started"})


@router.get("/debug/{username}")
async def debug(username: str):
    username = username.lower()
    collection = get_or_create_collection(username)
    count = collection._collection.count()
    return {"collection_name": username, "document_count": count}


@router.get("/status/{username}")
async def get_status(username: str, db: Session = Depends(get_db)) -> dict:
    username = username.lower()
    reddit_user = get_user(db, username)
    if reddit_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "username": reddit_user.username,
        "scrape_status": reddit_user.scrape_status,
        "total_posts": reddit_user.total_posts,
        "total_comments": reddit_user.total_comments,
        "last_scraped_at": reddit_user.last_scraped_at,
    }


@router.post("/chat/{username}")
async def chat(
    username: str,
    request: ChatRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    username = username.lower()
    reddit_user = get_user(db, username)

    if reddit_user is None:
        raise HTTPException(404, detail="User not found")
    elif reddit_user.scrape_status == "in_progress":
        raise HTTPException(400, detail="Scraping in progress")
    elif reddit_user.scrape_status == "failed":
        raise HTTPException(400, detail="Scraping failed")

    # ── Task 1: Query similarity cache check ─────────────────────────────
    # Embed the incoming query once. Check if we've answered a nearly-identical
    # question for this user before (>= 90% cosine similarity). If yes, stream
    # the cached answer back directly — no vector search, no LLM call.
    query_embedding = await embed_query(request.query)
    cached_response = _get_similar_cached_response(db, username, query_embedding)

    if cached_response is not None:
        async def stream_cached():
            yield cached_response

        return StreamingResponse(stream_cached(), media_type="text/plain")

    # ── Cache miss: run the full RAG pipeline ─────────────────────────────
    # We collect the full response so we can cache it, then stream it to
    # the client. We buffer in memory — responses are short (< 4 KB typical).
    full_response_parts: list[str] = []

    async def stream_and_cache():
        async for chunk in run_rag_pipeline(username, request.query, request.chat_history):
            full_response_parts.append(chunk)
            yield chunk

        # After streaming completes, persist to cache.
        # DB write happens outside the generator's hot path.
        full_response = "".join(full_response_parts)
        print(f"DEBUG: full_response length = {len(full_response)}")
        if full_response.strip():
            try:
                _store_query_cache(
                    db,
                    username,
                    request.query,
                    query_embedding,
                    full_response,
                )
                print(f"DEBUG: Cache Stored for query: '{request.query}'")
            except Exception as e:
                print(f"DEBUG: cache store failed: {type(e).__name__}: {e} ")
        else:
            print("DEBUG: full response was empty not caching")


    return StreamingResponse(stream_and_cache(), media_type="text/plain")


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}
