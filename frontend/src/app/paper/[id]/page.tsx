"use client";

import { use, useEffect, useState } from "react";
import {
  type PaperDetailResponse,
  getPaper,
  getPaperFileUrl,
  getAutoHighlights,
} from "@/lib/api";
import PdfViewer from "@/components/pdf/PdfViewer";
import Toolbar from "@/components/pdf/Toolbar";
import Sidebar from "@/components/sidebar/Sidebar";
import { usePaperStore } from "@/stores/paperStore";

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [paper, setPaper] = useState<PaperDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { setHighlights, setHighlightsLoading, resetAiState } =
    usePaperStore();

  // Reset AI state when paper changes
  useEffect(() => {
    resetAiState();
  }, [id, resetAiState]);

  useEffect(() => {
    getPaper(parseInt(id))
      .then(setPaper)
      .catch(() => setError("논문을 찾을 수 없습니다."));
  }, [id]);

  // Load auto-highlights when paper is ready
  useEffect(() => {
    if (!paper) return;

    setHighlightsLoading(true);
    getAutoHighlights(paper.id)
      .then((res) => setHighlights(res.highlights))
      .catch(() => {
        // Silently fail — highlights are non-critical
      })
      .finally(() => setHighlightsLoading(false));
  }, [paper, setHighlights, setHighlightsLoading]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        {error}
      </div>
    );
  }

  if (!paper) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <Toolbar title={paper.title} />
      <div className="flex flex-1 overflow-hidden">
        <PdfViewer fileUrl={getPaperFileUrl(paper.id)} paperId={paper.id} structuredContent={paper.structured_content as never} />
        <Sidebar paperId={paper.id} />
      </div>
    </div>
  );
}
