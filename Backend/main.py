from fastapi import FastAPI
from .api.routes import router
from .api.expert_router import router as expert_router
from fastapi.middleware.cors import CORSMiddleware
import os
os.environ["CURL_CA_BUNDLE"] = ""
os.environ["PYTHONHTTPSVERIFY"] = "0"
os.environ["HF_TOKEN"] = "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"

app = FastAPI(title ="Talk2X",version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(expert_router,prefix="/api/v1")