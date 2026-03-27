"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { streamStemAnalysis } from "@/lib/api";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import {
  TargetIcon, LightBulbIcon, BeakerIcon, FlaskIcon,
  ClipboardIcon, RulerIcon, ChartBarIcon, FlagIcon,
} from "@/components/icons";

const STEP_STYLES = [
  { Icon: TargetIcon, border: "border-blue-500/20", bg: "bg-blue-500/5", iconClass: "text-blue-500" },
  { Icon: LightBulbIcon, border: "border-indigo-500/20", bg: "bg-indigo-500/5", iconClass: "text-indigo-500" },
  { Icon: BeakerIcon, border: "border-purple-500/20", bg: "bg-purple-500/5", iconClass: "text-purple-500" },
  { Icon: FlaskIcon, border: "border-pink-500/20", bg: "bg-pink-500/5", iconClass: "text-pink-500" },
  { Icon: ClipboardIcon, border: "border-orange-500/20", bg: "bg-orange-500/5", iconClass: "text-orange-500" },
  { Icon: RulerIcon, border: "border-amber-500/20", bg: "bg-amber-500/5", iconClass: "text-amber-500" },
  { Icon: ChartBarIcon, border: "border-emerald-500/20", bg: "bg-emerald-500/5", iconClass: "text-emerald-500" },
  { Icon: FlagIcon, border: "border-teal-500/20", bg: "bg-teal-500/5", iconClass: "text-teal-500" },
];

interface Props {
  paperId: number;
}

export default function StemAnalysisPanel({ paperId }: Props) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setContent("");
    setLoading(true);
    setError(null);

    streamStemAnalysis(
      paperId,
      (chunk) => setContent((prev) => prev + chunk),
      () => setLoading(false),
      (msg) => { setError(msg); setLoading(false); },
      ctrl.signal,
    );
  }, [paperId]);

  useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]);

  useEffect(() => {
    if (loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content, loading]);

  const toggleStep = (idx: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const sections = useMemo(
    () =>
      content
        .split(/^## /m)
        .filter(Boolean)
        .map((s) => {
          const nl = s.indexOf("\n");
          return { title: s.slice(0, nl).trim(), body: s.slice(nl + 1).trim() };
        }),
    [content]
  );

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground/70">이공계 8단계 분석</h3>
        {!loading && content && (
          <button onClick={load} className="text-xs text-blue-500 hover:text-blue-600">
            재분석
          </button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && sections.length === 0 && (
        <div className="flex items-center gap-2 text-foreground/50 text-sm py-8 justify-center">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          8단계 분석 중...
        </div>
      )}

      {sections.map((sec, idx) => {
        const style = STEP_STYLES[idx] || STEP_STYLES[0];
        const expanded = expandedSteps.has(idx);
        return (
          <div
            key={idx}
            className={`rounded-lg border ${style.border} ${style.bg} overflow-hidden`}
          >
            <button
              onClick={() => toggleStep(idx)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-foreground/5 transition-colors"
            >
              <style.Icon className={`w-4 h-4 shrink-0 ${style.iconClass}`} />
              <span className="text-sm font-medium flex-1">{sec.title}</span>
              <span className="text-xs text-foreground/30">{expanded ? "▲" : "▼"}</span>
            </button>
            {expanded && (
              <div className="px-3 pb-3">
                <MarkdownRenderer>{sec.body}</MarkdownRenderer>
              </div>
            )}
          </div>
        );
      })}

      {loading && sections.length > 0 && (
        <div className="flex items-center gap-2 text-foreground/40 text-xs py-2 justify-center">
          <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          분석 계속 중...
        </div>
      )}
    </div>
  );
}
