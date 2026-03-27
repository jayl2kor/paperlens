"use client";

import { useRouter } from "next/navigation";
import { usePaperStore } from "@/stores/paperStore";

interface ToolbarProps {
  title: string;
  onSettingsClick?: () => void;
}

export default function Toolbar({ title, onSettingsClick }: ToolbarProps) {
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
          className="p-2.5 -m-1 rounded hover:bg-foreground/10 transition-colors"
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
            className="p-2.5 -m-1 rounded hover:bg-foreground/10 transition-colors"
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
            className="p-2.5 -m-1 rounded hover:bg-foreground/10 transition-colors"
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

      {/* Right: settings + highlight toggle + sidebar toggle */}
      <div className="flex items-center gap-1">
        {/* Settings */}
        {onSettingsClick && (
          <button
            onClick={onSettingsClick}
            className="p-1.5 rounded hover:bg-foreground/10 text-foreground/50 transition-colors"
            title="설정 (⌘,)"
            aria-label="설정"
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
                strokeWidth={1.5}
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7 7 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        )}

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
