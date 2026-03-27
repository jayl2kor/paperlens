"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type FigureAnalysisItem, getFigureAnalysis } from "@/lib/api";
import {
  TrendUpIcon, ChartBarIcon, ScatterIcon, GridIcon,
  ArrowsIcon, TableIcon, PhotoIcon, DocumentIcon,
} from "@/components/icons";

const TYPE_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  line_chart: TrendUpIcon,
  bar_chart: ChartBarIcon,
  scatter: ScatterIcon,
  heatmap: GridIcon,
  diagram: ArrowsIcon,
  table: TableIcon,
  photo: PhotoIcon,
  other: DocumentIcon,
};

interface Props {
  paperId: number;
  active?: boolean;
}

export default function FigureAnalysisPanel({ paperId, active }: Props) {
  const [figures, setFigures] = useState<FigureAnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFigureAnalysis(paperId);
      setFigures(result);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "그래프 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  const loadedRef = useRef(false);
  useEffect(() => { if (active && !loadedRef.current) { loadedRef.current = true; load(); } }, [active, load]);
  useEffect(() => { setSelectedIdx(0); loadedRef.current = false; }, [paperId]);

  const fig = figures[selectedIdx];

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground/70">그래프/Figure 분석</h3>
        {!loading && figures.length > 0 && (
          <button onClick={load} className="text-xs text-blue-500 hover:text-blue-600">재분석</button>
        )}
      </div>

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-foreground/50 text-sm py-8 justify-center">
          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          그래프 분석 중...
        </div>
      )}

      {/* Figure selector tabs */}
      {figures.length > 1 && (
        <div className="flex gap-1 flex-wrap">
          {figures.map((f, idx) => {
            const TabIcon = TYPE_ICONS[f.figure_type] || DocumentIcon;
            return (
              <button
                key={f.id || idx}
                onClick={() => setSelectedIdx(idx)}
                className={`px-2 py-1 text-xs rounded-md transition-colors flex items-center gap-1 ${
                  selectedIdx === idx
                    ? "bg-foreground/10 font-medium"
                    : "text-foreground/50 hover:bg-foreground/5"
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" />{f.id}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected figure detail */}
      {fig && (() => {
        const FigIcon = TYPE_ICONS[fig.figure_type] || DocumentIcon;
        return (
        <div className="space-y-3">
          {/* Header */}
          <div className="rounded-lg bg-foreground/[0.03] border border-foreground/10 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-1">
              <FigIcon className="w-5 h-5 text-foreground/60" />
              <span className="text-sm font-medium">{fig.id}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/10 text-foreground/50">
                {fig.figure_type.replace("_", " ")}
              </span>
            </div>
            {fig.caption && (
              <p className="text-xs text-foreground/60 italic">{fig.caption}</p>
            )}
          </div>

          {/* Axes */}
          {(fig.axes.x || fig.axes.y) && (
            <div className="grid grid-cols-2 gap-2">
              {fig.axes.x && (
                <div className="bg-blue-500/5 rounded-md px-2.5 py-1.5">
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">X축</div>
                  <div className="text-xs">{fig.axes.x}</div>
                </div>
              )}
              {fig.axes.y && (
                <div className="bg-emerald-500/5 rounded-md px-2.5 py-1.5">
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">Y축</div>
                  <div className="text-xs">{fig.axes.y}</div>
                </div>
              )}
            </div>
          )}

          {/* Data summary */}
          {fig.data_summary && (
            <div>
              <div className="text-xs font-medium text-foreground/60 mb-1">데이터 요약</div>
              <p className="text-xs text-foreground/80">{fig.data_summary}</p>
            </div>
          )}

          {/* Key findings */}
          {fig.key_findings.length > 0 && (
            <div>
              <div className="text-xs font-medium text-foreground/60 mb-1">핵심 발견</div>
              <ul className="space-y-1">
                {fig.key_findings.map((finding, i) => (
                  <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                    <span className="text-foreground/30 shrink-0">•</span>
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Trends */}
          {fig.trends && (
            <div className="bg-amber-500/5 border border-amber-500/15 rounded-md px-2.5 py-2">
              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mb-0.5">트렌드</div>
              <p className="text-xs">{fig.trends}</p>
            </div>
          )}

          {/* Related values */}
          {fig.related_values.length > 0 && (
            <div>
              <div className="text-xs font-medium text-foreground/60 mb-1">관련 수치</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-foreground/10 text-foreground/50">
                      <th className="px-2 py-1 text-left">변수</th>
                      <th className="px-2 py-1 text-left">값</th>
                      <th className="px-2 py-1 text-left">단위</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fig.related_values.map((v, vi) => (
                      <tr key={vi} className="border-b border-foreground/5 last:border-0">
                        <td className="px-2 py-1">{v.parameter}</td>
                        <td className="px-2 py-1 font-mono">{v.value}</td>
                        <td className="px-2 py-1 text-foreground/60">{v.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Significance */}
          {fig.significance && (
            <div>
              <div className="text-xs font-medium text-foreground/60 mb-1">논문에서의 의의</div>
              <p className="text-xs text-foreground/80">{fig.significance}</p>
            </div>
          )}

          {/* Source ref */}
          {fig.page_ref && (
            <div className="text-[10px] text-foreground/40">참조: {fig.page_ref}</div>
          )}
        </div>
        );
      })()}

      {!loading && !error && figures.length === 0 && (
        <div className="text-center py-8 text-foreground/40 text-sm">
          분석된 그래프/Figure가 없습니다.
        </div>
      )}
    </div>
  );
}
