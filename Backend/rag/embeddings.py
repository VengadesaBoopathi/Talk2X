import asyncio
import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)

EMBEDDING_SEMAPHORE = asyncio.Semaphore(10)

async def embed_query(text: str) -> list[float]:
    """
    Embeds a single query text using Gemini text-embedding-004.
    Runs in executor to avoid blocking event loop.
    
    Args:
        text: Text to embed
        
    Returns:
        Embedding vector as list of floats
    """
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: genai.embed_content(
            model="models/gemini-embedding-001",
            content=text
        )
    )
    return result["embedding"]

async def embed_single(text: str) -> list[float]:
    async with EMBEDDING_SEMAPHORE:
        await asyncio.sleep(0.1)
        return await embed_query(text)

async def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embeds a list of texts concurrently with rate limiting.
    Never fires more than 10 simultaneous Gemini calls.
    
    Args:
        texts: List of texts to embed
        
    Returns:
        List of embedding vectors in same order as input
    """
    if not  texts:
        return []
    tasks =[embed_single(text) for text in texts]
    return await asyncio.gather(*tasks)