from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from ..expertfinder.pipeline import run_expert_discovery_stream
import asyncio
from datetime import datetime, timedelta
from ..db.model import ExpertDiscoveryCache
from pydantic import BaseModel
from ..db.database import get_db
import json

router = APIRouter()

in_progress: dict[str, asyncio.Event] = {}

class DiscoverRequest(BaseModel):
    query: str

def get_cached_result(db: Session, query: str) -> list[dict] | None:
    cache_entry = db.query(ExpertDiscoveryCache).filter_by(query=query).first()
    if cache_entry:
        if datetime.utcnow() - cache_entry.created_at < timedelta(hours=24):
            return json.loads(cache_entry.result_json)
    return None

def store_in_cache(db: Session, query: str, result: list[dict]) -> None:
    cache_entry = db.query(ExpertDiscoveryCache).filter_by(query=query).first()
    if cache_entry:
        cache_entry.result_json = json.dumps(result)
        cache_entry.created_at = datetime.utcnow()
    else:
        cache_entry = ExpertDiscoveryCache(
            query=query,
            result_json=json.dumps(result),
            created_at=datetime.utcnow()
        )
        db.add(cache_entry)
    db.commit()

def make_event(event_type: str, data: dict) -> str:
    """Format a Server-Sent Event."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"

@router.post("/discover/experts")
async def discover_experts(request: DiscoverRequest, db: Session = Depends(get_db)):
    query = request.query
    normalized = query.strip().lower()

    # Cache hit — stream a single done event with cached results
    cached = get_cached_result(db, normalized)
    if cached:
        async def stream_cached():
            yield make_event("cached", {"experts": cached})
        return StreamingResponse(stream_cached(), media_type="text/event-stream")

    # Already running — wait and return cached result when done
    if normalized in in_progress:
        async def stream_wait():
            await in_progress[normalized].wait()
            result = get_cached_result(db, normalized) or []
            yield make_event("cached", {"experts": result})
        return StreamingResponse(stream_wait(), media_type="text/event-stream")

    # First request — run pipeline and stream steps
    event = asyncio.Event()
    in_progress[normalized] = event

    async def stream_pipeline():
        final_result = []
        try:
            async for step_event in run_expert_discovery_stream(query):
                yield make_event(step_event["type"], step_event["data"])
                if step_event["type"] == "done":
                    final_result = step_event["data"].get("experts", [])
        except Exception as e:
            yield make_event("error", {"message": str(e)})
        finally:
            if final_result:
                store_in_cache(db, normalized, final_result)
            event.set()
            del in_progress[normalized]

    return StreamingResponse(stream_pipeline(), media_type="text/event-stream")
