import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://esita-chatbot.onrender.com"; // no trailing slash

function normalize(s = "") {
  return s.toLowerCase().trim();
}

function isNameQuestion(msg) {
  const m = normalize(msg);
  return (
    m.includes("your name") ||
    m.includes("ur name") ||
    m === "name" ||
    m.includes("what is your name") ||
    m.includes("who are you")
  );
}

function isCreatorQuestion(msg) {
  const m = normalize(msg);
  return (
    m.includes("who created you") ||
    m.includes("who made you") ||
    m.includes("your creator") ||
    m.includes("who built you")
  );
}

function CodeBlock({ inline, className, children }) {
  const code = String(children ?? "").replace(/\n$/, "");
  const lang = (className || "").replace("language-", "");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }

  if (inline) {
    return (
      <code className="rounded-md bg-white/10 px-1 py-0.5 text-[0.95em]">
        {children}
      </code>
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-white/10 bg-black/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs opacity-70">{lang ? lang : "code"}</span>
        <button
          onClick={copy}
          className="text-xs rounded-lg border border-white/10 px-2 py-1 hover:bg-white/10"
          type="button"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-auto text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function MarkdownMessage({ text }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlock,
        table: ({ children }) => (
          <div className="my-3 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-white/5">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 border-b border-white/10 font-semibold">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 border-b border-white/10">{children}</td>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-6 my-2 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-6 my-2 space-y-1">{children}</ol>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

// timeout helper
async function fetchWithTimeout(url, options = {}, ms = 45000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export default function Chatbot() {
  const [online, setOnline] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const [messages, setMessages] = useState(() => [
    { role: "assistant", text: "Hi, I'm Esita. How can I help you today?" },
  ]);

  const boxRef = useRef(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // check backend health on load
  useEffect(() => {
    (async () => {
      try {
        const r = await fetchWithTimeout(`${API_BASE}/health`, {}, 15000);
        setOnline(r.ok);
      } catch {
        setOnline(false);
      }
    })();
  }, []);

  const historyForServer = useMemo(() => {
    return messages.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.text,
    }));
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    // Add user message first
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");

    // Local quick replies (no server call)
    if (isCreatorQuestion(text)) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Sweetyseleena created me. 👑" },
      ]);
      return;
    }

    if (isNameQuestion(text)) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "I'm Esita 🤖" },
      ]);
      return;
    }

    setSending(true);
    try {
      const r = await fetchWithTimeout(
        `${API_BASE}/api/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text, history: historyForServer }),
        },
        45000
      );

      let data = null;
      try {
        data = await r.json();
      } catch {
        // non-json response
      }

      if (!r.ok) {
        const msg = data?.reply || data?.error || `HTTP ${r.status}`;
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `❌ ${msg}` },
        ]);
        setOnline(false);
      } else if (data?.reply) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply },
        ]);
        setOnline(true);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: "No reply." },
        ]);
        setOnline(true);
      }
    } catch (e) {
      const msg =
        e?.name === "AbortError"
          ? "Request timed out (Render sleeping or slow). Try again."
          : "Connection error. Please try again.";
      setOnline(false);
      setMessages((prev) => [...prev, { role: "assistant", text: msg }]);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="min-h-screen bg-[#070b16] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-6xl h-[86vh] rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                online ? "bg-emerald-400" : "bg-red-400"
              }`}
            />
            <span className="text-sm opacity-80">
              {online ? "Online" : "Offline"}
            </span>
          </div>
          <div className="text-base font-semibold">Esita</div>
        </div>

        {/* Messages */}
        <div
          ref={boxRef}
          className="h-[calc(86vh-140px)] px-6 py-5 overflow-y-auto"
        >
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                return (
                  <motion.div
                    key={`${idx}-${m.role}`}
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className={`flex ${
                      isUser ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[78%] rounded-2xl px-4 py-3 leading-relaxed ${
                        isUser
                          ? "bg-white text-slate-950"
                          : "bg-white/10 border border-white/10"
                      }`}
                    >
                      <MarkdownMessage text={m.text} />
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* Typing indicator */}
            <AnimatePresence>
              {sending && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="flex justify-start"
                >
                  <div className="max-w-[78%] rounded-2xl px-4 py-3 bg-white/10 border border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 rounded-full bg-white/60 animate-bounce" />
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-white/60 animate-bounce"
                        style={{ animationDelay: "120ms" }}
                      />
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-white/60 animate-bounce"
                        style={{ animationDelay: "240ms" }}
                      />
                      <span className="text-xs opacity-70 ml-2">
                        Esita is typing…
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-white/10">
          <div className="flex gap-3">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Type your message..."
              disabled={sending}
              className="flex-1 resize-none rounded-2xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/20 disabled:opacity-60"
            />

            <button
              onClick={send}
              disabled={sending}
              className="rounded-2xl bg-white text-slate-950 px-6 py-3 font-medium hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              type="button"
            >
              {sending ? (
                <>
                  <svg
                    className="h-4 w-4 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                    />
                  </svg>
                  Sending…
                </>
              ) : (
                "Send"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
