import os
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from groq import Groq

load_dotenv()

# ----------------------------
# CONFIG (GROQ)
# ----------------------------
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

client = Groq(api_key=GROQ_API_KEY) if GROQ_API_KEY else None

app = FastAPI(title="Esita Backend", version="1.0.0")

# ----------------------------
# CORS (NETLIFY + LOCAL)
# ----------------------------
ALLOW_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://esita-chatbot.netlify.app",
]

# Netlify preview links: https://xxxx--esita-chatbot.netlify.app
NETLIFY_PREVIEW_REGEX = r"^https://.*\.netlify\.app$"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_origin_regex=NETLIFY_PREVIEW_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# MODELS
# ----------------------------
class HistoryItem(BaseModel):
    role: str
    text: str

class ChatRequest(BaseModel):
    message: str
    history: Optional[List[HistoryItem]] = []

class ChatResponse(BaseModel):
    reply: str

# ----------------------------
# ROUTES
# ----------------------------
@app.get("/")
def root():
    return {
        "message": "Esita backend is running ✅",
        "try": ["/health", "/docs", "/api/chat (POST)"],
        "provider": "groq",
        "model": GROQ_MODEL,
    }

@app.get("/health")
def health():
    return {"status": "ok", "provider": "groq", "model": GROQ_MODEL}

@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not GROQ_API_KEY or not client:
        return ChatResponse(reply="❌ GROQ API key not found. Add GROQ_API_KEY in Render Environment Variables.")

    user_msg = (req.message or "").strip()
    if not user_msg:
        return ChatResponse(reply="Please type something 🙂")

    # Keep small history (speed)
    history = req.history[-6:] if req.history else []

    # Convert your HistoryItem format -> Groq chat messages
    messages = [
        {
            "role": "system",
            "content": "You are Esita, a helpful assistant. Reply clearly and briefly unless user asks for long explanation.",
        }
    ]

    for h in history:
        r = (h.role or "").lower().strip()
        t = (h.text or "").strip()
        if not t:
            continue
        if r not in ["user", "assistant"]:
            r = "user"
        messages.append({"role": r, "content": t})

    messages.append({"role": "user", "content": user_msg})

    try:
        resp = client.chat.completions.create(
            model=GROQ_MODEL,
            messages=messages,
            temperature=0.7,
            max_tokens=512,
        )

        text = (resp.choices[0].message.content or "").strip() if resp.choices else ""
        if not text:
            text = "I couldn't generate a reply. Please try again."
        return ChatResponse(reply=text)

    except Exception as e:
        return ChatResponse(reply=f"❌ Server error: {type(e).__name__}: {str(e)}")
