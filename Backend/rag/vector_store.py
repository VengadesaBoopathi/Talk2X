
import asyncio
import hashlib
import re
import os
from dotenv import load_dotenv
from langchain_chroma import Chroma
from .embeddings import OpenAIEmbeddings

load_dotenv()

def get_or_create_collection(username: str) -> Chroma:
    """
    Returns LangChain Chroma vector store for a username.
    Creates collection if it does not exist.

    Args:
        username: Reddit username

    Returns:
        Chroma vector store instance
    """
    sanitized = re.sub(r'[^a-zA-Z0-9-]', '-', username.lower())
    sanitized = re.sub(r'-+', '-', sanitized)
    sanitized = sanitized.strip('-')
    if len(sanitized) < 3:
        sanitized = sanitized + 'usr'

    return Chroma(
        collection_name=sanitized,
        embedding_function=OpenAIEmbeddings(),
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
            "url": document.metadata.get("url", ""),
            "subreddit": document.metadata.get("subreddit", ""),
            "created_utc": document.metadata.get("created_utc", "")
        }
        top_similar_chunks.append(chunk)

    return top_similar_chunks
