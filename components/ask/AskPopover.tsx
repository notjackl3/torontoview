"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Send, X, ExternalLink, Sparkles, Trash2 } from "lucide-react";
import type { AskContextBundle } from "@/lib/askContext";
import {
  type AskMessage,
  appendMessage,
  clearConversation,
  loadConversation,
} from "@/lib/askConversations";
import MarkdownLite from "./MarkdownLite";

interface AskPopoverProps {
  anchorRect: DOMRect;
  context: AskContextBundle;
  selectedText: string;
  recompileContext: () => Promise<AskContextBundle | null>;
  onClose: () => void;
}

const POPOVER_WIDTH = 380;
const POPOVER_MAX_HEIGHT = 520;

function buildingIdForConversation(ctx: AskContextBundle): string {
  return ctx.buildings[ctx.buildings.length - 1]?.id ?? "default";
}

function computePosition(rect: DOMRect): { top: number; left: number } {
  const padding = 8;
  let left = rect.right + padding;
  if (left + POPOVER_WIDTH > window.innerWidth - padding) {
    left = Math.max(padding, rect.left - POPOVER_WIDTH - padding);
  }
  if (left < padding) left = padding;

  let top = rect.top;
  if (top + POPOVER_MAX_HEIGHT > window.innerHeight - padding) {
    top = Math.max(padding, window.innerHeight - POPOVER_MAX_HEIGHT - padding);
  }
  if (top < padding) top = padding;
  return { top, left };
}

export default function AskPopover({
  anchorRect,
  context,
  selectedText,
  recompileContext,
  onClose,
}: AskPopoverProps) {
  const conversationKey = buildingIdForConversation(context);
  const [messages, setMessages] = useState<AskMessage[]>(() => {
    const conv = loadConversation(conversationKey);
    return conv.messages;
  });
  const [input, setInput] = useState("");
  const [useExternal, setUseExternal] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [position, setPosition] = useState(() => computePosition(anchorRect));
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setPosition(computePosition(anchorRect));
  }, [anchorRect]);

  useEffect(() => {
    function onResize() {
      setPosition(computePosition(anchorRect));
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-ask-popover]")) return;
      if (target?.closest("[data-ask-chip]")) return;
      onClose();
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [anchorRect, onClose]);

  useEffect(() => {
    // Scroll to bottom whenever messages change.
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages.length, isSending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const placeholderHint = useMemo(() => {
    const title = context.panel.title;
    return `Ask about “${selectedText.slice(0, 40)}${selectedText.length > 40 ? "…" : ""}” in ${title}…`;
  }, [context.panel.title, selectedText]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setError(null);
    const userMsg: AskMessage = {
      role: "user",
      content: trimmed,
      scope: context.panel.id,
      selectedText,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    appendMessage(conversationKey, userMsg);
    setInput("");
    setIsSending(true);

    try {
      // Recompile context so it reflects the latest page state at send time.
      const freshContext = (await recompileContext()) ?? context;
      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          context: { ...freshContext, selectedText },
          useExternal,
          history,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as {
        answer: string;
        sources: Array<{ title: string; url: string }>;
        usedExternal: boolean;
        externalUnavailableReason?: string;
      };
      const reply: AskMessage = {
        role: "assistant",
        content: data.answer,
        scope: context.panel.id,
        sources: data.sources,
        usedExternal: data.usedExternal,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, reply]);
      appendMessage(conversationKey, reply);
      if (useExternal && !data.usedExternal && data.externalUnavailableReason) {
        setError(data.externalUnavailableReason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setIsSending(false);
    }
  }

  function handleClear() {
    clearConversation(conversationKey);
    setMessages([]);
    setError(null);
  }

  return (
    <div
      data-ask-popover
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: POPOVER_WIDTH,
        maxHeight: POPOVER_MAX_HEIGHT,
        zIndex: 10000,
      }}
      className="flex flex-col bg-white rounded-xl shadow-2xl border border-slate-900/15 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-900/10 bg-slate-50">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-indigo-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-700 truncate">
              Ask · {context.panel.title}
            </p>
            <p className="text-[9px] text-slate-500 truncate" title={selectedText}>
              “{selectedText}”
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleClear}
            title="Clear conversation"
            className="p-1 rounded hover:bg-slate-900/8 text-slate-500"
            disabled={messages.length === 0}
          >
            <Trash2 size={12} />
          </button>
          <button
            onClick={onClose}
            title="Close"
            className="p-1 rounded hover:bg-slate-900/8 text-slate-500"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3 custom-scrollbar"
        style={{ maxHeight: POPOVER_MAX_HEIGHT - 130 }}
      >
        {messages.length === 0 && (
          <div className="text-[11px] text-slate-500 leading-relaxed bg-slate-50 rounded-md p-2.5 border border-slate-900/10">
            Ask anything about this metric — e.g. <em>“What does this mean for my business?”</em>{" "}
            or <em>“What should I do next?”</em> Toggle <strong>External</strong> to pull
            cheap web research alongside your internal data.
          </div>
        )}
        {messages.map((m, i) => (
          <MessageBubble key={`${m.timestamp}-${i}`} message={m} />
        ))}
        {isSending && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            Thinking…
          </div>
        )}
        {error && (
          <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-md p-2">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-slate-900/10 p-2 bg-white">
        <div className="flex items-center justify-between mb-1.5">
          <label className="inline-flex items-center gap-1.5 text-[10px] text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useExternal}
              onChange={(e) => setUseExternal(e.target.checked)}
              className="accent-indigo-500"
            />
            <Globe size={11} className={useExternal ? "text-indigo-600" : "text-slate-400"} />
            <span className="font-bold">External research</span>
          </label>
          <span className="text-[9px] text-slate-400">
            {context.buildings.length > 0
              ? `${context.buildings.length} site${context.buildings.length === 1 ? "" : "s"} in context`
              : "No building placed"}
          </span>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={placeholderHint}
            rows={2}
            className="flex-1 resize-none text-[12px] px-2 py-1.5 rounded-md border border-slate-900/15 focus:border-indigo-500 focus:outline-none placeholder:text-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Send (Enter)"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: AskMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[88%] text-[12px] leading-snug rounded-lg px-2.5 py-1.5 ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-slate-100 text-slate-900 border border-slate-900/10"
        }`}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        ) : (
          <MarkdownLite source={message.content} />
        )}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-slate-900/10 space-y-1">
            <p className="text-[9px] uppercase tracking-wide font-bold text-slate-500">
              Sources
            </p>
            {message.sources.map((s, i) => (
              <a
                key={s.url + i}
                href={s.url}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 text-[10px] text-indigo-700 hover:underline"
              >
                <ExternalLink size={9} />
                <span className="truncate">
                  [{i + 1}] {s.title}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
