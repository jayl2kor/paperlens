"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type DataTable, getNumericalTables } from "@/lib/api";

const TYPE_LABELS: Record<string, { label: string; badgeBg: string; badgeText: string }> = {
  input: { label: "입력", badgeBg: "bg-blue-500/15", badgeText: "text-blue-600 dark:text-blue-400" },
  output: { label: "출력", badgeBg: "bg-emerald-500/15", badgeText: "text-emerald-600 dark:text-emerald-400" },
  comparison: { label: "비교", badgeBg: "bg-purple-500/15", badgeText: "text-purple-600 dark:text-purple-400" },
};

interface Props {
  paperId: number;
  active?: boolean;
}

export default function DataTablesPanel({ paperId, active }: Props) {
  const [tables, setTables] = useState<DataTable[]>([]);
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getNumericalTables(paperId);
      setTables(result.tables || []);
      setSummary(result.summary || "");
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "데이터 테이블 추출에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  const loadedRef = useRef(false);
  useEffect(() => { if (active && !loadedRef.current) { loadedRef.current = true; load(); } }, [active, load]);

  const filtered = filter ? tables.filter((t) => t.type === filter) : tables;

  const exportCsv = (table: DataTable) => {
    const rows = [table.headers, ...table.rows];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${table.title || "data"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground/70">수치 데이터표</h3>
        {!loading && tables.length > 0 && (
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
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          데이터 추출 중...
        </div>
      )}

      {!loading && tables.length > 0 && (
        <>
          {summary && (
            <p className="text-xs text-foreground/60 bg-foreground/5 rounded-lg px-3 py-2">{summary}</p>
          )}

          {/* Filter buttons */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter(null)}
              className={`px-2 py-1 text-xs rounded-full transition-colors ${
                filter === null ? "bg-foreground text-background font-medium" : "text-foreground/50 hover:bg-foreground/5"
              }`}
            >
              전체 ({tables.length})
            </button>
            {Object.entries(TYPE_LABELS).map(([key, { label }]) => {
              const count = tables.filter((t) => t.type === key).length;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilter(filter === key ? null : key)}
                  className={`px-2 py-1 text-xs rounded-full transition-colors ${
                    filter === key ? "bg-foreground text-background font-medium" : "text-foreground/50 hover:bg-foreground/5"
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Tables */}
          {filtered.map((table, idx) => {
            const typeInfo = TYPE_LABELS[table.type] || TYPE_LABELS.input;
            return (
              <div key={idx} className="rounded-lg border border-foreground/10 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-foreground/[0.03] border-b border-foreground/10">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${typeInfo.badgeBg} ${typeInfo.badgeText}`}>
                      {typeInfo.label}
                    </span>
                    <span className="text-xs font-medium">{table.title}</span>
                  </div>
                  <button
                    onClick={() => exportCsv(table)}
                    className="text-[10px] text-foreground/40 hover:text-foreground/70"
                    title="CSV 다운로드"
                  >
                    CSV
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-foreground/10 bg-foreground/[0.02]">
                        {table.headers.map((h, i) => (
                          <th key={i} className="px-2.5 py-1.5 text-left font-medium text-foreground/60 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row, ri) => (
                        <tr key={ri} className="border-b border-foreground/5 last:border-0">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-2.5 py-1.5 whitespace-nowrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {table.source && (
                  <div className="px-3 py-1 text-[10px] text-foreground/40 border-t border-foreground/5">
                    출처: {table.source}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!loading && !error && tables.length === 0 && (
        <div className="text-center py-8 text-foreground/40 text-sm">
          추출된 수치 데이터가 없습니다.
        </div>
      )}
    </div>
  );
}
