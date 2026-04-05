import os
from dotenv import load_dotenv
load_dotenv()
GEMINI_EMBEDDING_API_KEY = os.getenv(GEMINI_EMBEDDING_API_KEY)

async def embed_documents(texts: list[str])-> list[list[float]]:
    