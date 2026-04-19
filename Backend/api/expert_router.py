from sqlalchemy.orm import Session
from fastapi import APIRouter
from ..expertfinder.pipeline import run_expert_discovery
import asyncio
from datetime import datetime, timedelta
from ..db.model import ExpertDiscoveryCache
from pydantic import BaseModel
from ..db.database import get_db
import json
from fastapi import Depends


router = APIRouter()


# in-memory dict — lives for the lifetime of the process
in_progress: dict[str, asyncio.Event] = {}

class DiscoverRequest(BaseModel):
    query: str

def get_cached_result(db: Session, query: str) -> list[dict] | None:
    # query ExpertDiscoveryCache by query string
    # check if created_at is within 24 hours
    # return json.loads(result.result_json) if valid
    # return None if not found or expired
    cache_entry = db.query(ExpertDiscoveryCache).filter_by(query=query).first()
    if cache_entry:
        if datetime.utcnow() - cache_entry.created_at < timedelta(hours=24):
            return json.loads(cache_entry.result_json)
    return None


def store_in_cache(db: Session, query: str, result: list[dict]) -> None:
    # upsert ExpertDiscoveryCache record
    # store json.dumps(result) as result_json
    # commit
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
    

@router.post("/discover/experts")
async def discover_experts(request: DiscoverRequest, db: Session = Depends(get_db)):
    query = request.query
    normalized = query.strip().lower()
    
    # Check cache first
    cached = get_cached_result(db, normalized)
    if cached:
        return cached
    
    # Check if pipeline already running for this query
    if normalized in in_progress:
        # Wait for the running pipeline to finish
        await in_progress[normalized].wait()
        # Now cache has the result
        return get_cached_result(db, normalized)
    
    # We are the first request — set the lock
    event = asyncio.Event()
    in_progress[normalized] = event
    
    try:
        result = await run_expert_discovery(query)
        store_in_cache(db, normalized, result)
        return result
    finally:
        # Signal all waiters and clean up
        event.set()
        del in_progress[normalized]