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
# CORS (IMPORTANT FOR NETLIFY)
# ----------------------------
# ✅ Production URL fixed
# ✅ All Netlify preview URLs allowed via regex
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://esita-chatbot.netlify.app",
    ],
    allow_origin_regex=r"^https://.*\.netlify\.app$",
    allow_credentials=False,  # ✅ keep False (no cookies)
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------
# MODELS
# ----------------------------
class HistoryItem(BaseModel):
    role: str  # "user" or "assistant"
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
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not GEMINI_API_KEY or not client:
        return ChatResponse(
            reply="❌ Gemini API key not found. Add GEMINI_API_KEY in Render Environment Variables."
        )

    user_msg = (req.message or "").strip()
    if not user_msg:
        return ChatResponse(reply="Please type something 🙂")

    # Speed: keep smaller history
    history = req.history[-6:] if req.history else []

    # System prompt (short for speed)
    lines = [
        "SYSTEM: You are Esita, a helpful assistant. Reply clearly and briefly unless the user asks for a long explanation.",
    ]

    for h in history:
        r = (h.role or "").lower().strip()
        t = (h.text or "").strip()
        if not t:
            continue
        if r not in ["user", "assistant"]:
            r = "user"
        lines.append(f"{r.upper()}: {t}")

    lines.append(f"USER: {user_msg}")
    lines.append("ASSISTANT:")

    prompt = "\n".join(lines)

    try:
        # ✅ Model name correct
        res = client.models.generate_content(
            model="gemini-1.5-flash",
            contents=prompt,
        )

        text = (res.text or "").strip()
        if not text:
            text = "I couldn't generate a reply. Please try again."

        return ChatResponse(reply=text)

    except Exception as e:
        # show real error
        return ChatResponse(reply=f"❌ Server error: {str(e)}")
