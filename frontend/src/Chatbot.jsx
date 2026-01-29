import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = "http://127.0.0.1:8000";

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
    } catch {
      // ignore
    }
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
        strong: ({ children }) => (
          <strong className="font-semibold">{children}</strong>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
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

  const historyForServer = useMemo(() => {
    // Send last few messages only
    const trimmed = messages.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      text: m.text,
    }));
    return trimmed;
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    // user message
    setMessages((prev) => [...prev, { role: "user", text }]);
    setInput("");

    // local fixed replies (like your old JS)
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
      const r = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: historyForServer,
        }),
      });

      const data = await r.json();
      if (data?.error) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: `❌ ${data.error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", text: data.reply ?? "No reply." },
        ]);
      }
      setOnline(true);
    } catch (e) {
      setOnline(false);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Connection error. Please try again." },
      ]);
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
      {/* BIGGER WINDOW (like your 2nd image) */}
      <div className="w-full max-w-6xl h-[86vh] rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden shadow-2xl">
        {/* Header: left Online, right Esita only. NO X */}
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
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              return (
                <div
                  key={idx}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 leading-relaxed
                      ${
                        isUser
                          ? "bg-white text-slate-950"
                          : "bg-white/10 border border-white/10"
                      }`}
                  >
                    <MarkdownMessage text={m.text} />
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="flex justify-start">
                <div className="max-w-[78%] rounded-2xl px-4 py-3 bg-white/10 border border-white/10">
                  <span className="opacity-70">Typing…</span>
                </div>
              </div>
            )}
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
              className="flex-1 resize-none rounded-2xl bg-white/5 border border-white/10 px-4 py-3 outline-none focus:border-white/20"
            />
            <button
              onClick={send}
              disabled={sending}
              className="rounded-2xl bg-white text-slate-950 px-6 py-3 font-medium hover:opacity-90 disabled:opacity-60"
              type="button"
            >
              Send
            </button>
          </div>
          
        </div>
      </div>
    </div>
  );
}
