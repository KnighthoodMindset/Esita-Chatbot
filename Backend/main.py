import os
import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

app = FastAPI()

# Dev lo allow all. Deploy ayyaka only your frontend domain pettu.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []  # optional: [{"role":"user","text":"..."}, {"role":"assistant","text":"..."}]

# ✅ ADD THIS ROOT ROUTE (so / won't be 404)
@app.get("/")
def root():
    return {
        "message": "Esita backend is running ✅",
        "try": ["/health", "/docs", "/api/chat (POST)"]
    }

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/chat")
def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        return {"error": "Server error: GEMINI_API_KEY not set in .env"}

    user_text = (req.message or "").strip()
    if not user_text:
        return {"error": "Message is empty."}

    # Convert history to Gemini format (keep last few messages)
    parts = []
    trimmed = req.history[-8:] if req.history else []
    for m in trimmed:
        role = m.get("role")
        text = (m.get("text") or "").strip()
        if not text:
            continue
        parts.append({"text": f"{role}: {text}"})

    parts.append({"text": f"user: {user_text}"})

    url = f"https://generativelanguage.googleapis.com/v1/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    payload = {"contents": [{"parts": parts}]}

    try:
        r = requests.post(url, json=payload, timeout=20)
        data = r.json()

        if "error" in data:
            return {"error": data["error"].get("message", "Gemini API error")}

        reply = data["candidates"][0]["content"]["parts"][0]["text"]
        return {"reply": reply}

    except Exception as e:
        return {"error": f"Server request failed: {e}"}
