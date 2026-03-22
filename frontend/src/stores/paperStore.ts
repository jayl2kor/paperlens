import { create } from "zustand";
import type { HighlightItem, ChatMessage, CitationItem, ChatMode } from "@/lib/api";

export type SidebarTab = "summary" | "translate" | "chat" | "notes";

export interface TextSelection {
  text: string;
  context: string;
  page: number;
  rect: { x: number; y: number; w: number; h: number }; // position for popover
}

interface PaperStore {
  // Viewer state
  currentPage: number;
  totalPages: number;
  scale: number;
  sidebarOpen: boolean;

  // Sidebar tab
  activeTab: SidebarTab;

  // AI — Summary
  summary: string;
  summaryLoading: boolean;

  // AI — Highlights
  highlights: HighlightItem[];
  highlightsLoading: boolean;
  highlightsVisible: boolean;

  // Text selection
  selection: TextSelection | null;

  // Explanation popover
  explanation: string;
  explanationLoading: boolean;

  // Translation (per page)
  translations: Record<number, string>;
  translationLoading: number | null; // page currently being translated

  // Chat
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatMode: ChatMode;
  chatStreaming: string; // currently streaming assistant message

  // Citations
  citations: CitationItem[];
  citationsLoading: boolean;

  // Actions — Viewer
  setCurrentPage: (page: number) => void;
  setTotalPages: (total: number) => void;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Actions — Sidebar
  setActiveTab: (tab: SidebarTab) => void;

  // Actions — AI
  setSummary: (text: string) => void;
  appendSummary: (chunk: string) => void;
  setSummaryLoading: (loading: boolean) => void;
  setHighlights: (highlights: HighlightItem[]) => void;
  setHighlightsLoading: (loading: boolean) => void;
  toggleHighlights: () => void;
  resetAiState: () => void;

  // Actions — Selection & Explanation
  setSelection: (sel: TextSelection | null) => void;
  setExplanation: (text: string) => void;
  appendExplanation: (chunk: string) => void;
  setExplanationLoading: (loading: boolean) => void;
  clearExplanation: () => void;

  // Actions — Translation
  setTranslation: (page: number, text: string) => void;
  appendTranslation: (page: number, chunk: string) => void;
  setTranslationLoading: (page: number | null) => void;

  // Actions — Chat
  setChatMessages: (messages: ChatMessage[]) => void;
  addChatMessage: (message: ChatMessage) => void;
  setChatLoading: (loading: boolean) => void;
  setChatMode: (mode: ChatMode) => void;
  setChatStreaming: (text: string) => void;
  appendChatStreaming: (chunk: string) => void;
  finalizeChatStreaming: () => void;

  // Actions — Citations
  setCitations: (citations: CitationItem[]) => void;
  setCitationsLoading: (loading: boolean) => void;
}

export const usePaperStore = create<PaperStore>((set) => ({
  currentPage: 1,
  totalPages: 0,
  scale: 1.0,
  sidebarOpen: true,

  activeTab: "summary",

  summary: "",
  summaryLoading: false,

  highlights: [],
  highlightsLoading: false,
  highlightsVisible: true,

  selection: null,

  explanation: "",
  explanationLoading: false,

  translations: {},
  translationLoading: null,

  chatMessages: [],
  chatLoading: false,
  chatMode: "general",
  chatStreaming: "",

  citations: [],
  citationsLoading: false,

  // Viewer
  setCurrentPage: (page) => set({ currentPage: page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setScale: (scale) => set({ scale: Math.max(0.5, Math.min(3.0, scale)) }),
  zoomIn: () =>
    set((state) => ({ scale: Math.min(3.0, state.scale + 0.25) })),
  zoomOut: () =>
    set((state) => ({ scale: Math.max(0.5, state.scale - 0.25) })),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Sidebar
  setActiveTab: (tab) => set({ activeTab: tab }),

  // AI
  setSummary: (text) => set({ summary: text }),
  appendSummary: (chunk) =>
    set((state) => ({ summary: state.summary + chunk })),
  setSummaryLoading: (loading) => set({ summaryLoading: loading }),
  setHighlights: (highlights) => set({ highlights }),
  setHighlightsLoading: (loading) => set({ highlightsLoading: loading }),
  toggleHighlights: () =>
    set((state) => ({ highlightsVisible: !state.highlightsVisible })),
  resetAiState: () =>
    set({
      summary: "",
      summaryLoading: false,
      highlights: [],
      highlightsLoading: false,
      highlightsVisible: true,
      selection: null,
      explanation: "",
      explanationLoading: false,
      translations: {},
      translationLoading: null,
      chatMessages: [],
      chatLoading: false,
      chatMode: "general",
      chatStreaming: "",
      citations: [],
      citationsLoading: false,
    }),

  // Selection & Explanation
  setSelection: (sel) => set({ selection: sel }),
  setExplanation: (text) => set({ explanation: text }),
  appendExplanation: (chunk) =>
    set((state) => ({ explanation: state.explanation + chunk })),
  setExplanationLoading: (loading) => set({ explanationLoading: loading }),
  clearExplanation: () =>
    set({ explanation: "", explanationLoading: false, selection: null }),

  // Translation
  setTranslation: (page, text) =>
    set((state) => ({
      translations: { ...state.translations, [page]: text },
    })),
  appendTranslation: (page, chunk) =>
    set((state) => ({
      translations: {
        ...state.translations,
        [page]: (state.translations[page] || "") + chunk,
      },
    })),
  setTranslationLoading: (page) => set({ translationLoading: page }),

  // Chat
  setChatMessages: (messages) => set({ chatMessages: messages }),
  addChatMessage: (message) =>
    set((state) => ({ chatMessages: [...state.chatMessages, message] })),
  setChatLoading: (loading) => set({ chatLoading: loading }),
  setChatMode: (mode) => set({ chatMode: mode }),
  setChatStreaming: (text) => set({ chatStreaming: text }),
  appendChatStreaming: (chunk) =>
    set((state) => ({ chatStreaming: state.chatStreaming + chunk })),
  finalizeChatStreaming: () =>
    set((state) => {
      if (!state.chatStreaming) return state;
      const msg: ChatMessage = {
        id: Date.now(),
        role: "assistant",
        content: state.chatStreaming,
        mode: state.chatMode,
        created_at: new Date().toISOString(),
      };
      return {
        chatMessages: [...state.chatMessages, msg],
        chatStreaming: "",
      };
    }),

  // Citations
  setCitations: (citations) => set({ citations }),
  setCitationsLoading: (loading) => set({ citationsLoading: loading }),
}));
