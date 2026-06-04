"use client";

import { motion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

interface CodeBlockProps {
  filename?: string;
  language?: string;
  code: string;
  highlightLines?: number[];
  className?: string;
}

export function CodeBlock({
  filename,
  language = "ts",
  code,
  highlightLines = [],
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");

  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elev)] shadow-2xl shadow-black/30",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[oklch(0.15_0.012_264)] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[oklch(0.7_0.2_25)]" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-[oklch(0.82_0.16_75)]" aria-hidden />
          <span className="h-3 w-3 rounded-full bg-[oklch(0.78_0.18_145)]" aria-hidden />
          {filename && (
            <span className="ml-3 font-mono text-[12.5px] text-[var(--color-fg-muted)]">
              {filename}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--color-fg-dim)]">
            {language}
          </span>
          <button
            type="button"
            onClick={copy}
            aria-label="Copy code"
            className="cursor-pointer rounded-md p-1.5 text-[var(--color-fg-muted)] transition-colors hover:bg-white/5 hover:text-[var(--color-fg)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {copied ? <Check className="h-4 w-4 text-[var(--color-green)]" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13.5px] leading-relaxed">
        <code>
          {lines.map((line, i) => {
            const lineNum = i + 1;
            const highlighted = highlightLines.includes(lineNum);
            const tokens = tokenize(line, language);
            return (
              <div
                key={lineNum}
                className={cn(
                  "-mx-5 px-5",
                  highlighted &&
                    "bg-[oklch(0.6_0.22_200_/_0.08)] border-l-2 border-[var(--color-accent)] -ml-5 pl-[18px]",
                )}
              >
                <span className="mr-4 inline-block w-6 select-none text-right text-[var(--color-fg-dim)]">
                  {lineNum}
                </span>
                {tokens.map((token, idx) => (
                  <span
                    key={idx}
                    style={token.color ? { color: COLORS[token.color] } : undefined}
                  >
                    {token.text}
                  </span>
                ))}
              </div>
            );
          })}
        </code>
      </pre>
    </motion.div>
  );
}

type TokenColor = "comment" | "string" | "keyword" | "literal" | "type" | "number" | "shell";

const COLORS: Record<TokenColor, string> = {
  comment: "oklch(0.5 0.012 264)",
  string: "oklch(0.78 0.16 145)",
  keyword: "oklch(0.75 0.16 280)",
  literal: "oklch(0.82 0.16 75)",
  type: "oklch(0.78 0.2 200)",
  number: "oklch(0.82 0.16 75)",
  shell: "oklch(0.78 0.2 200)",
};

interface Token {
  text: string;
  color?: TokenColor;
}

const TS_KEYWORDS = new Set([
  "import",
  "from",
  "export",
  "const",
  "let",
  "var",
  "function",
  "return",
  "async",
  "await",
  "new",
  "if",
  "else",
  "for",
  "of",
  "in",
  "as",
  "type",
  "interface",
  "class",
  "extends",
  "implements",
]);

const LITERALS = new Set(["true", "false", "null", "undefined"]);

function tokenize(line: string, language: string): Token[] {
  if (language === "sh") return tokenizeShell(line);
  return tokenizeJs(line);
}

function tokenizeJs(line: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    const ch = line[i] ?? "";

    // Line comment
    if (ch === "/" && line[i + 1] === "/") {
      out.push({ text: line.slice(i), color: "comment" });
      return out;
    }

    // String literal — handle ", ', and `
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      let end = i + 1;
      while (end < n && line[end] !== quote) {
        if (line[end] === "\\") end += 2;
        else end += 1;
      }
      end = Math.min(end + 1, n);
      out.push({ text: line.slice(i, end), color: "string" });
      i = end;
      continue;
    }

    // Identifier / keyword / literal / type
    if (/[A-Za-z_$]/.test(ch)) {
      let end = i;
      while (end < n && /[A-Za-z0-9_$]/.test(line[end] ?? "")) end++;
      const word = line.slice(i, end);
      let color: TokenColor | undefined;
      if (TS_KEYWORDS.has(word)) color = "keyword";
      else if (LITERALS.has(word)) color = "literal";
      else if (/^[A-Z]/.test(word)) color = "type";
      out.push(color ? { text: word, color } : { text: word });
      i = end;
      continue;
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let end = i;
      while (end < n && /[0-9._]/.test(line[end] ?? "")) end++;
      out.push({ text: line.slice(i, end), color: "number" });
      i = end;
      continue;
    }

    // Punctuation / whitespace — group consecutive non-token chars into one span.
    let end = i + 1;
    while (end < n) {
      const next = line[end] ?? "";
      if (/[A-Za-z0-9_$"'`/]/.test(next)) break;
      end++;
    }
    out.push({ text: line.slice(i, end) });
    i = end;
  }

  return out;
}

function tokenizeShell(line: string): Token[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("#")) {
    return [{ text: line, color: "comment" }];
  }
  if (trimmed.startsWith("$")) {
    const leading = line.length - trimmed.length;
    const out: Token[] = [];
    if (leading > 0) out.push({ text: line.slice(0, leading) });
    out.push({ text: "$", color: "shell" });
    out.push(...tokenizeJs(line.slice(leading + 1)));
    return out;
  }
  return tokenizeJs(line);
}
