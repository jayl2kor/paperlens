"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePaperStore } from "@/stores/paperStore";
import { streamSummary } from "@/lib/api";

// ── 섹션 카드 스타일 매핑 ────────────────────────────────────────────────

interface SectionStyle {
  icon: string;
  borderClass: string;
  bgClass: string;
  labelClass: string;
}

const SECTION_STYLES: { keyword: string; style: SectionStyle }[] = [
  {
    keyword: "요약",
    style: {
      icon: "💡",
      borderClass: "border-l-blue-500",
      bgClass: "bg-blue-500/5",
      labelClass: "text-blue-600 dark:text-blue-400",
    },
  },
  {
    keyword: "방법",
    style: {
      icon: "🔬",
      borderClass: "border-l-purple-500",
      bgClass: "bg-purple-500/5",
      labelClass: "text-purple-600 dark:text-purple-400",
    },
  },
  {
    keyword: "결과",
    style: {
      icon: "📊",
      borderClass: "border-l-emerald-500",
      bgClass: "bg-emerald-500/5",
      labelClass: "text-emerald-600 dark:text-emerald-400",
    },
  },
];

const DEFAULT_STYLE: SectionStyle = {
  icon: "📄",
  borderClass: "border-l-foreground/20",
  bgClass: "bg-foreground/3",
  labelClass: "text-foreground/60",
};

function getStyleForTitle(title: string): SectionStyle {
  for (const { keyword, style } of SECTION_STYLES) {
    if (title.includes(keyword)) return style;
  }
  return DEFAULT_STYLE;
}

// ── 마크다운 → 섹션 파싱 ─────────────────────────────────────────────────

interface Section {
  title: string;
  content: string;
  style: SectionStyle;
}

function parseSections(markdown: string): Section[] {
  const parts = markdown.split(/^## /m);
  const sections: Section[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const newlineIdx = trimmed.indexOf("\n");
    if (newlineIdx === -1) {
      // 제목만 있고 내용이 아직 없음 (스트리밍 중)
      const title = trimmed;
      sections.push({
        title,
        content: "",
        style: getStyleForTitle(title),
      });
    } else {
      const title = trimmed.slice(0, newlineIdx).trim();
      const content = trimmed.slice(newlineIdx + 1).trim();

      // ## 없이 시작하는 서문 텍스트
      if (sections.length === 0 && !markdown.trimStart().startsWith("## ")) {
        sections.push({ title: "", content: trimmed, style: DEFAULT_STYLE });
      } else {
        sections.push({
          title,
          content,
          style: getStyleForTitle(title),
        });
      }
    }
  }

  return sections;
}

// ── 섹션 카드 컴포넌트 ───────────────────────────────────────────────────

const PROSE_CLASSES =
  "prose prose-sm dark:prose-invert max-w-none text-foreground/80 " +
  "[&_p]:my-1.5 [&_ol]:pl-5 [&_ul]:pl-5 [&_li]:my-0.5 " +
  "[&_strong]:text-foreground [&_code]:text-xs [&_code]:bg-foreground/5 [&_code]:px-1 [&_code]:rounded";

function SectionCard({
  section,
  isLast,
  isStreaming,
}: {
  section: Section;
  isLast: boolean;
  isStreaming: boolean;
}) {
  const { title, content, style } = section;

  // 제목 없는 서문
  if (!title) {
    return (
      <div className={`rounded-lg border-l-3 p-3 mb-3 ${style.borderClass} ${style.bgClass}`}>
        <div className={PROSE_CLASSES}>
          <ReactMarkdown>{content}</ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border-l-3 p-3 mb-3 ${style.borderClass} ${style.bgClass}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm">{style.icon}</span>
        <span
          className={`text-xs font-semibold uppercase tracking-wide ${style.labelClass}`}
        >
          {title}
        </span>
      </div>
      {content && (
        <div className={PROSE_CLASSES}>
          <ReactMarkdown>{content}</ReactMarkdown>
          {isLast && isStreaming && (
            <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
          )}
        </div>
      )}
      {!content && isLast && isStreaming && (
        <div className="flex items-center gap-1.5 mt-1">
          <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce" />
          <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.15s]" />
          <span className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.3s]" />
        </div>
      )}
    </div>
  );
}

// ── SummaryPanel ─────────────────────────────────────────────────────────

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
      queueMicrotask(() => loadSummary());
    }
  }, [loadSummary]);

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sections = useMemo(() => parseSections(summary), [summary]);

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
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-foreground/50">
              논문을 분석하고 있습니다...
            </span>
          </div>
        )}

        {sections.length > 0 && (
          <div className="space-y-0">
            {sections.map((section, i) => (
              <SectionCard
                key={`${section.title}-${i}`}
                section={section}
                isLast={i === sections.length - 1}
                isStreaming={summaryLoading}
              />
            ))}
          </div>
        )}

        {/* ## 가 아직 없는 초기 스트리밍 텍스트 */}
        {summaryLoading && summary && sections.length === 0 && (
          <div className={`rounded-lg border-l-3 p-3 ${DEFAULT_STYLE.borderClass} ${DEFAULT_STYLE.bgClass}`}>
            <div className={PROSE_CLASSES}>
              <ReactMarkdown>{summary}</ReactMarkdown>
              <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
