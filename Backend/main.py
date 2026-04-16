from fastapi import FastAPI
from .api.routes import router 
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title ="Talk2X",version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")