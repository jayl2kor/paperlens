"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { getFormulaLatex } from "@/lib/api";
import { usePaperStore } from "@/stores/paperStore";

interface FormulaPopoverProps {
  paperId: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  structuredContent: { pages: Array<{ blocks: Array<{ type: string; bbox: { x: number; y: number; w: number; h: number } }> }> } | null;
}

interface FormulaState {
  latex: string;
  loading: boolean;
  error: string | null;
  position: { x: number; y: number };
}

export default function FormulaPopover({
  paperId,
  containerRef,
  structuredContent,
}: FormulaPopoverProps) {
  const { scale } = usePaperStore();
  const [formula, setFormula] = useState<FormulaState | null>(null);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const renderedRef = useRef<HTMLDivElement>(null);

  // Detect clicks on image blocks (potential formulas)
  const handleClick = useCallback(
    async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const container = containerRef.current;
      if (!container || !structuredContent) return;

      // Check if clicking on a highlight or popover — ignore those
      if (target.closest("[data-formula-popover]")) return;

      // Find the page element
      const pageEl = target.closest("[data-page-number]");
      if (!pageEl) return;
      const pageNum = parseInt((pageEl as HTMLElement).dataset.pageNumber || "1");

      // Get click position relative to the page's PDF coordinate space
      const pageCanvas = pageEl.querySelector("canvas");
      if (!pageCanvas) return;
      const canvasRect = pageCanvas.getBoundingClientRect();

      const pdfX = (e.clientX - canvasRect.left) / scale;
      const pdfY = (e.clientY - canvasRect.top) / scale;

      // Find if click is inside any image block on this page
      const pageData = structuredContent.pages[pageNum - 1];
      if (!pageData) return;

      const clickedBlock = pageData.blocks.find((block) => {
        if (block.type !== "image") return false;
        const { x, y, w, h } = block.bbox;
        return pdfX >= x && pdfX <= x + w && pdfY >= y && pdfY <= y + h;
      });

      if (!clickedBlock) return;

      const containerRect = container.getBoundingClientRect();
      setFormula({
        latex: "",
        loading: true,
        error: null,
        position: {
          x: e.clientX - containerRect.left + container.scrollLeft,
          y: e.clientY - containerRect.top + container.scrollTop - 10,
        },
      });

      try {
        const result = await getFormulaLatex(
          paperId,
          pageNum,
          clickedBlock.bbox
        );
        setFormula((prev) =>
          prev ? { ...prev, latex: result.latex, loading: false } : null
        );
      } catch {
        setFormula((prev) =>
          prev
            ? { ...prev, loading: false, error: "수식 추출에 실패했습니다." }
            : null
        );
      }
    },
    [containerRef, paperId, scale, structuredContent]
  );

  // Render KaTeX when latex changes
  useEffect(() => {
    if (!formula?.latex || !renderedRef.current) return;
    try {
      katex.render(formula.latex, renderedRef.current, {
        throwOnError: false,
        displayMode: true,
      });
    } catch {
      // KaTeX render error — show raw latex
    }
  }, [formula?.latex]);

  // Attach click listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, handleClick]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setFormula(null);
        setCopied(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFormula(null);
        setCopied(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleCopy = () => {
    if (!formula?.latex) return;
    navigator.clipboard.writeText(formula.latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!formula) return null;

  return (
    <div
      ref={popoverRef}
      data-formula-popover
      className="absolute z-50"
      style={{
        left: formula.position.x,
        top: formula.position.y,
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="bg-background border border-foreground/15 rounded-xl shadow-2xl overflow-hidden min-w-64 max-w-96">
        <div className="flex items-center justify-between px-3 py-2 border-b border-foreground/10">
          <span className="text-xs font-medium text-foreground/50 uppercase tracking-wide">
            LaTeX 수식
          </span>
          <div className="flex items-center gap-1">
            {formula.latex && (
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-0.5 rounded hover:bg-foreground/10 transition-colors text-foreground/60"
              >
                {copied ? "복사됨" : "Copy LaTeX"}
              </button>
            )}
            <button
              onClick={() => {
                setFormula(null);
                setCopied(false);
              }}
              className="text-foreground/40 hover:text-foreground/70 text-sm ml-1"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-3">
          {formula.loading && (
            <div className="flex items-center gap-2 text-sm text-foreground/50">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              수식 추출 중...
            </div>
          )}

          {formula.error && (
            <div className="text-sm text-red-500">{formula.error}</div>
          )}

          {formula.latex && (
            <div className="space-y-2">
              {/* KaTeX rendered */}
              <div
                ref={renderedRef}
                className="overflow-x-auto py-2 text-center"
              />
              {/* Raw LaTeX */}
              <div className="bg-foreground/5 rounded-md px-2.5 py-1.5 font-mono text-xs text-foreground/70 break-all select-all">
                {formula.latex}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
