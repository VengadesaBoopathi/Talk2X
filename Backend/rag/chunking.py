from langchain_text_splitters import RecursiveCharacterTextSplitter

SPLITTER = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=50,
    separators=['\n\n', '\n', '. ', ' ', '']
)

def chunk_content(content: dict) -> list[dict]:
    """
    Chunks a single Reddit post or comment.
    Short content under 400 words returned as single chunk.
    Long content split using RecursiveCharacterTextSplitter.
    
    Args:
        content: Dict with id, text, title, url, subreddit, created_utc, score
        
    Returns:
        List of dicts with chunk_text and all original metadata preserved
    """
    text = content.get("text", "").strip()
    
    if not text:
        return []
    
    if len(text.split()) < 400:
        return [{
            "chunk_text": text,
            "source_id": content["id"],
            "url": content["url"],
            "subreddit": content["subreddit"],
            "created_utc": content["created_utc"],
            "score": content["score"],
            "title": content.get("title", "")
        }]
    
    raw_chunks = SPLITTER.split_text(text)
    
    return [
        {
            "chunk_text": chunk,
            "source_id": content["id"],
            "url": content["url"],
            "subreddit": content["subreddit"],
            "created_utc": content["created_utc"],
            "score": content["score"],
            "title": content.get("title", "")
        }
        for chunk in raw_chunks
    ]