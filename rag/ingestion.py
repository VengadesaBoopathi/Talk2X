from .chunking import chunk_content
from .vector_store import get_or_create_collection,add_documents

async def ingest_user_content(username:str,posts:list[dict],comments:list[dict])->None:
    """
    creates chunks and add it to vector db chroma
    """
    all_content = posts+comments
    all_chunks = []

    for content in all_content:
        chunk = chunk_content(content)
        all_chunks.extend(chunk)

    if not all_chunks:
        return
    
    texts = [chunk["chunk_text"] for chunk in all_chunks]

    metadatas = [{
        "url":chunk["url"],
        "subreddit":chunk["subreddit"],
        "created_utc":str(chunk["created_utc"]),
        "score":str(chunk["score"]),
        "title":chunk["title"]
    } for chunk in all_chunks
    ]

    collection = get_or_create_collection(username)
    add_documents(collection,username,texts,metadatas)
