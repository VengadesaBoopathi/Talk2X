from .retriever import retrieve
import google.generativeai as genai
from typing import AsyncGenerator
import os
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY is None:
    raise ValueError("GEMINI_API_KEY not set in environment")

genai.configure(api_key=GEMINI_API_KEY)
GEMINI_MODEL = genai.GenerativeModel("gemini-2.5-flash")

async def run_rag_pipeline(username: str,query: str,chat_history: list[dict]) -> AsyncGenerator[str, None]:
    top_similar_chunks = await retrieve(username,query)
    if not top_similar_chunks:
        yield "I could not found any relevant chunks"
        return

    context =""
    for i, chunk in enumerate(top_similar_chunks):
        context += f"[{i+1}] {chunk['text']}\n"
        context += f"Source: {chunk['url']}\n\n"

    system_prompt = """
    You are an AI assistant that answers questions about a Reddit user 
    based exclusively on their actual posts and comments provided below.

    Rules:
    - Answer ONLY based on the context provided if no context then give relevant answers.

    Context:
    {context}

    Chat history:
    {chat_history} """
    formatted_history = "\n".join([
        f"{msg['role']}:{msg['content']}" for msg in chat_history
    ])

    full_prompt = system_prompt.format(context=context,chat_history=formatted_history)+f"\n\nUser question: {query}"
    try:
        async for chunk in await GEMINI_MODEL.generate_content_async(full_prompt,stream = True):
            if chunk.text:
                yield chunk.text
    except Exception as error:
        yield f"Error generating response :{str(error)}"