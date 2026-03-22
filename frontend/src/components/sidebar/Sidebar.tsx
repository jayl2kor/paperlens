"use client";

import { usePaperStore, type SidebarTab } from "@/stores/paperStore";
import SummaryPanel from "./SummaryPanel";
import TranslationPanel from "./TranslationPanel";
import ChatPanel from "./ChatPanel";

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

        {activeTab === "notes" && (
          <div className="flex flex-col items-center justify-center h-full text-foreground/30">
            <svg
              className="w-12 h-12 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <p className="text-sm">다음 Phase에서 구현됩니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
