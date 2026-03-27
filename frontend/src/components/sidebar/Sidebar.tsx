"use client";

import { usePaperStore, type SidebarTab } from "@/stores/paperStore";
import SummaryPanel from "./SummaryPanel";
import StemAnalysisPanel from "./StemAnalysisPanel";
import DataTablesPanel from "./DataTablesPanel";
import FormulaAnalysisPanel from "./FormulaAnalysisPanel";
import FigureAnalysisPanel from "./FigureAnalysisPanel";
import TranslationPanel from "./TranslationPanel";
import ChatPanel from "./ChatPanel";
import HighlightListPanel from "./HighlightListPanel";

interface SidebarProps {
  paperId: number;
}

const TABS: { key: SidebarTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "stem", label: "8단계" },
  { key: "data", label: "데이터" },
  { key: "formula", label: "수식" },
  { key: "figures", label: "그래프" },
  { key: "translate", label: "번역" },
  { key: "chat", label: "토론" },
  { key: "notes", label: "노트" },
];

export default function Sidebar({ paperId }: SidebarProps) {
  const { sidebarOpen, activeTab, setActiveTab } = usePaperStore();

  if (!sidebarOpen) return null;

  return (
    <div className="border-l border-foreground/10 bg-background flex flex-col shrink-0 min-w-[320px] max-w-[480px]" style={{ flex: "0 1 40%" }}>
      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-2 pt-2 pb-1.5 border-b border-foreground/10 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`min-h-[44px] px-3 py-2 text-xs rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? "bg-foreground/10 font-medium"
                : "text-foreground/50 hover:bg-foreground/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — panels stay mounted to preserve state across tab switches */}
      <div className="flex-1 overflow-hidden relative">
        <div className={activeTab === "summary" ? "h-full" : "hidden"}><SummaryPanel paperId={paperId} /></div>
        <div className={activeTab === "stem" ? "h-full" : "hidden"}><StemAnalysisPanel paperId={paperId} /></div>
        <div className={activeTab === "data" ? "h-full" : "hidden"}><DataTablesPanel paperId={paperId} active={activeTab === "data"} /></div>
        <div className={activeTab === "formula" ? "h-full" : "hidden"}><FormulaAnalysisPanel paperId={paperId} active={activeTab === "formula"} /></div>
        <div className={activeTab === "figures" ? "h-full" : "hidden"}><FigureAnalysisPanel paperId={paperId} active={activeTab === "figures"} /></div>
        <div className={activeTab === "translate" ? "h-full" : "hidden"}><TranslationPanel paperId={paperId} /></div>
        <div className={activeTab === "chat" ? "h-full" : "hidden"}><ChatPanel paperId={paperId} /></div>
        <div className={activeTab === "notes" ? "h-full" : "hidden"}><HighlightListPanel paperId={paperId} /></div>
      </div>
    </div>
  );
}
