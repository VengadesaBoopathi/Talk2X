'''
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
        await asyncio.sleep(1)
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
'''
'''
import asyncio
import os
import voyageai
from dotenv import load_dotenv

load_dotenv()

VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")
if VOYAGE_API_KEY is None:
    raise ValueError("VOYAGE_API_KEY not set in environment")

client = voyageai.AsyncClient(api_key=VOYAGE_API_KEY)
EMBEDDING_SEMAPHORE = asyncio.Semaphore(10)

async def embed_query(text: str) -> list[float]:
    """
    Embeds a single query text using Voyage voyage-3-lite.
    Rate limited via semaphore to max 10 concurrent calls.

    Args:
        text: Text to embed

    Returns:
        Embedding vector as list of floats
    """
    async with EMBEDDING_SEMAPHORE:
        result = await client.embed(
            texts=[text],
            model="voyage-3-lite",
            input_type="query"
        )
        return result.embeddings[0]

async def embed_single(text: str) -> list[float]:
    """
    Wrapper around embed_query for use in gather calls.

    Args:
        text: Text to embed

    Returns:
        Embedding vector as list of floats
    """
    return await embed_query(text)

async def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embeds a list of texts concurrently with rate limiting.
    Never fires more than 10 simultaneous Voyage calls.

    Args:
        texts: List of texts to embed

    Returns:
        List of embedding vectors in same order as input
    """
    if not texts:
        return []
    tasks = [embed_single(text) for text in texts]
    return await asyncio.gather(*tasks)

    
#openai api key user

import asyncio
import os
from dotenv import load_dotenv
from langchain_core.embeddings import Embeddings
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY is None:
    raise ValueError("OPENAI_API_KEY not set in environment")

client = OpenAI(api_key=OPENAI_API_KEY)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_SEMAPHORE = asyncio.Semaphore(10)

MAX_TOKENS = 8000 

def truncate_text(text: str) -> str:
    max_chars = MAX_TOKENS * 4
    if len(text) > max_chars:
        return text[:max_chars]
    return text

class OpenAIEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        truncated = [truncate_text(t) for t in texts]
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=truncated
        )
        return [item.embedding for item in response.data]

    def embed_query(self, text: str) -> list[float]:
        response = client.embeddings.create(
            model=EMBEDDING_MODEL,
            input=truncate_text(text)
        )
        return response.data[0].embedding

async def embed_query(text: str) -> list[float]:
    """
    Embeds a single query text using OpenAI text-embedding-3-small.
    Runs in executor to avoid blocking event loop.

    Args:
        text: Text to embed

    Returns:
        Embedding vector as list of floats
    """
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: OpenAIEmbeddings().embed_query(text)
    )

async def embed_single(text: str) -> list[float]:
    async with EMBEDDING_SEMAPHORE:
        await asyncio.sleep(0.1)
        return await embed_query(truncate_text(text))


async def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embeds a list of texts concurrently with rate limiting.
    Never fires more than 10 simultaneous OpenAI calls.

    Args:
        texts: List of texts to embed

    Returns:
        List of embedding vectors in same order as input
    """
    if not texts:
        return []
    tasks = [embed_single(text) for text in texts]
    return await asyncio.gather(*tasks)
'''

import asyncio
import os
import traceback
from dotenv import load_dotenv
from langchain_core.embeddings import Embeddings
from openai import OpenAI

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_API_KEY is None:
    raise ValueError("OPENAI_API_KEY not set in environment")
else:
    print("DEBUG: OPENAI_API_KEY successfully loaded from environment.")

client = OpenAI(api_key=OPENAI_API_KEY)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_SEMAPHORE = asyncio.Semaphore(10)

MAX_TOKENS = 8000 

def truncate_text(text: str) -> str:
    max_chars = MAX_TOKENS * 3
    if len(text) > max_chars:
        print(f"DEBUG: Truncating text from {len(text)} to {max_chars} characters.")
        return text[:max_chars]
    return text

class OpenAIEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            print(f"DEBUG: Synchronous embed_documents called for {len(texts)} texts.")
            truncated = [truncate_text(t) for t in texts]
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=truncated
            )
            print("DEBUG: Synchronous embed_documents SUCCESS.")
            return [item.embedding for item in response.data]
        except Exception as e:
            print(f"ERROR in sync embed_documents: {e}")
            traceback.print_exc()
            raise

    def embed_query(self, text: str) -> list[float]:
        try:
            print("DEBUG: Calling OpenAI client.embeddings.create...")
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=truncate_text(text)
            )
            print("DEBUG: OpenAI API returned embedding successfully.")
            return response.data[0].embedding
        except Exception as e:
            print(f"ERROR in sync embed_query: {e}")
            traceback.print_exc()
            raise

async def embed_query(text: str) -> list[float]:
    """
    Embeds a single query text using OpenAI text-embedding-3-small.
    Runs in executor to avoid blocking event loop.
    """
    try:
        print(f"DEBUG: Scheduling async embed_query in executor. Text length: {len(text)}")
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: OpenAIEmbeddings().embed_query(text)
        )
        return result
    except Exception as e:
        print(f"ERROR in async embed_query: {e}")
        raise

async def embed_single(text: str) -> list[float]:
    try:
        async with EMBEDDING_SEMAPHORE:
            await asyncio.sleep(0.1)
            return await embed_query(truncate_text(text))
    except Exception as e:
        print(f"ERROR in embed_single: {e}")
        raise

async def embed_documents(texts: list[str]) -> list[list[float]]:
    """
    Embeds a list of texts concurrently with rate limiting.
    Never fires more than 10 simultaneous OpenAI calls.
    """
    print(f"DEBUG: async embed_documents started. Total texts to embed: {len(texts)}")
    if not texts:
        print("DEBUG: No texts provided to embed_documents. Returning empty list.")
        return []
    
    try:
        tasks = [embed_single(text) for text in texts]
        results = await asyncio.gather(*tasks)
        print(f"DEBUG: Successfully gathered all {len(results)} embeddings from tasks.")
        return results
    except Exception as e:
        print(f"CRITICAL ERROR in asyncio.gather (embed_documents): {e}")
        traceback.print_exc()
        raise