"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePaperStore } from "@/stores/paperStore";
import { getCitations } from "@/lib/api";
import type { CitationItem } from "@/lib/api";

interface CitationTooltipProps {
  paperId: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export default function CitationTooltip({
  paperId,
  containerRef,
}: CitationTooltipProps) {
  const { citations, citationsLoading, setCitations, setCitationsLoading } =
    usePaperStore();

  const [activeCitation, setActiveCitation] = useState<CitationItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const citationsRequested = useRef(false);
  // Store pending citation number when loading is in progress
  const pendingCitNum = useRef<number | null>(null);

  const loadCitations = useCallback(async () => {
    if (citationsLoading || citationsRequested.current) return;
    citationsRequested.current = true;
    setCitationsLoading(true);
    try {
      const res = await getCitations(paperId);
      setCitations(res.citations);
      return res.citations;
    } catch {
      return [];
    } finally {
      setCitationsLoading(false);
    }
  }, [paperId, citationsLoading, setCitations, setCitationsLoading]);

  // When citations finish loading, resolve the pending citation click
  useEffect(() => {
    if (pendingCitNum.current !== null && citations.length > 0) {
      const found = citations.find((c) => c.number === pendingCitNum.current);
      pendingCitNum.current = null;
      if (found) {
        setActiveCitation(found);
      }
    }
  }, [citations]);

  const handleClick = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target || !containerRef.current) return;

      const text = target.textContent?.trim() || "";
      const match = text.match(/^\[(\d{1,3})\]$/);
      if (!match) {
        setActiveCitation(null);
        return;
      }

      const citNum = parseInt(match[1]);

      // Position tooltip near the click
      const containerRect = containerRef.current.getBoundingClientRect();
      const scrollTop = containerRef.current.scrollTop;
      setTooltipPos({
        x: e.clientX - containerRect.left,
        y: e.clientY - containerRect.top + scrollTop,
      });

      if (citations.length > 0) {
        const found = citations.find((c) => c.number === citNum);
        setActiveCitation(found || null);
      } else {
        // Citations not loaded yet — store pending number and trigger load
        pendingCitNum.current = citNum;
        setActiveCitation(null);
        loadCitations();
      }
    },
    [citations, containerRef, loadCitations]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.addEventListener("click", handleClick);
    return () => container.removeEventListener("click", handleClick);
  }, [containerRef, handleClick]);

  // Dismiss on outside click (only when tooltip is visible)
  useEffect(() => {
    if (!activeCitation) return;
    const handleOutside = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setActiveCitation(null);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [activeCitation]);

  // Dismiss on Escape (only when tooltip is visible)
  useEffect(() => {
    if (!activeCitation && !citationsLoading) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveCitation(null);
        pendingCitNum.current = null;
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [activeCitation, citationsLoading]);

  const showLoading = citationsLoading && pendingCitNum.current !== null;

  if (!activeCitation && !showLoading) return null;

  return (
    <div
      ref={tooltipRef}
      className="absolute z-50 w-72 rounded-lg border border-foreground/15 bg-background shadow-xl p-3"
      style={{
        left: `${tooltipPos.x}px`,
        top: `${tooltipPos.y + 8}px`,
        transform: "translateX(-50%)",
      }}
    >
      {showLoading ? (
        <div className="flex items-center gap-2 text-xs text-foreground/50">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          인용 정보를 불러오는 중...
        </div>
      ) : activeCitation ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-blue-500">
              [{activeCitation.number}]
            </span>
            <button
              onClick={() => setActiveCitation(null)}
              className="ml-auto text-foreground/30 hover:text-foreground/60 text-xs"
            >
              &times;
            </button>
          </div>
          <p className="text-xs text-foreground/50 mb-1.5 line-clamp-3">
            {activeCitation.raw_text}
          </p>
          <p className="text-xs text-foreground/80">{activeCitation.summary}</p>
        </>
      ) : null}
    </div>
  );
}
