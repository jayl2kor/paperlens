"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePaperStore } from "@/stores/paperStore";
import { streamSummary } from "@/lib/api";

interface SummaryPanelProps {
  paperId: number;
}

export default function SummaryPanel({ paperId }: SummaryPanelProps) {
  const {
    summary,
    summaryLoading,
    setSummary,
    appendSummary,
    setSummaryLoading,
  } = usePaperStore();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const requested = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadSummary = useCallback(async () => {
    if (summary || summaryLoading) return;

    setSummaryLoading(true);
    setError(null);

    await streamSummary(
      paperId,
      (chunk) => {
        appendSummary(chunk);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollTo({
            top: scrollRef.current.scrollHeight,
          });
        });
      },
      () => setSummaryLoading(false),
      (msg) => {
        setError(msg);
        setSummaryLoading(false);
      }
    );
  }, [paperId, summary, summaryLoading, setSummaryLoading, appendSummary]);

  useEffect(() => {
    if (!requested.current) {
      requested.current = true;
      // Defer to avoid synchronous setState-in-effect lint error
      queueMicrotask(() => loadSummary());
    }
  }, [loadSummary]);

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500">
          {error}
        </div>
        <button
          onClick={() => {
            setSummary("");
            requested.current = false;
            setError(null);
            loadSummary();
          }}
          className="mt-3 text-sm text-blue-500 hover:underline"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10">
        <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
          AI 요약
        </span>
        {summary && (
          <button
            onClick={handleCopy}
            className="text-xs px-2 py-1 rounded hover:bg-foreground/10 transition-colors text-foreground/60"
            title="요약 복사"
          >
            {copied ? "복사됨" : "복사"}
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4">
        {summaryLoading && !summary && (
          <div className="flex items-center gap-2 text-sm text-foreground/50">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            논문을 분석하고 있습니다...
          </div>
        )}

        {summary && (
          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 [&_h2]:text-foreground [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_ol]:pl-5 [&_ul]:pl-5 [&_li]:my-0.5 [&_p]:my-1.5">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        )}

        {summaryLoading && summary && (
          <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5" />
        )}
      </div>
    </div>
  );
}
