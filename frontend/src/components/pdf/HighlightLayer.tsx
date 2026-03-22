"use client";

import { useEffect, useState } from "react";
import { usePaperStore } from "@/stores/paperStore";
import { OVERLAY_BG, OVERLAY_BORDER } from "@/lib/highlightColors";
import type { UserHighlightItem } from "@/lib/api";

const AI_COLORS: Record<string, string> = {
  novelty: "rgba(59, 130, 246, 0.18)",
  method: "rgba(34, 197, 94, 0.18)",
  result: "rgba(249, 115, 22, 0.18)",
};

const AI_BORDER_COLORS: Record<string, string> = {
  novelty: "rgba(59, 130, 246, 0.5)",
  method: "rgba(34, 197, 94, 0.5)",
  result: "rgba(249, 115, 22, 0.5)",
};

const AI_LABELS: Record<string, string> = {
  novelty: "새로운 기여",
  method: "방법론",
  result: "결과",
};

interface HighlightLayerProps {
  pageNumber: number;
  scale: number;
}

function HoverTooltip({ children }: { children: React.ReactNode }) {
  return (
    <div className="hidden group-hover:block absolute left-0 bottom-full mb-1 z-50 pointer-events-none">
      <div className="bg-foreground text-background text-xs rounded-md px-2.5 py-1.5 max-w-60 shadow-lg whitespace-normal">
        {children}
      </div>
    </div>
  );
}

export default function HighlightLayer({
  pageNumber,
  scale,
}: HighlightLayerProps) {
  const { highlights, highlightsVisible, userHighlights } = usePaperStore();

  const pageAiHighlights = highlightsVisible
    ? highlights.filter((h) => h.page === pageNumber)
    : [];
  const pageUserHighlights = userHighlights.filter(
    (h) => h.page === pageNumber
  );

  if (pageAiHighlights.length === 0 && pageUserHighlights.length === 0)
    return null;

  // react-pdf renders at CSS 96 DPI, PyMuPDF bbox at PDF 72 DPI
  const DPI_RATIO = 96 / 72;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* AI auto-highlights */}
      {pageAiHighlights.map((h, i) => (
        <div
          key={`ai-${h.category}-${i}`}
          className="absolute pointer-events-auto cursor-pointer group"
          style={{
            left: h.bbox.x * scale * DPI_RATIO,
            top: h.bbox.y * scale * DPI_RATIO,
            width: h.bbox.w * scale * DPI_RATIO,
            height: h.bbox.h * scale * DPI_RATIO,
            backgroundColor: AI_COLORS[h.category] || AI_COLORS.novelty,
            borderLeft: `3px solid ${AI_BORDER_COLORS[h.category] || AI_BORDER_COLORS.novelty}`,
          }}
        >
          <HoverTooltip>
            <span className="font-semibold">
              {AI_LABELS[h.category] || h.category}
            </span>
            {h.reason && (
              <span className="text-background/70"> — {h.reason}</span>
            )}
          </HoverTooltip>
        </div>
      ))}

      {/* User highlights */}
      {pageUserHighlights.map((h) => (
        <UserHighlightMark
          key={`user-${h.id}`}
          highlight={h}
          scale={scale}
          pageNumber={pageNumber}
        />
      ))}
    </div>
  );
}

type Rect = { left: number; top: number; width: number; height: number };

function findHighlightRects(pageNumber: number, text: string): Rect[] {
  const pageEl = document.querySelector(
    `[data-page-number="${pageNumber}"] .textLayer`
  );
  if (!pageEl) return [];

  // Cache page rect once (avoids repeated layout queries)
  const pageContainer = pageEl
    .closest("[data-page-number]")
    ?.querySelector(".react-pdf__Page");
  if (!pageContainer) return [];
  const pageRect = pageContainer.getBoundingClientRect();

  const spans = pageEl.querySelectorAll("span");
  const searchText = text.toLowerCase();
  let accumulated = "";
  let startSpan: Element | null = null;

  for (const span of spans) {
    const spanText = span.textContent || "";
    if (!spanText.trim()) continue;

    if (!startSpan) {
      if (spanText.toLowerCase().includes(searchText)) {
        const rect = span.getBoundingClientRect();
        return [
          {
            left: rect.left - pageRect.left,
            top: rect.top - pageRect.top,
            width: rect.width,
            height: rect.height,
          },
        ];
      }
      if (searchText.startsWith(spanText.toLowerCase().trim())) {
        startSpan = span;
        accumulated = spanText.toLowerCase().trim();
      }
    } else {
      accumulated += spanText.toLowerCase().trim();
      if (accumulated.includes(searchText)) {
        const startRect = startSpan.getBoundingClientRect();
        const endRect = span.getBoundingClientRect();
        return [
          {
            left: Math.min(startRect.left, endRect.left) - pageRect.left,
            top: Math.min(startRect.top, endRect.top) - pageRect.top,
            width:
              Math.max(startRect.right, endRect.right) -
              Math.min(startRect.left, endRect.left),
            height:
              Math.max(startRect.bottom, endRect.bottom) -
              Math.min(startRect.top, endRect.top),
          },
        ];
      }
    }
  }

  return [];
}

function UserHighlightMark({
  highlight,
  scale,
  pageNumber,
}: {
  highlight: UserHighlightItem;
  scale: number;
  pageNumber: number;
}) {
  const bgColor = OVERLAY_BG[highlight.color] || OVERLAY_BG.yellow;
  const borderColor = OVERLAY_BORDER[highlight.color] || OVERLAY_BORDER.yellow;

  const [rects, setRects] = useState<Rect[]>([]);

  // DOM measurement must happen after render; defer setState via queueMicrotask
  // to satisfy the react-hooks/set-state-in-effect lint rule.
  useEffect(() => {
    queueMicrotask(() => {
      setRects(findHighlightRects(pageNumber, highlight.text));
    });
  }, [highlight.text, pageNumber, scale]);

  if (rects.length === 0) return null;

  return (
    <>
      {rects.map((r, i) => (
        <div
          key={i}
          className="absolute pointer-events-auto cursor-pointer group"
          style={{
            left: r.left,
            top: r.top,
            width: r.width,
            height: r.height,
            backgroundColor: bgColor,
            borderBottom: `2px solid ${borderColor}`,
          }}
        >
          {highlight.note && (
            <HoverTooltip>{highlight.note}</HoverTooltip>
          )}
        </div>
      ))}
    </>
  );
}
