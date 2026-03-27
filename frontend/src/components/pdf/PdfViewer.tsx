"use client";

import { useCallback, useMemo, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { usePaperStore } from "@/stores/paperStore";
import { getToken } from "@/lib/auth";
import HighlightLayer from "./HighlightLayer";
import TextSelectionPopover from "./TextSelectionPopover";
import FormulaPopover from "./FormulaPopover";
import CitationTooltip from "./CitationTooltip";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  fileUrl: string;
  paperId: number;
  structuredContent?: { pages: Array<{ blocks: Array<{ type: string; bbox: { x: number; y: number; w: number; h: number } }> }> } | null;
}

export default function PdfViewer({ fileUrl, paperId, structuredContent }: PdfViewerProps) {
  const { totalPages, scale, setCurrentPage, setTotalPages } =
    usePaperStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);

  // Pass auth header to PDF.js fetch
  const fileSource = useMemo(() => {
    const token = getToken();
    if (!token) return fileUrl;
    return { url: fileUrl, httpHeaders: { Authorization: `Bearer ${token}` } };
  }, [fileUrl]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setTotalPages(numPages);
      setCurrentPage(1);
    },
    [setTotalPages, setCurrentPage]
  );

  const handleScroll = useCallback(() => {
    // Throttle with requestAnimationFrame to avoid O(n) DOM queries per scroll event
    if (scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const container = containerRef.current;
      if (!container) return;

      const pages = container.querySelectorAll("[data-page-number]");
      let closestPage = 1;
      let closestDistance = Infinity;
      const containerTop = container.scrollTop + container.clientHeight / 3;

      pages.forEach((page) => {
        const el = page as HTMLElement;
        const distance = Math.abs(el.offsetTop - containerTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = parseInt(el.dataset.pageNumber || "1");
        }
      });

      const cur = usePaperStore.getState().currentPage;
      if (closestPage !== cur) {
        setCurrentPage(closestPage);
      }
    });
  }, [setCurrentPage]);

  return (
    <div
      ref={containerRef}
      className="min-w-0 overflow-auto bg-neutral-100 dark:bg-neutral-900 relative"
      style={{ flex: "1 1 60%" }}
      onScroll={handleScroll}
    >
      <Document
        file={fileSource}
        onLoadSuccess={onDocumentLoadSuccess}
        loading={
          <div className="flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        }
        error={
          <div className="flex items-center justify-center h-full text-red-500">
            PDF를 로드할 수 없습니다.
          </div>
        }
      >
        {Array.from(new Array(totalPages), (_, index) => (
          <div
            key={`page_${index + 1}`}
            className="flex justify-center py-2"
            data-page-number={index + 1}
          >
            <div className="relative">
              <Page
                pageNumber={index + 1}
                scale={scale}
                className="shadow-lg"
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
              <HighlightLayer pageNumber={index + 1} scale={scale} />
            </div>
          </div>
        ))}
      </Document>

      <TextSelectionPopover paperId={paperId} containerRef={containerRef} />
      <FormulaPopover paperId={paperId} containerRef={containerRef} structuredContent={structuredContent || null} />
      <CitationTooltip paperId={paperId} containerRef={containerRef} />
    </div>
  );
}
