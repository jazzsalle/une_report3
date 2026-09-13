"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/** Markdown 렌더 (GFM 표·취소선 지원) — .md-body 스타일 */
export function MarkdownView({ source, className }: { source: string; className?: string }) {
  return (
    <div className={cn("md-body", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source || ""}</ReactMarkdown>
    </div>
  );
}
