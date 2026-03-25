"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { usePaperStore } from "@/stores/paperStore";
import {
  updateHighlight as apiUpdateHighlight,
  deleteHighlight as apiDeleteHighlight,
  getExportMarkdownUrl,
} from "@/lib/api";
import { DOT_CLASS } from "@/lib/highlightColors";

interface HighlightListPanelProps {
  paperId: number;
}

export default function HighlightListPanel({
  paperId,
}: HighlightListPanelProps) {
  const { userHighlights, updateUserHighlight, removeUserHighlight } =
    usePaperStore();
  const [editingNote, setEditingNote] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Group highlights by page (memoized)
  const { grouped, sortedPages } = useMemo(() => {
    const g = userHighlights.reduce(
      (acc, h) => {
        if (!acc[h.page]) acc[h.page] = [];
        acc[h.page].push(h);
        return acc;
      },
      {} as Record<number, typeof userHighlights>
    );
    const pages = Object.keys(g)
      .map(Number)
      .sort((a, b) => a - b);
    return { grouped: g, sortedPages: pages };
  }, [userHighlights]);

  const scrollToHighlight = useCallback((page: number) => {
    const pageEl = document.querySelector(`[data-page-number="${page}"]`);
    pageEl?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const startEditNote = useCallback(
    (id: number, currentNote: string | null) => {
      setEditingNote(id);
      setNoteText(currentNote || "");
      setSaveError(null);
      setTimeout(() => noteRef.current?.focus(), 50);
    },
    []
  );

  const saveNote = useCallback(
    async (id: number) => {
      try {
        const updated = await apiUpdateHighlight(paperId, id, {
          note: noteText || null,
        });
        updateUserHighlight(id, updated);
        setEditingNote(null);
        setSaveError(null);
      } catch (err) {
        console.error("Failed to save note:", err);
        setSaveError("저장에 실패했습니다");
      }
    },
    [paperId, noteText, updateUserHighlight]
  );

  const handleDelete = useCallback(
    async (id: number) => {
      if (!confirm("이 하이라이트를 삭제하시겠습니까?")) return;
      try {
        await apiDeleteHighlight(paperId, id);
        removeUserHighlight(id);
      } catch (err) {
        console.error("Failed to delete highlight:", err);
      }
    },
    [paperId, removeUserHighlight]
  );

  // Auto-resize textarea
  useEffect(() => {
    if (noteRef.current) {
      noteRef.current.style.height = "auto";
      noteRef.current.style.height = `${noteRef.current.scrollHeight}px`;
    }
  }, [noteText]);

  const isMac =
    typeof navigator !== "undefined" && navigator.platform.includes("Mac");
  const modLabel = isMac ? "Cmd" : "Ctrl";

  if (userHighlights.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-foreground/30 px-6">
        <svg
          className="w-12 h-12 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        <p className="text-sm text-center">
          PDF에서 텍스트를 선택한 후
          <br />
          &ldquo;하이라이트&rdquo; 버튼을 눌러보세요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-foreground/10 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
          하이라이트 ({userHighlights.length})
        </span>
        <a
          href={getExportMarkdownUrl(paperId)}
          download
          className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors flex items-center gap-1"
          title="Markdown으로 내보내기"
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
            />
          </svg>
          내보내기
        </a>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto">
        {sortedPages.map((page) => (
          <div key={page}>
            {/* Page header */}
            <div className="sticky top-0 bg-background/95 backdrop-blur-sm px-4 py-1.5 border-b border-foreground/5">
              <button
                onClick={() => scrollToHighlight(page)}
                className="text-xs font-medium text-foreground/40 hover:text-foreground/70 transition-colors"
              >
                {page} 페이지
              </button>
            </div>

            {/* Highlights for this page */}
            {grouped[page].map((h) => (
              <div
                key={h.id}
                className="group px-4 py-2.5 border-b border-foreground/5 hover:bg-foreground/5 transition-colors"
              >
                <div className="flex items-start gap-2">
                  {/* Color dot */}
                  <div
                    className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${DOT_CLASS[h.color] || DOT_CLASS.yellow}`}
                  />

                  {/* Text + note */}
                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => scrollToHighlight(h.page)}
                      className="text-sm text-foreground/80 text-left line-clamp-2 hover:text-foreground transition-colors"
                    >
                      &ldquo;{h.text}&rdquo;
                    </button>

                    {/* Note display / edit */}
                    {editingNote === h.id ? (
                      <div className="mt-1.5">
                        <textarea
                          ref={noteRef}
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                              saveNote(h.id);
                            }
                            if (e.key === "Escape") setEditingNote(null);
                          }}
                          placeholder="메모 입력..."
                          className="w-full text-xs bg-foreground/5 border border-foreground/10 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                          rows={2}
                        />
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={() => saveNote(h.id)}
                            className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                          >
                            저장
                          </button>
                          <span className="text-foreground/20 text-xs">
                            |
                          </span>
                          <button
                            onClick={() => setEditingNote(null)}
                            className="text-xs text-foreground/40 hover:text-foreground/60"
                          >
                            취소
                          </button>
                          <span className="text-foreground/20 text-[10px] ml-auto">
                            {modLabel}+Enter
                          </span>
                        </div>
                        {saveError && (
                          <p className="text-xs text-red-500 mt-1">
                            {saveError}
                          </p>
                        )}
                      </div>
                    ) : h.note ? (
                      <button
                        onClick={() => startEditNote(h.id, h.note)}
                        className="mt-1 text-xs text-foreground/50 text-left hover:text-foreground/70 transition-colors"
                      >
                        {h.note}
                      </button>
                    ) : null}
                  </div>

                  {/* Actions — always visible but subtle */}
                  <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => startEditNote(h.id, h.note)}
                      className="p-1 rounded hover:bg-foreground/10 hover:text-foreground/70"
                      aria-label="메모 편집"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="p-1 rounded hover:bg-red-500/10 hover:text-red-500"
                      aria-label="하이라이트 삭제"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
