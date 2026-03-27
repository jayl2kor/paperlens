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

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {/* AI auto-highlights — bbox는 PDF 72 DPI 좌표, react-pdf도 동일 좌표계 */}
      {pageAiHighlights.map((h, i) => (
        <div
          key={`ai-${h.category}-${i}`}
          className="absolute pointer-events-auto cursor-pointer group"
          style={{
            left: h.bbox.x * scale,
            top: h.bbox.y * scale,
            width: h.bbox.w * scale,
            height: h.bbox.h * scale,
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

  const spans = Array.from(textLayer.querySelectorAll("span")).filter(
    (s) => (s.textContent || "").trim().length > 0
  );
  const searchText = text.toLowerCase().replace(/\s+/g, " ").trim();
  const ancestor = wrapper as HTMLElement;

  // Strategy 1: full match in a single span
  for (const span of spans) {
    const spanText = (span.textContent || "").toLowerCase();
    if (spanText.includes(searchText)) {
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

  // Strategy 2: normalize all text, find match, map back to spans.
  // PDF spans may split "Table 1" into ["Table", "1"] — normalize spaces to match.
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const normalizedSearch = normalize(searchText);

  // Build a mapping: for each span, track its start position in the normalized full text
  const spanMeta: { el: HTMLElement; start: number; end: number }[] = [];
  let pos = 0;
  for (const span of spans) {
    const raw = span.textContent || "";
    const norm = normalize(raw);
    spanMeta.push({ el: span as HTMLElement, start: pos, end: pos + norm.length });
    pos += norm.length;
  }

  const fullNormalized = spanMeta.map((_, i) => normalize(spans[i].textContent || "")).join("");
  const matchIdx = fullNormalized.indexOf(normalizedSearch);
  if (matchIdx === -1) return [];

  const matchEnd = matchIdx + normalizedSearch.length;
  const matchedSpans: HTMLElement[] = spanMeta
    .filter((m) => m.end > matchIdx && m.start < matchEnd)
    .map((m) => m.el);

  if (matchedSpans.length === 0) return [];

  // Group matched spans by line (similar y-position, within 3px tolerance)
  const lineGroups: HTMLElement[][] = [];
  for (const el of matchedSpans) {
    const pos = getOffsetRelativeTo(el, ancestor);
    const lastGroup = lineGroups[lineGroups.length - 1];
    if (lastGroup) {
      const lastPos = getOffsetRelativeTo(lastGroup[0], ancestor);
      if (Math.abs(pos.top - lastPos.top) < 3) {
        lastGroup.push(el);
        continue;
      }
    }
    lineGroups.push([el]);
  }

  // Merge each line group into one rect
  return lineGroups.map((group) => {
    let minLeft = Infinity;
    let minTop = Infinity;
    let maxRight = 0;
    let maxBottom = 0;

    for (const el of group) {
      const pos = getOffsetRelativeTo(el, ancestor);
      minLeft = Math.min(minLeft, pos.left);
      minTop = Math.min(minTop, pos.top);
      maxRight = Math.max(maxRight, pos.left + el.offsetWidth);
      maxBottom = Math.max(maxBottom, pos.top + el.offsetHeight);
    }

    return {
      left: minLeft,
      top: minTop,
      width: maxRight - minLeft,
      height: maxBottom - minTop,
    };
  });
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

  // textLayer renders asynchronously — retry until spans appear
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 10;
    const tryFind = () => {
      const found = findHighlightRects(pageNumber, highlight.text);
      if (found.length > 0 || attempts >= maxAttempts) {
        setRects(found);
        return;
      }
      attempts++;
      setTimeout(tryFind, 200);
    };
    const timer = setTimeout(tryFind, 100);
    return () => clearTimeout(timer);
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
