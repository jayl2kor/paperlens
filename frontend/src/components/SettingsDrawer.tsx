"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type AppSettings, getSettings, updateSettings } from "@/lib/api";

const LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];

const HIGHLIGHT_COLORS = [
  { value: "yellow", label: "노랑", class: "bg-yellow-300" },
  { value: "green", label: "초록", class: "bg-green-300" },
  { value: "blue", label: "파랑", class: "bg-blue-300" },
  { value: "pink", label: "분홍", class: "bg-pink-300" },
  { value: "purple", label: "보라", class: "bg-purple-300" },
];


interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load settings on open
  useEffect(() => {
    if (!open) return;
    getSettings()
      .then(setSettings)
      .catch(() =>
        setSettings({
          api_key_configured: false,
          default_language: "ko",
          highlight_color: "yellow",
          claude_model: "claude-sonnet-4-20250514",
        })
      );
  }, [open]);

  // Auto-save with debounce (only send mutable fields, not api_key_configured)
  const autoSave = useCallback((updated: AppSettings) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaveStatus("saving");
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      try {
        const { api_key_configured: _, ...mutable } = updated;
        await updateSettings(mutable);
        setSaveStatus("saved");
        statusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("error");
        statusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      }
    }, 500);
  }, []);

  const updateField = useCallback(
    (field: "default_language" | "highlight_color" | "claude_model", value: string) => {
      if (!settings) return;
      const updated = { ...settings, [field]: value };
      setSettings(updated);
      autoSave(updated);
    },
    [settings, autoSave]
  );

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    };
  }, []);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        ref={panelRef}
        className="fixed inset-y-0 right-0 z-50 w-96 max-w-[calc(100vw-2rem)] bg-background border-l border-foreground/10 shadow-xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/10">
          <h2 className="text-lg font-semibold">설정</h2>
          <div className="flex items-center gap-3">
            {/* Save status */}
            {saveStatus === "saving" && (
              <span className="flex items-center gap-1.5 text-xs text-foreground/40">
                <div className="w-3 h-3 border-1.5 border-foreground/30 border-t-transparent rounded-full animate-spin" />
                저장 중...
              </span>
            )}
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                저장됨
              </span>
            )}
            {saveStatus === "error" && (
              <span className="flex items-center gap-1 text-xs text-red-500">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                  />
                </svg>
                저장 실패
              </span>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-foreground/10 text-foreground/50 hover:text-foreground/80 transition-colors"
              aria-label="닫기"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {!settings ? (
            <div className="space-y-6 animate-pulse">
              <div className="h-4 w-24 bg-foreground/10 rounded" />
              <div className="flex gap-2">
                <div className="h-9 w-16 bg-foreground/5 rounded-full" />
                <div className="h-9 w-16 bg-foreground/5 rounded-full" />
                <div className="h-9 w-16 bg-foreground/5 rounded-full" />
              </div>
              <div className="h-4 w-28 bg-foreground/10 rounded" />
              <div className="flex gap-3">
                <div className="w-8 h-8 bg-foreground/5 rounded-full" />
                <div className="w-8 h-8 bg-foreground/5 rounded-full" />
                <div className="w-8 h-8 bg-foreground/5 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Translation Language */}
              <div>
                <label className="text-sm font-medium">기본 번역 언어</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() =>
                        updateField("default_language", lang.code)
                      }
                      className={`px-4 py-1.5 text-sm rounded-full transition-all ${
                        settings.default_language === lang.code
                          ? "bg-blue-500 text-white font-medium shadow-sm"
                          : "bg-foreground/5 text-foreground/60 hover:bg-foreground/10"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Highlight Color */}
              <div>
                <label className="text-sm font-medium">
                  기본 하이라이트 색상
                </label>
                <div className="flex gap-3 mt-2">
                  {HIGHLIGHT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() =>
                        updateField("highlight_color", color.value)
                      }
                      className={`relative w-8 h-8 rounded-full transition-all ${color.class} ${
                        settings.highlight_color === color.value
                          ? "ring-2 ring-offset-2 ring-offset-background ring-foreground/30 scale-110"
                          : "hover:scale-105"
                      }`}
                      aria-label={`하이라이트 색상: ${color.label}`}
                    >
                      {settings.highlight_color === color.value && (
                        <svg
                          className="absolute inset-0 m-auto w-4 h-4 text-foreground/70"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2.5}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
