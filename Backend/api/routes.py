from fastapi import APIRouter,BackgroundTasks,Depends,HTTPException
from fastapi.responses import StreamingResponse,JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..db.database import get_db
from ..db.crud import get_user,get_or_create_user
from ..scraper.scraper import scrape_user_background
from ..rag.pipeline import run_rag_pipeline
from ..rag.vector_store import get_or_create_collection

router = APIRouter()

class ChatRequest(BaseModel):
    query:str
    chat_history:list[dict]

@router.post("/scrape/{username}")
async def scrape_user_route(username:str,background_tasks:BackgroundTasks,db:Session  = Depends(get_db))->dict:
    username = username.lower()
    user = get_user(db,username)
    if user and user.scrape_status=="in_progress":
        raise HTTPException(status_code=400,detail="Scrape already in progress")
    background_tasks.add_task(scrape_user_background,username)
    return JSONResponse(status_code=202,content={"status":"scrape started"})

@router.get("/debug/{username}")
async def debug(username: str):
    username = username.lower()
    collection = get_or_create_collection(username)
    count = collection._collection.count()
    return {"collection_name": username, "document_count": count}

@router.get("/status/{username}")
async def get_status(username:str,db:Session  = Depends(get_db))->dict:
    username = username.lower()
    reddit_user = get_user(db,username) 
    if reddit_user is None:
        raise HTTPException(status_code = 404,detail="User not found")
    return {
                "username":reddit_user.username,
                "scrape_status":reddit_user.scrape_status,
                "total_post":reddit_user.total_posts,
                "total_comments":reddit_user.total_comments,
                "last_scraped_at":reddit_user.last_scraped_at
            }

@router.post("/chat/{username}")
async def chat(username:str,request:ChatRequest,db:Session  = Depends(get_db))->StreamingResponse:
    username = username.lower()
    reddit_user = get_user(db,username) 
    if reddit_user is None:
        raise HTTPException(404,detail="User not found")
    elif reddit_user.scrape_status ==  "in_progress":
        raise HTTPException(400,detail="Scraping in progress")
    elif reddit_user.scrape_status ==  "failed":
        raise HTTPException(400,detail="Scraping failed")
    return StreamingResponse(run_rag_pipeline(username,request.query,request.chat_history),media_type="text/plain")

@router.get("/health")
async def health()->dict:
    return {"status":"ok"}

