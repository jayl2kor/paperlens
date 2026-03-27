"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  type PaperResponse,
  deletePaper,
  listPapers,
  uploadPaper,
  listAllTags,
  updatePaperTags,
} from "@/lib/api";
import SettingsDrawer from "@/components/SettingsDrawer";
import { isAuthenticated, getUser, logout, type UserInfo } from "@/lib/auth";

export default function HomePage() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [papers, setPapers] = useState<PaperResponse[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [editingTagPaper, setEditingTagPaper] = useState<number | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const loadPapers = useCallback(async () => {
    try {
      const data = await listPapers({
        q: searchQuery || undefined,
        tag: selectedTag || undefined,
      });
      setPapers(data);
    } catch {
      // handled by 401 interceptor
    }
  }, [searchQuery, selectedTag]);

  const loadTags = useCallback(async () => {
    try {
      const tags = await listAllTags();
      setAllTags(tags);
    } catch {
      // handled by 401 interceptor
    }
  }, []);

  // Load user if authenticated, and kick off tag loading
  useEffect(() => {
    if (isAuthenticated()) {
      setUser(getUser());
    }
    loadTags();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch papers on mount and when search/tag filters change
  useEffect(() => {
    loadPapers();
  }, [searchQuery, selectedTag]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        // Escape in search bar: clear + blur
        if (e.key === "Escape" && e.target === searchInputRef.current) {
          setSearchQuery("");
          searchInputRef.current?.blur();
        }
        return;
      }

      if (e.key === "/" || (e.key === "k" && (e.metaKey || e.ctrlKey))) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === "," && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) return;
    setUploading(true);
    setUploadError(null);
    try {
      const paper = await uploadPaper(file);
      router.push(`/paper/${paper.id}`);
    } catch {
      setUploadError("PDF 업로드에 실패했습니다. 다시 시도해 주세요.");
      setTimeout(() => setUploadError(null), 5000);
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

  const handleDeleteClick = (
    e: React.MouseEvent,
    id: number,
    title: string
  ) => {
    e.stopPropagation();
    setDeleteConfirm({ id, title });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    await deletePaper(deleteConfirm.id);
    setDeleteConfirm(null);
    loadPapers();
    loadTags();
  };

  const handleAddTag = async (paperId: number) => {
    const tag = tagInput.trim();
    if (!tag) return;
    const paper = papers.find((p) => p.id === paperId);
    if (!paper) return;
    const newTags = [...(paper.tags || []), tag];
    await updatePaperTags(paperId, newTags);
    setTagInput("");
    loadPapers();
    loadTags();
  };

  const handleRemoveTag = async (
    e: React.MouseEvent,
    paperId: number,
    tag: string
  ) => {
    e.stopPropagation();
    const paper = papers.find((p) => p.id === paperId);
    if (!paper) return;
    const newTags = (paper.tags || []).filter((t) => t !== tag);
    await updatePaperTags(paperId, newTags);
    loadPapers();
    loadTags();
  };

  return (
    <div className="min-h-full flex flex-col items-center px-4 py-16">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <h1 className="text-3xl font-bold">Paperlens</h1>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-2 rounded-lg text-foreground/50 hover:text-foreground/80 hover:bg-foreground/5 transition-colors"
          title="설정 (⌘,)"
          aria-label="설정"
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
              strokeWidth={1.5}
              d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7 7 0 010 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a7 7 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a7 7 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7 7 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
        {user ? (
          <div className="flex items-center gap-2 ml-2">
            <span className="text-sm text-foreground/50">{user.name}</span>
            <button
              onClick={() => {
                logout();
                window.location.reload();
              }}
              className="text-xs text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <button
            onClick={() => router.push("/login")}
            className="ml-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition-colors"
          >
            로그인
          </button>
        )}
      </div>
      <p className="text-foreground/60 mb-12">
        AI 기반 논문 리딩 도구 — 논문 파악 시간을 획기적으로 단축
      </p>

      {/* Upload area */}
      <div
        className={`w-full max-w-xl border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          uploadError
            ? "border-red-400 bg-red-50 dark:bg-red-950/30"
            : dragOver
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
              : "border-foreground/20 hover:border-foreground/40"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onClick={() => {
          setUploadError(null);
          fileInputRef.current?.click();
        }}
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
        ) : uploadError ? (
          <div className="flex flex-col items-center gap-3">
            <svg
              className="w-12 h-12 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
              />
            </svg>
            <p className="text-red-500 text-sm">{uploadError}</p>
            <p className="text-foreground/40 text-xs">
              클릭하여 다시 시도
            </p>
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

      {/* Paper library */}
      <div className="w-full max-w-2xl mt-16 pt-8 border-t border-foreground/5">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold">논문 라이브러리</h2>
          <span className="text-sm text-foreground/40">{papers.length}</span>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="제목, 저자, 파일명으로 검색..."
            className="w-full pl-10 pr-20 py-2.5 rounded-lg border border-foreground/15 bg-foreground/[0.03] text-sm placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 transition-all"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/30 hover:text-foreground/60"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          ) : (
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-foreground/30 bg-foreground/[0.06] rounded border border-foreground/10">
              ⌘K
            </kbd>
          )}
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6">
            <button
              onClick={() => setSelectedTag(null)}
              className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                selectedTag === null
                  ? "bg-foreground text-background font-medium"
                  : "text-foreground/50 hover:bg-foreground/5"
              }`}
            >
              전체
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() =>
                  setSelectedTag(selectedTag === tag ? null : tag)
                }
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  selectedTag === tag
                    ? "bg-blue-500 text-white font-medium"
                    : "bg-foreground/5 text-foreground/50 hover:bg-foreground/10"
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        )}

        {/* Paper list */}
        {papers.length === 0 ? (
          <div className="flex flex-col items-center py-12 gap-3">
            <div className="w-16 h-16 rounded-2xl bg-foreground/[0.04] flex items-center justify-center">
              <svg
                className="w-8 h-8 text-foreground/20"
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
            </div>
            {searchQuery || selectedTag ? (
              <>
                <p className="text-sm font-medium text-foreground/50">
                  &ldquo;{searchQuery || selectedTag}&rdquo;에 대한 검색 결과가
                  없습니다
                </p>
                <p className="text-xs text-foreground/30">
                  제목, 저자, 파일명으로 검색할 수 있습니다.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTag(null);
                  }}
                  className="mt-1 text-xs text-blue-500 hover:text-blue-600 font-medium"
                >
                  검색어 지우기
                </button>
              </>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground/50">
                  논문 라이브러리가 비어 있습니다
                </p>
                <p className="text-xs text-foreground/30">
                  PDF를 업로드하면 AI가 요약, 번역, 수식 설명을 제공합니다.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-1 px-4 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                >
                  PDF 업로드
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {papers.map((paper) => (
              <div
                key={paper.id}
                className="group p-4 rounded-lg border border-foreground/[0.08] hover:border-foreground/15 hover:bg-foreground/[0.02] cursor-pointer transition-all duration-150"
                onClick={() => router.push(`/paper/${paper.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm leading-snug line-clamp-2">
                      {paper.title}
                    </p>
                    {paper.authors?.length > 0 && (
                      <p className="text-xs text-foreground/55 line-clamp-1 mt-0.5">
                        {paper.authors.join(", ")}
                      </p>
                    )}
                    <p className="text-xs text-foreground/40 mt-1">
                      {paper.total_pages}p &middot;{" "}
                      {new Date(paper.upload_date).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <button
                    onClick={(e) =>
                      handleDeleteClick(e, paper.id, paper.title)
                    }
                    className="ml-4 p-2 text-foreground/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
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

                {/* Tags */}
                <div className="flex flex-wrap items-center gap-1 mt-2">
                  {(paper.tags || []).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400"
                    >
                      {tag}
                      <button
                        onClick={(e) => handleRemoveTag(e, paper.id, tag)}
                        className="ml-0.5 hover:text-red-500"
                      >
                        <svg
                          className="w-3 h-3"
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
                    </span>
                  ))}

                  {/* Add tag button / input */}
                  {editingTagPaper === paper.id ? (
                    <form
                      className="inline-flex"
                      onSubmit={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleAddTag(paper.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={tagInputRef}
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onBlur={() => {
                          if (!tagInput.trim()) setEditingTagPaper(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setEditingTagPaper(null);
                            setTagInput("");
                          }
                        }}
                        placeholder="태그 입력"
                        className="w-20 px-1.5 py-0.5 text-xs rounded border border-foreground/20 bg-background focus:outline-none focus:ring-1 focus:ring-blue-500"
                        autoFocus
                      />
                    </form>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingTagPaper(paper.id);
                        setTagInput("");
                      }}
                      className="px-1.5 py-0.5 text-xs rounded-full text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      + 태그
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Drawer */}
      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/30"
            onClick={() => setDeleteConfirm(null)}
          />
          <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-background rounded-xl border border-foreground/10 shadow-xl p-6">
            <h3 className="font-semibold mb-2">논문 삭제</h3>
            <p className="text-sm text-foreground/70 mb-1">
              &ldquo;{deleteConfirm.title}&rdquo;
            </p>
            <p className="text-xs text-foreground/50 mb-5">
              이 작업은 되돌릴 수 없으며, 관련 하이라이트와 AI 대화 기록도 함께
              삭제됩니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm rounded-lg hover:bg-foreground/5 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 text-sm rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
