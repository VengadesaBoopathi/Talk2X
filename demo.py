import google.generativeai as genai
import os 
from dotenv import load_dotenv
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
for m in genai.list_models():
    print(m.name)



{
  "query": "what does this user talks about",
  "chat_history": [
    {
      "role":"user","content":"previous question"
    },
    {
      "role":"assistant","content":"previous answer"
    }
  ]
}