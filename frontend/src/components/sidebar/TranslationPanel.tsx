"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePaperStore } from "@/stores/paperStore";
import { streamTranslate, getPaper } from "@/lib/api";

interface TranslationPanelProps {
  paperId: number;
}

export default function TranslationPanel({ paperId }: TranslationPanelProps) {
  const {
    currentPage,
    totalPages,
    translations,
    translationLoading,
    appendTranslation,
    setTranslationLoading,
  } = usePaperStore();

  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedRef = useRef(false);

  // Load page texts from structured_content
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    getPaper(paperId).then((paper) => {
      const sc = paper.structured_content as {
        pages: Array<{ page_number: number; text: string }>;
      } | null;
      if (!sc?.pages) return;

      const texts: Record<number, string> = {};
      for (const page of sc.pages) {
        texts[page.page_number] = page.text;
      }
      setPageTexts(texts);
    });
  }, [paperId]);

  const translatePage = useCallback(
    async (page: number) => {
      const text = pageTexts[page];
      if (!text || translationLoading !== null) return;

      setError(null);
      setTranslationLoading(page);

      await streamTranslate(
        paperId,
        text,
        page,
        "ko",
        (chunk) => {
          appendTranslation(page, chunk);
          requestAnimationFrame(() => {
            scrollRef.current?.scrollTo({
              top: scrollRef.current.scrollHeight,
            });
          });
        },
        () => setTranslationLoading(null),
        (msg) => {
          setError(msg);
          setTranslationLoading(null);
        }
      );
    },
    [paperId, pageTexts, translationLoading, appendTranslation, setTranslationLoading]
  );

  const currentTranslation = translations[currentPage] || "";
  const isCurrentLoading = translationLoading === currentPage;
  const currentOriginal = pageTexts[currentPage] || "";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-foreground/10">
        <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
          번역 — {currentPage} / {totalPages} 페이지
        </span>
        {!currentTranslation && !isCurrentLoading && (
          <button
            onClick={() => translatePage(currentPage)}
            disabled={!currentOriginal}
            className="text-xs px-2.5 py-1 rounded-md bg-blue-500 text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            이 페이지 번역
          </button>
        )}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {/* No translation yet */}
        {!currentTranslation && !isCurrentLoading && !error && (
          <div className="flex flex-col items-center justify-center h-full text-foreground/30 px-4">
            <svg
              className="w-10 h-10 mb-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129"
              />
            </svg>
            <p className="text-sm text-center">
              &ldquo;이 페이지 번역&rdquo; 버튼을 눌러<br />
              현재 페이지를 한국어로 번역하세요
            </p>
          </div>
        )}

        {/* Loading */}
        {isCurrentLoading && !currentTranslation && (
          <div className="flex items-center gap-2 text-sm text-foreground/50 p-4">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            번역 중...
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="p-4">
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-500">
              {error}
            </div>
            <button
              onClick={() => {
                setError(null);
                translatePage(currentPage);
              }}
              className="mt-2 text-sm text-blue-500 hover:underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* Translation result — side by side paragraphs */}
        {currentTranslation && (
          <div className="p-4 space-y-4">
            {/* Original text (collapsed by default) */}
            <details className="group">
              <summary className="text-xs font-medium text-foreground/40 cursor-pointer hover:text-foreground/60 select-none">
                원문 보기
              </summary>
              <div className="mt-2 text-xs text-foreground/50 leading-relaxed whitespace-pre-wrap border-l-2 border-foreground/10 pl-3">
                {currentOriginal}
              </div>
            </details>

            {/* Translated text */}
            <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 [&_p]:my-1.5 [&_ul]:pl-5 [&_li]:my-0.5">
              <ReactMarkdown>{currentTranslation}</ReactMarkdown>
            </div>

            {isCurrentLoading && (
              <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5" />
            )}
          </div>
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-foreground/10">
        <button
          onClick={() => {
            const prev = Math.max(1, currentPage - 1);
            usePaperStore.getState().setCurrentPage(prev);
          }}
          disabled={currentPage <= 1}
          className="text-xs px-2 py-1 rounded hover:bg-foreground/10 disabled:opacity-30 transition-colors"
        >
          &larr; 이전
        </button>
        <div className="flex gap-1">
          {Object.keys(translations).map((p) => (
            <div
              key={p}
              className={`w-1.5 h-1.5 rounded-full ${
                parseInt(p) === currentPage
                  ? "bg-blue-500"
                  : "bg-foreground/20"
              }`}
              title={`${p}페이지 번역됨`}
            />
          ))}
        </div>
        <button
          onClick={() => {
            const next = Math.min(totalPages, currentPage + 1);
            usePaperStore.getState().setCurrentPage(next);
          }}
          disabled={currentPage >= totalPages}
          className="text-xs px-2 py-1 rounded hover:bg-foreground/10 disabled:opacity-30 transition-colors"
        >
          다음 &rarr;
        </button>
      </div>
    </div>
  );
}
