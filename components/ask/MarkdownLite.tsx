"use client";

import { Fragment, type ReactNode } from "react";

/**
 * Tiny markdown renderer scoped to what the Ask AI model emits:
 * - paragraphs separated by blank lines
 * - `### heading` / `## heading` / `# heading`
 * - `- bullet` or `* bullet` lists
 * - inline `**bold**`, `*italic*`, `` `code` ``
 * - bare URLs (auto-linked)
 *
 * This is not a full CommonMark implementation. Anything fancier (tables,
 * fenced code, nested lists) renders as plain text. That's deliberate — the
 * popover is a chat bubble, not a document.
 */

interface MarkdownLiteProps {
  source: string;
}

interface Block {
  kind: "heading" | "paragraph" | "list";
  level?: 1 | 2 | 3;
  items?: string[];
  text?: string;
}

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  function flushParagraph() {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  }
  function flushList() {
    if (list.length === 0) return;
    blocks.push({ kind: "list", items: list });
    list = [];
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3,
        text: heading[2].trim(),
      });
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      list.push(bullet[1]);
      continue;
    }
    flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

const URL_RE = /\bhttps?:\/\/[^\s)\]]+/g;

function renderInline(text: string): ReactNode[] {
  // 1) Pull out backtick code spans first so their content isn't mangled.
  const codeSplit = text.split(/(`[^`]+`)/g);
  return codeSplit.map((chunk, i) => {
    if (chunk.startsWith("`") && chunk.endsWith("`") && chunk.length >= 2) {
      return (
        <code
          key={`c-${i}`}
          className="px-1 py-0.5 rounded bg-slate-900/10 text-[11px] font-mono"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={`f-${i}`}>{renderBoldItalicAndLinks(chunk, i)}</Fragment>;
  });
}

function renderBoldItalicAndLinks(text: string, scopeKey: number): ReactNode[] {
  // Split on **bold** first.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      out.push(
        <strong key={`b-${scopeKey}-${i}`} className="font-bold">
          {renderItalicAndLinks(part.slice(2, -2), `${scopeKey}-${i}`)}
        </strong>,
      );
    } else {
      for (const node of renderItalicAndLinks(part, `${scopeKey}-${i}`)) {
        out.push(node);
      }
    }
  });
  return out;
}

function renderItalicAndLinks(text: string, key: string): ReactNode[] {
  const parts = text.split(/(\*[^*]+\*)/g);
  const out: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2 && !part.startsWith("**")) {
      out.push(
        <em key={`i-${key}-${i}`} className="italic">
          {linkify(part.slice(1, -1), `${key}-${i}`)}
        </em>,
      );
    } else {
      for (const node of linkify(part, `${key}-${i}`)) {
        out.push(node);
      }
    }
  });
  return out;
}

function linkify(text: string, key: string): ReactNode[] {
  if (!URL_RE.test(text)) return [text];
  URL_RE.lastIndex = 0;
  const out: ReactNode[] = [];
  let last = 0;
  let idx = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    const url = match[0];
    out.push(
      <a
        key={`l-${key}-${idx++}`}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-indigo-700 hover:underline break-all"
      >
        {url}
      </a>,
    );
    last = match.index + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function MarkdownLite({ source }: MarkdownLiteProps) {
  const blocks = parseBlocks(source);
  return (
    <div className="space-y-2 text-[12px] leading-snug">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          const cls =
            block.level === 1
              ? "text-sm font-black uppercase tracking-tight mt-1"
              : block.level === 2
                ? "text-[12px] font-black uppercase tracking-tight mt-1"
                : "text-[11px] font-black uppercase tracking-wide text-slate-700 mt-1";
          return (
            <p key={i} className={cls}>
              {renderInline(block.text ?? "")}
            </p>
          );
        }
        if (block.kind === "list") {
          return (
            <ul key={i} className="space-y-1 pl-3">
              {(block.items ?? []).map((it, j) => (
                <li key={j} className="relative pl-3">
                  <span className="absolute left-0 top-1.5 w-1 h-1 rounded-full bg-current opacity-50" />
                  {renderInline(it)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            {renderInline(block.text ?? "")}
          </p>
        );
      })}
    </div>
  );
}
