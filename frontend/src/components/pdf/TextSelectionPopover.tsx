"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePaperStore } from "@/stores/paperStore";
import { streamExplain } from "@/lib/api";

interface TextSelectionPopoverProps {
  paperId: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function TextSelectionPopover({
  paperId,
  containerRef,
}: TextSelectionPopoverProps) {
  const {
    selection,
    setSelection,
    explanation,
    explanationLoading,
    setExplanation,
    appendExplanation,
    setExplanationLoading,
    clearExplanation,
    setActiveTab,
    setSidebarOpen,
  } = usePaperStore();

  const [showActions, setShowActions] = useState(false);
  const [popoverPos, setPopoverPos] = useState({ x: 0, y: 0 });
  const [showExplanation, setShowExplanation] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const explanationRef = useRef<HTMLDivElement>(null);

  // Detect text selection on the PDF text layer
  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      return;
    }

    const selectedText = sel.toString().trim();
    if (selectedText.length < 3) return;

    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();

    // Find which page this selection is on
    const anchorNode = sel.anchorNode;
    const pageEl = anchorNode?.parentElement?.closest("[data-page-number]");
    const pageNum = pageEl
      ? parseInt((pageEl as HTMLElement).dataset.pageNumber || "1")
      : 1;

    // Get surrounding context (parent text content)
    const parentBlock = anchorNode?.parentElement?.closest(".textLayer");
    const context = parentBlock?.textContent?.slice(0, 500) || "";

    setSelection({
      text: selectedText,
      context,
      page: pageNum,
      rect: {
        x: rect.left - containerRect.left + container.scrollLeft,
        y: rect.top - containerRect.top + container.scrollTop,
        w: rect.width,
        h: rect.height,
      },
    });

    setPopoverPos({
      x: rect.left - containerRect.left + container.scrollLeft + rect.width / 2,
      y: rect.top - containerRect.top + container.scrollTop - 8,
    });

    setShowActions(true);
    setShowExplanation(false);
    setExplanation("");
  }, [containerRef, setSelection, setExplanation]);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setShowActions(false);
        setShowExplanation(false);
        clearExplanation();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [clearExplanation]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowActions(false);
        setShowExplanation(false);
        clearExplanation();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearExplanation]);

  // Attach mouseup listener to container
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("mouseup", handleMouseUp);
    return () => container.removeEventListener("mouseup", handleMouseUp);
  }, [containerRef, handleMouseUp]);

  const handleExplain = async () => {
    if (!selection) return;

    setShowExplanation(true);
    setExplanation("");
    setExplanationLoading(true);

    await streamExplain(
      paperId,
      selection.text,
      selection.context,
      "sentence",
      (chunk) => {
        appendExplanation(chunk);
        requestAnimationFrame(() => {
          explanationRef.current?.scrollTo({
            top: explanationRef.current.scrollHeight,
          });
        });
      },
      () => setExplanationLoading(false),
      (msg) => {
        setExplanationLoading(false);
        setExplanation(`오류: ${msg}`);
      }
    );
  };

  const handleTranslateSelection = () => {
    if (!selection) return;
    setActiveTab("translate");
    setSidebarOpen(true);
    setShowActions(false);
  };

  if (!showActions || !selection) return null;

  return (
    <div
      ref={popoverRef}
      className="absolute z-50"
      style={{
        left: popoverPos.x,
        top: popoverPos.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      {/* Action buttons */}
      {!showExplanation && (
        <div className="flex items-center gap-1 bg-foreground text-background rounded-lg shadow-xl px-1.5 py-1">
          <button
            onClick={handleExplain}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-background/20 transition-colors"
          >
            설명
          </button>
          <div className="w-px h-4 bg-background/20" />
          <button
            onClick={handleTranslateSelection}
            className="px-2.5 py-1 text-xs font-medium rounded hover:bg-background/20 transition-colors"
          >
            번역
          </button>
        </div>
      )}

      {/* Explanation popover */}
      {showExplanation && (
        <div className="w-80 max-h-72 bg-background border border-foreground/15 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/10">
            <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
              AI 설명
            </span>
            <button
              onClick={() => {
                setShowExplanation(false);
                setShowActions(false);
                clearExplanation();
              }}
              className="text-foreground/40 hover:text-foreground/70 text-sm"
            >
              &times;
            </button>
          </div>
          <div
            ref={explanationRef}
            className="overflow-auto max-h-56 p-3"
          >
            {explanationLoading && !explanation && (
              <div className="flex items-center gap-2 text-sm text-foreground/50">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                분석 중...
              </div>
            )}
            {explanation && (
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/80 text-sm [&_p]:my-1 [&_ul]:pl-4 [&_li]:my-0.5">
                <ReactMarkdown>{explanation}</ReactMarkdown>
              </div>
            )}
            {explanationLoading && explanation && (
              <span className="inline-block w-1.5 h-3.5 bg-blue-500 animate-pulse ml-0.5" />
            )}
          </div>
        </div>
      )}

      {/* Arrow pointing down */}
      {!showExplanation && (
        <div className="flex justify-center">
          <div className="w-2 h-2 bg-foreground rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}
