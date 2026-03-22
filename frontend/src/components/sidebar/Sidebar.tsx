"use client";

import { usePaperStore, type SidebarTab } from "@/stores/paperStore";
import SummaryPanel from "./SummaryPanel";
import TranslationPanel from "./TranslationPanel";
import ChatPanel from "./ChatPanel";
import HighlightListPanel from "./HighlightListPanel";

interface SidebarProps {
  paperId: number;
}

const TABS: { key: SidebarTab; label: string }[] = [
  { key: "summary", label: "요약" },
  { key: "translate", label: "번역" },
  { key: "chat", label: "토론" },
  { key: "notes", label: "노트" },
];

export default function Sidebar({ paperId }: SidebarProps) {
  const { sidebarOpen, activeTab, setActiveTab } = usePaperStore();

  if (!sidebarOpen) return null;

  return (
    <div className="w-80 border-l border-foreground/10 bg-background flex flex-col shrink-0">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-2 border-b border-foreground/10">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === tab.key
                ? "bg-foreground/10 font-medium"
                : "text-foreground/50 hover:bg-foreground/5"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "summary" && <SummaryPanel paperId={paperId} />}
        {activeTab === "translate" && <TranslationPanel paperId={paperId} />}
        {activeTab === "chat" && <ChatPanel paperId={paperId} />}
        {activeTab === "notes" && <HighlightListPanel paperId={paperId} />}
      </div>
    </div>
  );
}
