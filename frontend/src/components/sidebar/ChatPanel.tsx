"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { usePaperStore } from "@/stores/paperStore";
import { streamChat, getChatHistory } from "@/lib/api";

interface ChatPanelProps {
  paperId: number;
}

const MODES = [
  { key: "general", label: "일반" },
  { key: "limitations", label: "한계점" },
  { key: "connections", label: "관련 연구" },
] as const;

const SUGGESTED_QUESTIONS: Record<string, string[]> = {
  general: [
    "이 논문의 핵심 기여는 무엇인가요?",
    "이 방법론의 장점은 무엇인가요?",
    "실험 결과를 요약해 주세요.",
  ],
  limitations: [
    "이 연구의 주요 한계점은 무엇인가요?",
    "실험 설계에서 개선할 점은?",
    "어떤 가정이 비현실적인가요?",
  ],
  connections: [
    "이 연구와 가장 관련 있는 선행 연구는?",
    "기존 방법론과 어떻게 다른가요?",
    "이 연구가 영향을 줄 수 있는 분야는?",
  ],
};

export default function ChatPanel({ paperId }: ChatPanelProps) {
  const {
    chatMessages,
    chatLoading,
    chatMode,
    chatStreaming,
    setChatMessages,
    addChatMessage,
    setChatLoading,
    setChatMode,
    appendChatStreaming,
    setChatStreaming,
    finalizeChatStreaming,
  } = usePaperStore();

  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyLoaded = useRef(false);

  // Load chat history on mount
  useEffect(() => {
    if (historyLoaded.current) return;
    historyLoaded.current = true;
    getChatHistory(paperId)
      .then(setChatMessages)
      .catch(() => {});
  }, [paperId, setChatMessages]);

  // Auto-scroll when new messages or streaming
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    });
  }, [chatMessages, chatStreaming]);

  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || chatLoading) return;

      setError(null);
      setInput("");
      setChatLoading(true);
      setChatStreaming("");

      addChatMessage({
        id: Date.now(),
        role: "user",
        content: question,
        mode: chatMode,
        created_at: new Date().toISOString(),
      });

      await streamChat(
        paperId,
        question,
        chatMode,
        (chunk) => appendChatStreaming(chunk),
        () => {
          finalizeChatStreaming();
          setChatLoading(false);
        },
        (msg) => {
          setError(msg);
          setChatLoading(false);
          setChatStreaming("");
        }
      );
    },
    [
      paperId,
      chatMode,
      chatLoading,
      setChatLoading,
      addChatMessage,
      appendChatStreaming,
      setChatStreaming,
      finalizeChatStreaming,
    ]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = chatMessages.length === 0 && !chatStreaming;

  return (
    <div className="flex flex-col h-full">
      {/* Mode selector */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-foreground/10">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => setChatMode(m.key)}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
              chatMode === m.key
                ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-medium"
                : "text-foreground/50 hover:bg-foreground/5"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-3 space-y-3">
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <div className="text-center">
              <p className="text-sm text-foreground/40 mb-4">
                논문에 대해 질문해 보세요
              </p>
              <div className="flex flex-col gap-2">
                {SUGGESTED_QUESTIONS[chatMode]?.map((q) => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-foreground/10 hover:bg-foreground/5 transition-colors text-foreground/60"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-blue-500 text-white rounded-br-sm"
                  : "bg-foreground/5 text-foreground/80 rounded-bl-sm"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:my-0.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1">
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}

        {/* Streaming assistant message */}
        {chatStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 text-sm bg-foreground/5 text-foreground/80">
              <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:pl-4 [&_ol]:pl-4 [&_li]:my-0.5">
                <ReactMarkdown>{chatStreaming}</ReactMarkdown>
              </div>
              <span className="inline-block w-1.5 h-4 bg-blue-500 animate-pulse ml-0.5" />
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {chatLoading && !chatStreaming && (
          <div className="flex justify-start">
            <div className="rounded-xl rounded-bl-sm px-3 py-2 bg-foreground/5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.15s]" />
                <div className="w-1.5 h-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:0.3s]" />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-500">
            {error}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-foreground/10 p-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="질문을 입력하세요..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-foreground/15 bg-foreground/5 px-3 py-2 text-sm placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-blue-500/50 max-h-24 overflow-auto"
            disabled={chatLoading}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || chatLoading}
            className="shrink-0 p-2 rounded-lg bg-blue-500 text-white disabled:opacity-40 hover:bg-blue-600 transition-colors"
            title="전송"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
