"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type FormulaAnalysisItem, getFormulaAnalysis } from "@/lib/api";
import { CheckIcon, XMarkIcon } from "@/components/icons";

interface Props {
  paperId: number;
  active?: boolean;
}

export default function FormulaAnalysisPanel({ paperId, active }: Props) {
  const [formulas, setFormulas] = useState<FormulaAnalysisItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getFormulaAnalysis(paperId);
      setFormulas(result);
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "수식 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  const loadedRef = useRef(false);
  useEffect(() => { if (active && !loadedRef.current) { loadedRef.current = true; load(); } }, [active, load]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-foreground/70">수식 단위 분석</h3>
        {!loading && formulas.length > 0 && (
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
          <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          수식 분석 중...
        </div>
      )}

      {formulas.map((f, idx) => {
        const expanded = expandedIdx === idx;
        return (
          <div key={idx} className="rounded-lg border border-foreground/10 overflow-hidden">
            <button
              onClick={() => setExpandedIdx(expanded ? null : idx)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-foreground/5 transition-colors"
            >
              <span className="text-xs font-mono text-purple-600 dark:text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded">
                {f.id}
              </span>
              <code className="text-xs flex-1 truncate text-foreground/70">{f.latex}</code>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                f.dimensions.consistent
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-red-500/10 text-red-600 dark:text-red-400"
              }`}>
                {f.dimensions.consistent
                  ? <><CheckIcon className="w-3 h-3 inline -mt-0.5" /> 차원일치</>
                  : <><XMarkIcon className="w-3 h-3 inline -mt-0.5" /> 불일치</>}
              </span>
              <span className="text-xs text-foreground/30">{expanded ? "▲" : "▼"}</span>
            </button>

            {expanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-foreground/5">
                {/* Description */}
                <p className="text-xs text-foreground/70 mt-2">{f.description}</p>

                {/* Variables table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-foreground/10 text-foreground/50">
                        <th className="px-2 py-1 text-left">기호</th>
                        <th className="px-2 py-1 text-left">의미</th>
                        <th className="px-2 py-1 text-left">단위</th>
                        <th className="px-2 py-1 text-left">차원</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.variables.map((v, vi) => (
                        <tr key={vi} className="border-b border-foreground/5 last:border-0">
                          <td className="px-2 py-1 font-mono font-medium">{v.symbol}</td>
                          <td className="px-2 py-1">{v.name}</td>
                          <td className="px-2 py-1 font-mono text-foreground/60">{v.unit}</td>
                          <td className="px-2 py-1 font-mono text-foreground/60">{v.dimension}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Dimensional analysis */}
                <div className="bg-foreground/[0.03] rounded-md px-2.5 py-2 text-xs space-y-1">
                  <div><span className="text-foreground/50">좌변:</span> <code>{f.dimensions.lhs}</code></div>
                  <div><span className="text-foreground/50">우변:</span> <code>{f.dimensions.rhs}</code></div>
                </div>

                {/* Constraints */}
                {f.constraints && (
                  <p className="text-xs text-foreground/50">
                    <span className="font-medium">제약:</span> {f.constraints}
                  </p>
                )}

                {/* Source */}
                {f.source && (
                  <p className="text-[10px] text-foreground/40">출처: {f.source}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {!loading && !error && formulas.length === 0 && (
        <div className="text-center py-8 text-foreground/40 text-sm">
          분석된 수식이 없습니다.
        </div>
      )}
    </div>
  );
}
