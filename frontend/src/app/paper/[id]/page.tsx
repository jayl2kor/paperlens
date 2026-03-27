"use client";

import { use, useCallback, useEffect, useState } from "react";
import {
  type PaperDetailResponse,
  getPaper,
  getPaperFileUrl,
  getAutoHighlights,
  listHighlights,
} from "@/lib/api";
import PdfViewer from "@/components/pdf/PdfViewer";
import Toolbar from "@/components/pdf/Toolbar";
import Sidebar from "@/components/sidebar/Sidebar";
import SettingsDrawer from "@/components/SettingsDrawer";
import { usePaperStore } from "@/stores/paperStore";

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [paper, setPaper] = useState<PaperDetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const {
    setHighlights,
    setHighlightsLoading,
    resetAiState,
    setUserHighlights,
    setUserHighlightsLoading,
  } = usePaperStore();

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const { toggleSidebar, toggleHighlights, setActiveTab, setSidebarOpen } =
        usePaperStore.getState();

      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "h" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleHighlights();
      } else if (e.altKey && e.key >= "1" && e.key <= "7") {
        e.preventDefault();
        const tabs: import("@/stores/paperStore").SidebarTab[] = [
          "stem", "data", "formula", "figures", "translate", "chat", "notes",
        ];
        const idx = parseInt(e.key) - 1;
        if (tabs[idx]) {
          setActiveTab(tabs[idx]);
          setSidebarOpen(true);
        }
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset AI state when paper changes
  useEffect(() => {
    resetAiState();
  }, [id, resetAiState]);

  useEffect(() => {
    getPaper(parseInt(id))
      .then(setPaper)
      .catch(() => setError("논문을 찾을 수 없습니다."));
  }, [id]);

  // Load auto-highlights and user highlights when paper is ready
  useEffect(() => {
    if (!paper) return;

    setHighlightsLoading(true);
    getAutoHighlights(paper.id)
      .then((res) => setHighlights(res.highlights))
      .catch(() => {})
      .finally(() => setHighlightsLoading(false));

    setUserHighlightsLoading(true);
    listHighlights(paper.id)
      .then(setUserHighlights)
      .catch(() => {})
      .finally(() => setUserHighlightsLoading(false));
  }, [paper, setHighlights, setHighlightsLoading, setUserHighlights, setUserHighlightsLoading]);

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
      <Toolbar title={paper.title} onSettingsClick={() => setSettingsOpen(true)} />
      <div className="flex flex-1 overflow-hidden">
        <PdfViewer fileUrl={getPaperFileUrl(paper.id)} paperId={paper.id} structuredContent={paper.structured_content as never} />
        <Sidebar paperId={paper.id} />
      </div>
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
