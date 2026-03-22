"use client";

import { usePaperStore } from "@/stores/paperStore";

const COLORS: Record<string, string> = {
  novelty: "rgba(59, 130, 246, 0.18)", // blue
  method: "rgba(34, 197, 94, 0.18)", // green
  result: "rgba(249, 115, 22, 0.18)", // orange
};

const BORDER_COLORS: Record<string, string> = {
  novelty: "rgba(59, 130, 246, 0.5)",
  method: "rgba(34, 197, 94, 0.5)",
  result: "rgba(249, 115, 22, 0.5)",
};

const LABELS: Record<string, string> = {
  novelty: "새로운 기여",
  method: "방법론",
  result: "결과",
};

interface HighlightLayerProps {
  pageNumber: number;
  scale: number;
}

export default function HighlightLayer({
  pageNumber,
  scale,
}: HighlightLayerProps) {
  const { highlights, highlightsVisible } = usePaperStore();

  if (!highlightsVisible || highlights.length === 0) return null;

  const pageHighlights = highlights.filter((h) => h.page === pageNumber);
  if (pageHighlights.length === 0) return null;

  // react-pdf renders at CSS 96 DPI, PyMuPDF bbox at PDF 72 DPI
  const DPI_RATIO = 96 / 72;

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      {pageHighlights.map((h, i) => (
        <div
          key={`${h.category}-${i}`}
          className="absolute pointer-events-auto cursor-pointer group"
          style={{
            left: h.bbox.x * scale * DPI_RATIO,
            top: h.bbox.y * scale * DPI_RATIO,
            width: h.bbox.w * scale * DPI_RATIO,
            height: h.bbox.h * scale * DPI_RATIO,
            backgroundColor: COLORS[h.category] || COLORS.novelty,
            borderLeft: `3px solid ${BORDER_COLORS[h.category] || BORDER_COLORS.novelty}`,
          }}
        >
          {/* Tooltip on hover */}
          <div className="hidden group-hover:block absolute left-0 bottom-full mb-1 z-50 pointer-events-none">
            <div className="bg-foreground text-background text-xs rounded-md px-2.5 py-1.5 max-w-60 shadow-lg whitespace-normal">
              <span className="font-semibold">
                {LABELS[h.category] || h.category}
              </span>
              {h.reason && (
                <span className="text-background/70"> — {h.reason}</span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
