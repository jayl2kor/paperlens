import axios from "axios";

const api = axios.create({
  baseURL: "/api",
});

// ── Paper Types ──────────────────────────────────────────────────────────────

export interface PaperResponse {
  id: number;
  title: string;
  filename: string;
  upload_date: string;
  total_pages: number;
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

export async function listPapers(): Promise<PaperResponse[]> {
  const { data } = await api.get<PaperResponse[]>("/papers");
  return data;
}

export async function getPaper(id: number): Promise<PaperDetailResponse> {
  const { data } = await api.get<PaperDetailResponse>(`/papers/${id}`);
  return data;
}

export async function deletePaper(id: number): Promise<void> {
  await api.delete(`/papers/${id}`);
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
  onError: (msg: string) => void
): Promise<void> {
  if (!response.body) {
    onDone();
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReceived = false;

  while (true) {
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

  if (!doneReceived) onDone();
}

// ── AI API ───────────────────────────────────────────────────────────────────

export async function streamSummary(
  paperId: number,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): Promise<void> {
  const response = await fetch(`/api/ai/summary/${paperId}`, {
    method: "POST",
  });

  if (!response.ok || !response.body) {
    onError("요약 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError);
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
  onError: (msg: string) => void
): Promise<void> {
  const response = await fetch(`/api/ai/explain/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      selected_text: selectedText,
      context,
      content_type: contentType,
      page: 1,
    }),
  });

  if (!response.ok || !response.body) {
    onError("설명 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError);
}

// ── Translate API ───────────────────────────────────────────────────────────

export async function streamTranslate(
  paperId: number,
  text: string,
  page: number,
  targetLanguage: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (msg: string) => void
): Promise<void> {
  const response = await fetch(`/api/ai/translate/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      page,
      target_language: targetLanguage,
    }),
  });

  if (!response.ok || !response.body) {
    onError("번역 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError);
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
  onError: (msg: string) => void
): Promise<void> {
  const response = await fetch(`/api/ai/chat/${paperId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, mode }),
  });

  if (!response.ok || !response.body) {
    onError("채팅 요청에 실패했습니다.");
    return;
  }

  await readSSE(response, onChunk, onDone, onError);
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
