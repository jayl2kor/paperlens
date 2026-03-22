"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type PaperResponse,
  deletePaper,
  listPapers,
  uploadPaper,
} from "@/lib/api";

export default function HomePage() {
  const [papers, setPapers] = useState<PaperResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const loadPapers = useCallback(async () => {
    try {
      const data = await listPapers();
      setPapers(data);
    } catch {
      // API not available yet
    }
  }, []);

  useEffect(() => {
    loadPapers();
  }, [loadPapers]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setUploading(true);
    try {
      const paper = await uploadPaper(file);
      router.push(`/paper/${paper.id}`);
    } catch (err) {
      console.error("Upload failed:", err);
      alert("PDF 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("이 논문을 삭제하시겠습니까?")) return;
    await deletePaper(id);
    loadPapers();
  };

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-16">
      <h1 className="text-3xl font-bold mb-2">Paper Insight</h1>
      <p className="text-foreground/60 mb-12">
        AI 기반 논문 리딩 도구 — 논문 파악 시간을 획기적으로 단축
      </p>

      {/* Upload area */}
      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          dragOver
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
            : "border-foreground/20 hover:border-foreground/40"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-foreground/60">PDF 업로드 중...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-12 h-12 text-foreground/30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16"
              />
            </svg>
            <p className="text-foreground/60">
              PDF 파일을 드래그하거나 클릭하여 업로드
            </p>
          </div>
        )}
      </div>

      {/* Paper list */}
      {papers.length > 0 && (
        <div className="w-full max-w-xl mt-12">
          <h2 className="text-lg font-semibold mb-4">업로드된 논문</h2>
          <div className="flex flex-col gap-2">
            {papers.map((paper) => (
              <div
                key={paper.id}
                className="flex items-center justify-between p-4 rounded-lg border border-foreground/10 hover:bg-foreground/5 cursor-pointer transition-colors"
                onClick={() => router.push(`/paper/${paper.id}`)}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{paper.title}</p>
                  <p className="text-sm text-foreground/50">
                    {paper.total_pages}p &middot;{" "}
                    {new Date(paper.upload_date).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, paper.id)}
                  className="ml-4 p-2 text-foreground/30 hover:text-red-500 transition-colors"
                  title="삭제"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
