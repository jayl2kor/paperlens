"use client";

import { useRouter } from "next/navigation";
import { usePaperStore } from "@/stores/paperStore";

interface ToolbarProps {
  title: string;
}

export default function Toolbar({ title }: ToolbarProps) {
  const router = useRouter();
  const {
    currentPage,
    totalPages,
    scale,
    sidebarOpen,
    highlightsVisible,
    highlightsLoading,
    highlights,
    zoomIn,
    zoomOut,
    setCurrentPage,
    toggleSidebar,
    toggleHighlights,
  } = usePaperStore();

  const handlePageInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = parseInt((e.target as HTMLInputElement).value);
      if (value >= 1 && value <= totalPages) {
        setCurrentPage(value);
        // Scroll to the page
        const pageEl = document.querySelector(
          `[data-page-number="${value}"]`
        );
        pageEl?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <div className="h-12 flex items-center justify-between px-4 border-b border-foreground/10 bg-background shrink-0">
      {/* Left: back + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={() => router.push("/")}
          className="p-1.5 rounded hover:bg-foreground/10 transition-colors"
          title="홈으로"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
        <span className="font-medium truncate text-sm">{title}</span>
      </div>

      {/* Center: page navigation + zoom */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v)) setCurrentPage(v);
            }}
            onKeyDown={handlePageInput}
            className="w-12 text-center border border-foreground/20 rounded px-1 py-0.5 bg-transparent text-sm"
          />
          <span className="text-foreground/50">/ {totalPages}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            className="p-1.5 rounded hover:bg-foreground/10 transition-colors"
            title="축소"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 12H4"
              />
            </svg>
          </button>
          <span className="text-sm text-foreground/60 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="p-1.5 rounded hover:bg-foreground/10 transition-colors"
            title="확대"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Right: highlight toggle + sidebar toggle */}
      <div className="flex items-center gap-1">
        {/* Highlight toggle */}
        <button
          onClick={toggleHighlights}
          disabled={highlights.length === 0}
          className={`p-1.5 rounded transition-colors ${
            highlights.length === 0
              ? "text-foreground/20 cursor-not-allowed"
              : highlightsVisible
                ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                : "hover:bg-foreground/10 text-foreground/50"
          }`}
          title={
            highlightsLoading
              ? "하이라이트 로딩 중..."
              : highlightsVisible
                ? "하이라이트 숨기기"
                : "하이라이트 표시"
          }
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>

      <button
        onClick={toggleSidebar}
        className={`p-1.5 rounded transition-colors ${
          sidebarOpen
            ? "bg-foreground/10 text-foreground"
            : "hover:bg-foreground/10 text-foreground/50"
        }`}
        title="사이드바 토글"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 17V7m0 10h6m-6 0H4a1 1 0 01-1-1V8a1 1 0 011-1h5m6 10h5a1 1 0 001-1V8a1 1 0 00-1-1h-5"
          />
        </svg>
      </button>
      </div>
    </div>
  );
}
