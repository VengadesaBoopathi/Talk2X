# '''
import asyncio
import hashlib
import re
from langchain_chroma import Chroma
from langchain_core.embeddings import Embeddings
from .embeddings import embed_query, embed_documents
import concurrent.futures
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load credentials and configure Gemini
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

class GeminiEmbeddings(Embeddings):
    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=texts
        )
        return result["embedding"]
    
    def embed_query(self, text: str) -> list[float]:
        result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=text
        )
        return result["embedding"]

def get_or_create_collection(username: str) -> Chroma:
    """
    Returns LangChain Chroma vector store for a username.
    Creates collection if it does not exist.
    
    Args:
        username: Reddit username
        
    Returns:
        Chroma vector store instance
    """
    sanitized_username = re.sub(r'[^a-zA-Z0-9-]', '-', username.lower())
    return Chroma(
        collection_name=sanitized_username,
        embedding_function=GeminiEmbeddings(),
        persist_directory="./chroma_db"
    )

def add_documents(
    collection: Chroma,
    username: str,
    chunks: list[str],
    metadatas: list[dict]
) -> None:
    """
    Adds chunks to vector store with metadata.
    Idempotent - existing documents are updated not duplicated.
    
    Args:
        collection: Chroma vector store instance
        username: Reddit username for ID generation
        chunks: List of chunk texts
        metadatas: List of metadata dicts matching chunks
    """
    if not chunks:
        return
    
    ids = [
        hashlib.md5(f"{username}:{i}:{chunk}".encode()).hexdigest()
        for i , chunk in enumerate(chunks)
    ]
    collection.add_texts(
        texts=chunks,
        metadatas=metadatas,
        ids=ids
    )

def similarity_search(
    collection: Chroma,
    query_text: str,
    n_results: int = 5
) -> list[dict]:
    """
    Searches collection for chunks similar to query.
    
    Args:
        collection: Chroma vector store instance
        query_text: Raw query string
        n_results: Number of results to return
        
    Returns:
        List of dicts with text, score, url, subreddit, created_utc
    """
    results = collection.similarity_search_with_score(
        query=query_text,
        k=n_results
    )
    top_similar_chunks =[]
    for document,score in results:
        chunk = {
            "text" : document.page_content,
            "score": score,
            "url" : document.metadata["url"],
            "subreddit" : document.metadata["subreddit"],
            "created_utc" : document.metadata["created_utc"]
        }
        top_similar_chunks.append(chunk)
    
    return top_similar_chunks
    
'''
import hashlib
import re
import os
from langchain_chroma import Chroma
from langchain_voyageai import VoyageAIEmbeddings
from .embeddings import embed_query, embed_documents
from dotenv import load_dotenv
import nest_asyncio
nest_asyncio.apply()

load_dotenv()

def get_or_create_collection(username: str) -> Chroma:
    """
    Returns LangChain Chroma vector store for a username.
    Creates collection if it does not exist.
    Sanitizes username to meet Chroma collection naming rules:
    - Only alphanumeric and hyphens
    - Must start and end with alphanumeric
    - Length between 3 and 512 characters

    Args:
        username: Reddit username

    Returns:
        Chroma vector store instance
    """
    sanitized = re.sub(r'[^a-zA-Z0-9-]', '-', username.lower())
    sanitized = re.sub(r'-+', '-', sanitized)
    sanitized = sanitized.strip('-')
    sanitized = sanitized[:512]
    if len(sanitized) < 3:
        sanitized = sanitized + 'usr'
    return Chroma(
        collection_name=sanitized,
        embedding_function=VoyageAIEmbeddings(
            model="voyage-3-lite",
            voyage_api_key=os.getenv("VOYAGE_API_KEY")
        ),
        persist_directory="./chroma_db"
    )

def add_documents(
    collection: Chroma,
    username: str,
    chunks: list[str],
    metadatas: list[dict]
) -> None:
    """
    Adds chunks to vector store with metadata.
    Idempotent - existing documents are not duplicated.

    Args:
        collection: Chroma vector store instance
        username: Reddit username for ID generation
        chunks: List of chunk texts
        metadatas: List of metadata dicts matching chunks
    """
    if not chunks:
        return
    ids = [
        hashlib.md5(f"{username}:{i}:{chunk}".encode()).hexdigest()
        for i, chunk in enumerate(chunks)
    ]
    collection.add_texts(
        texts=chunks,
        metadatas=metadatas,
        ids=ids
    )

def similarity_search(
    collection: Chroma,
    query_text: str,
    n_results: int = 5
) -> list[dict]:
    """
    Searches collection for chunks similar to query.

    Args:
        collection: Chroma vector store instance
        query_text: Raw query string
        n_results: Number of results to return

    Returns:
        List of dicts with text, score, url, subreddit, created_utc
    """
    results = collection.similarity_search_with_score(
        query=query_text,
        k=n_results
    )
    top_similar_chunks = []
    for document, score in results:
        chunk = {
            "text": document.page_content,
            "score": score,
            "url": document.metadata["url"],
            "subreddit": document.metadata["subreddit"],
            "created_utc": document.metadata["created_utc"]
        }
        top_similar_chunks.append(chunk)
    return top_similar_chunks
'''