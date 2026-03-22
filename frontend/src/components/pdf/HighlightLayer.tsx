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

/**
 * offsetLeft/offsetTop 기반으로 페이지 내 상대 좌표를 계산.
 * getBoundingClientRect()는 스크롤 위치에 따라 값이 변하므로 사용하지 않음.
 */
function getOffsetRelativeTo(
  el: HTMLElement,
  ancestor: HTMLElement
): { left: number; top: number } {
  let left = 0;
  let top = 0;
  let current: HTMLElement | null = el;
  while (current && current !== ancestor) {
    left += current.offsetLeft;
    top += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { left, top };
}

function findHighlightRects(pageNumber: number, text: string): Rect[] {
  const wrapper = document.querySelector(
    `[data-page-number="${pageNumber}"] .relative`
  );
  if (!wrapper) return [];

  const textLayer = wrapper.querySelector(".textLayer");
  if (!textLayer) return [];

  const spans = textLayer.querySelectorAll("span");
  const searchText = text.toLowerCase();
  const ancestor = wrapper as HTMLElement;

  // Strategy 1: full match in a single span
  for (const span of spans) {
    const spanText = span.textContent || "";
    if (!spanText.trim()) continue;
    if (spanText.toLowerCase().includes(searchText)) {
      const el = span as HTMLElement;
      const pos = getOffsetRelativeTo(el, ancestor);
      return [
        {
          left: pos.left,
          top: pos.top,
          width: el.offsetWidth,
          height: el.offsetHeight,
        },
      ];
    }
  }

  // Strategy 2: match across multiple spans
  let accumulated = "";
  let startSpan: HTMLElement | null = null;

  for (const span of spans) {
    const spanText = span.textContent || "";
    if (!spanText.trim()) continue;
    const el = span as HTMLElement;

    if (!startSpan) {
      if (searchText.startsWith(spanText.toLowerCase().trim())) {
        startSpan = el;
        accumulated = spanText.toLowerCase().trim();
      }
    } else {
      accumulated += spanText.toLowerCase().trim();
      if (accumulated.includes(searchText)) {
        const startPos = getOffsetRelativeTo(startSpan, ancestor);
        const endPos = getOffsetRelativeTo(el, ancestor);
        return [
          {
            left: Math.min(startPos.left, endPos.left),
            top: Math.min(startPos.top, endPos.top),
            width:
              Math.max(
                startPos.left + startSpan.offsetWidth,
                endPos.left + el.offsetWidth
              ) - Math.min(startPos.left, endPos.left),
            height:
              Math.max(
                startPos.top + startSpan.offsetHeight,
                endPos.top + el.offsetHeight
              ) - Math.min(startPos.top, endPos.top),
          },
        ];
      }
      // Reset if accumulated doesn't match prefix anymore
      if (!searchText.startsWith(accumulated)) {
        startSpan = null;
        accumulated = "";
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
