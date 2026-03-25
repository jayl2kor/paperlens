import axios from "axios";
import { getToken } from "./auth";

const api = axios.create({
  baseURL: "/api",
});

// Attach JWT token to every request
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Redirect to /login on 401/403
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 ||
      error.response?.status === 403
    ) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

/** Build auth headers for raw fetch calls (SSE streaming). */
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Paper Types ──────────────────────────────────────────────────────────────

export interface PaperResponse {
  id: number;
  title: string;
  authors: string[];
  filename: string;
  upload_date: string;
  total_pages: number;
  tags: string[];
}

export interface PaperDetailResponse extends PaperResponse {
  full_text: string | null;
  structured_content: unknown;
}

// ── AI Types ─────────────────────────────────────────────────────────────────

export interface HighlightItem {
  category: "novelty" | "method" | "result";
  text: string;
  reason: string;
  page: number;
  bbox: { x: number; y: number; w: number; h: number };
  page_width: number;
  page_height: number;
}

export interface AutoHighlightResponse {
  highlights: HighlightItem[];
}

// ── Paper API ────────────────────────────────────────────────────────────────

export async function uploadPaper(file: File): Promise<PaperResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<PaperResponse>("/papers/upload", formData);
  return data;
}

export async function listPapers(params?: {
  q?: string;
  tag?: string;
}): Promise<PaperResponse[]> {
  const { data } = await api.get<PaperResponse[]>("/papers", { params });
  return data;
}

export async function getPaper(id: number): Promise<PaperDetailResponse> {
  const { data } = await api.get<PaperDetailResponse>(`/papers/${id}`);
  return data;
}

export async function deletePaper(id: number): Promise<void> {
  await api.delete(`/papers/${id}`);
}

export async function getPaperFileBlob(id: number): Promise<Blob> {
  const resp = await api.get(`/papers/${id}/file`, { responseType: "blob" });
  return resp.data;
}

export function getPaperFileUrl(id: number): string {
  return `/api/papers/${id}/file`;
}

// ── SSE Helper ──────────────────────────────────────────────────────────────

export type ChatMode = "general" | "limitations" | "connections";

async function readSSE(
  response: Response,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal?: AbortSignal
): Promise<void> {
  if (!response.body) {
    onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === "chunk" || data.type === "cached")
            onChunk(data.content);
          else if (data.type === "error") onError(data.content);
          else if (data.type === "done") {
            doneReceived = true;
            onDone();
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    throw err;
  } finally {
    reader.cancel().catch(() => {});
  }

  if (!doneReceived) onDone();
}

// ── AI API ───────────────────────────────────────────────────────────────────

export async function streamSummary(
  paperId: number,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/ai/summary/${paperId}`, {
    method: "POST",
    headers: authHeaders(),
    signal,
  });

  if (!response.ok || !response.body) {
    onError("요약 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError, signal);
}

export async function getAutoHighlights(
  paperId: number
): Promise<AutoHighlightResponse> {
  const { data } = await api.post<AutoHighlightResponse>(
    `/ai/auto-highlight/${paperId}`
  );
  return data;
}

// ── Explain API ─────────────────────────────────────────────────────────────

export async function streamExplain(
  paperId: number,
  selectedText: string,
  context: string,
  contentType: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/ai/explain/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      selected_text: selectedText,
      context,
      content_type: contentType,
      page: 1,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    onError("설명 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError, signal);
}

// ── Translate API ───────────────────────────────────────────────────────────

export async function streamTranslate(
  paperId: number,
  text: string,
  page: number,
  targetLanguage: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/ai/translate/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      text,
      page,
      target_language: targetLanguage,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    onError("번역 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError, signal);
}

// ── Chat API ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  mode: ChatMode;
  created_at: string;
}

export interface CitationItem {
  number: number;
  raw_text: string;
  summary: string;
}

export interface CitationsResponse {
  citations: CitationItem[];
}

export async function streamChat(
  paperId: number,
  question: string,
  mode: ChatMode,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch(`/api/ai/chat/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ question, mode }),
    signal,
  });

  if (!response.ok || !response.body) {
    onError("채팅 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError, signal);
}

export async function getChatHistory(
  paperId: number
): Promise<ChatMessage[]> {
  const { data } = await api.get<ChatMessage[]>(
    `/ai/chat/${paperId}/history`
  );
  return data;
}

export async function getCitations(
  paperId: number
): Promise<CitationsResponse> {
  const { data } = await api.post<CitationsResponse>(
    `/ai/citations/${paperId}`
  );
  return data;
}

// ── User Highlight Types & API ──────────────────────────────────────────────

export interface UserHighlightItem {
  id: number;
  paper_id: number;
  text: string;
  color: string;
  page: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserHighlightCreate {
  text: string;
  color?: string;
  page: number;
  note?: string | null;
}

export async function listHighlights(
  paperId: number
): Promise<UserHighlightItem[]> {
  const { data } = await api.get<UserHighlightItem[]>(
    `/papers/${paperId}/highlights`
  );
  return data;
}

export async function createHighlight(
  paperId: number,
  body: UserHighlightCreate
): Promise<UserHighlightItem> {
  const { data } = await api.post<UserHighlightItem>(
    `/papers/${paperId}/highlights`,
    body
  );
  return data;
}

export async function updateHighlight(
  paperId: number,
  highlightId: number,
  body: { color?: string; note?: string | null }
): Promise<UserHighlightItem> {
  const { data } = await api.patch<UserHighlightItem>(
    `/papers/${paperId}/highlights/${highlightId}`,
    body
  );
  return data;
}

export async function deleteHighlight(
  paperId: number,
  highlightId: number
): Promise<void> {
  await api.delete(`/papers/${paperId}/highlights/${highlightId}`);
}

// ── Formula API ─────────────────────────────────────────────────────────────

export interface FormulaResponse {
  latex: string;
  page: number;
}

export async function getFormulaLatex(
  paperId: number,
  page: number,
  bbox: { x: number; y: number; w: number; h: number }
): Promise<FormulaResponse> {
  const { data } = await api.post<FormulaResponse>(
    `/ai/formula/${paperId}`,
    { page, bbox }
  );
  return data;
}

// ── Tags API ────────────────────────────────────────────────────────────────

export async function updatePaperTags(
  paperId: number,
  tags: string[]
): Promise<PaperResponse> {
  const { data } = await api.put<PaperResponse>(
    `/papers/${paperId}/tags`,
    tags
  );
  return data;
}

export async function listAllTags(): Promise<string[]> {
  const { data } = await api.get<string[]>("/papers/meta/tags");
  return data;
}

// ── Export API ───────────────────────────────────────────────────────────────

export async function downloadExportMarkdown(paperId: number, filename: string): Promise<void> {
  const resp = await api.get(`/papers/${paperId}/export/markdown`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(resp.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getExportMarkdownUrl(paperId: number): string {
  return `/api/papers/${paperId}/export/markdown`;
}

// ── Settings API ────────────────────────────────────────────────────────────

export interface AppSettings {
  api_key_configured: boolean;
  default_language: string;
  highlight_color: string;
  claude_model: string;
}

export async function getSettings(): Promise<AppSettings> {
  const { data } = await api.get<AppSettings>("/settings");
  return data;
}

export async function updateSettings(
  body: Partial<AppSettings>
): Promise<AppSettings> {
  const { data } = await api.put<AppSettings>("/settings", body);
  return data;
}
