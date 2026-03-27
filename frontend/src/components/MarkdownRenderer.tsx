"use client";

import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

const PROSE =
  "prose prose-sm dark:prose-invert max-w-none text-foreground/80 leading-relaxed " +
  // Paragraphs
  "[&_p]:my-2 " +
  // Lists
  "[&_ul]:pl-5 [&_ul]:my-2 [&_ul]:list-disc " +
  "[&_ol]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal " +
  "[&_li]:my-1 [&_li]:leading-relaxed " +
  // Bold / emphasis
  "[&_strong]:text-foreground [&_strong]:font-semibold " +
  // Inline code
  "[&_code]:text-xs [&_code]:bg-foreground/8 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono " +
  // Code blocks
  "[&_pre]:bg-foreground/5 [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  // KaTeX math blocks
  "[&_.katex-display]:my-3 [&_.katex-display]:overflow-x-auto [&_.katex-display]:text-sm " +
  "[&_.katex]:text-[0.9em] " +
  // Headings inside content (h3, h4)
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 " +
  "[&_h4]:text-xs [&_h4]:font-semibold [&_h4]:mt-2 [&_h4]:mb-1 " +
  // Horizontal rules
  "[&_hr]:my-3 [&_hr]:border-foreground/10 " +
  // Tables
  "[&_table]:text-xs [&_table]:w-full [&_th]:text-left [&_th]:px-2 [&_th]:py-1 [&_th]:border-b [&_th]:border-foreground/15 " +
  "[&_td]:px-2 [&_td]:py-1 [&_td]:border-b [&_td]:border-foreground/5";

interface Props {
  children: string;
  className?: string;
}

export default function MarkdownRenderer({ children, className }: Props) {
  return (
    <div className={`${PROSE} ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
