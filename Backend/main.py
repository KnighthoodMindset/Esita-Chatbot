import os
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from google import genai

load_dotenv()

# ----------------------------
# CONFIG
# ----------------------------
GEMINI_API_KEY = (
    os.getenv("GEMINI_API_KEY")
    or os.getenv("GOOGLE_API_KEY")
    or os.getenv("GEMINI_KEY")
)

client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

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
    return {"message": "Esita backend is running ✅", "try": ["/health", "/docs", "/api/chat (POST)"]}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not GEMINI_API_KEY or not client:
        return ChatResponse(reply="❌ Gemini API key not found. Add GEMINI_API_KEY in Render Environment Variables.")

    user_msg = (req.message or "").strip()
    if not user_msg:
        return ChatResponse(reply="Please type something 🙂")

    # Keep small history (speed)
    history = req.history[-6:] if req.history else []

    prompt_lines = [
        "SYSTEM: You are Esita, a helpful assistant. Reply clearly and briefly unless user asks for long explanation."
    ]

    for h in history:
        r = (h.role or "").lower().strip()
        t = (h.text or "").strip()
        if not t:
            continue
        if r not in ["user", "assistant"]:
            r = "user"
        prompt_lines.append(f"{r.upper()}: {t}")

    prompt_lines.append(f"USER: {user_msg}")
    prompt_lines.append("ASSISTANT:")

    prompt = "\n".join(prompt_lines)

    try:
        # ✅ Use a currently supported model id (instead of gemini-1.5-flash)
        res = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )

        text = (getattr(res, "text", "") or "").strip()
        if not text:
            text = "I couldn't generate a reply. Please try again."
        return ChatResponse(reply=text)

    except Exception as e:
        return ChatResponse(reply=f"❌ Server error: {str(e)}")
