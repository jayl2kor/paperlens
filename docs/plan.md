# Plan: paper-insight

Generated: 2026-03-22
Status: Planning

## Overview

AI 기반 논문 리딩 도구를 처음부터 구축한다. PDF 업로드/뷰어부터 AI 요약, 수식 처리, 번역, 토론, 하이라이트까지 8개 핵심 기능을 6단계로 구현한다.

## Architecture

```
paper-insight/
├── backend/          # FastAPI (Python)
│   ├── app/
│   │   ├── main.py, config.py, database.py
│   │   ├── api/      # papers, highlights, ai, citations 라우터
│   │   ├── services/  # pdf_parser, ai_service, formula_extractor 등
│   │   ├── models/    # SQLAlchemy + Pydantic 모델
│   │   └── prompts/   # LLM 프롬프트 템플릿
│   └── requirements.txt
├── frontend/         # Next.js + React (TypeScript)
│   └── src/
│       ├── app/       # App Router (landing, /paper/[id])
│       ├── components/ # pdf/, sidebar/, ui/
│       ├── hooks/     # usePdfDocument, useHighlights, useChat 등
│       ├── lib/       # API wrapper, pdf-utils
│       ├── stores/    # Zustand store
│       └── types/
└── docs/
```

- **DB**: SQLite + SQLAlchemy (papers, highlights, ai_cache, chat_messages)
- **Key libs**: PyMuPDF, marker-pdf, react-pdf, KaTeX, Zustand, shadcn/ui, anthropic SDK

## Implementation Phases

### Phase 1: Foundation

**목표**: PDF 업로드 + 기본 뷰어. 사용자가 PDF를 올리고 브라우저에서 읽을 수 있다.

**태스크**:
- [ ] 백엔드 scaffolding (FastAPI, config, database.py, SQLAlchemy models)
- [ ] 프론트엔드 scaffolding (Next.js + Tailwind + shadcn/ui)
- [ ] .gitignore, .env.example 설정
- [ ] PDF 업로드 API (`POST /api/papers/upload`, `GET /api/papers`, `GET /api/papers/{id}/file`)
- [ ] PDF 텍스트 추출 (PyMuPDF — full_text + structured_content with bbox)
- [ ] 프론트엔드 PDF 뷰어 (react-pdf, 페이지 네비게이션, 줌)
- [ ] 접이식 사이드바 레이아웃 + Zustand store

**완료 기준**: PDF 업로드 → 브라우저에서 렌더링 + 페이지 이동/줌 동작

### Phase 2: Quick Understanding — 요약 + 오토 하이라이트

**목표**: 논문 로드 시 AI가 3줄 요약 + 핵심 섹션 자동 하이라이트

**태스크**:
- [ ] AI 서비스 기반 (ai_service.py — API 래핑, 토큰 청킹, SSE 스트리밍, ai_cache 캐싱)
- [ ] 요약 API (`POST /api/ai/summary` — 3줄 요약 + 방법론 요약, 스트리밍)
- [ ] 오토 하이라이트 API (`POST /api/ai/auto-highlight` — novelty/method/result 영역 반환)
- [ ] 텍스트 매칭 (LLM 인용 → PDF 텍스트 fuzzy match로 bbox 찾기, rapidfuzz)
- [ ] Summary 사이드바 패널 (스트리밍 표시, 복사 버튼)
- [ ] HighlightLayer 컴포넌트 (색상별 오버레이, 토글 on/off)

**완료 기준**: 논문 열면 3줄 요약이 스트리밍, 핵심 섹션이 색상별로 하이라이트

### Phase 3: Deep Understanding — 설명 + LaTeX + 번역

**목표**: 텍스트 선택 → AI 설명, 수식 LaTeX 복사, 맥락 기반 번역

**태스크**:
- [ ] TextLayer 텍스트 선택 인프라 (선택 텍스트 + 페이지 + bbox + 주변 컨텍스트)
- [ ] 설명 API (`POST /api/ai/explain` — sentence/table/formula 구분, 스트리밍)
- [ ] ExplanationPopover 컴포넌트 (선택 후 "설명" 버튼 → 팝오버에 AI 응답)
- [ ] 수식 추출 (formula_extractor.py — marker + LLM 이미지→LaTeX 변환)
- [ ] FormulaRenderer + "Copy LaTeX" 버튼 (KaTeX 렌더링, 클립보드 복사)
- [ ] 번역 API (`POST /api/ai/translate` — 페이지/섹션 단위, 도메인 용어 보존)
- [ ] Translation 사이드바 패널 (원문·번역문 나란히, 문단 정렬)

**완료 기준**: 문장 선택 → 팝오버 설명, 수식 클릭 → LaTeX 복사, 번역 탭에서 한국어 번역 확인

### Phase 4: AI Discussion + Smart Citations

**목표**: 논문 기반 AI 채팅, 참고문헌 인라인 요약

**태스크**:
- [ ] 채팅 API (`POST /api/ai/chat` — general/limitations/connections 모드, 스트리밍)
- [ ] 컨텍스트 관리 (context_manager.py — 긴 논문은 질문 관련 섹션만 선택 포함)
- [ ] ChatPanel 사이드바 (모드 선택, 메시지 버블, 추천 질문 칩, react-markdown)
- [ ] 인용 추출 API (`POST /api/ai/citations` — 참고문헌 섹션 파싱 + AI 요약)
- [ ] CitationTooltip (PDF 내 [1] 등 클릭 시 참조 요약 툴팁)
- [ ] chat_messages 테이블로 대화 이력 영속화

**완료 기준**: "이 연구의 한계점은?" 질문 → 스트리밍 답변, [3] 호버 → 참조 요약 툴팁

### Phase 5: Highlights & Annotations + 폴리시

**목표**: 사용자 하이라이트/주석 + 전체 완성도 향상

**태스크**:
- [ ] 하이라이트 CRUD API (POST/GET/PUT/DELETE `/api/papers/{id}/highlights`)
- [ ] 텍스트 선택 → 색상 툴바 → 하이라이트 생성 UI
- [ ] HighlightList 사이드바 (페이지별 그룹, 클릭 시 스크롤 이동, 검색/필터)
- [ ] 주석 노트 (마크다운, 자동 저장)
- [ ] 에러 바운더리, 토스트 알림, 로딩 스켈레톤, 빈 상태
- [ ] 키보드 단축키 (Ctrl+C LaTeX, Escape 팝오버 닫기)
- [ ] 성능 최적화 (페이지 lazy load, API 디바운스, 캐싱)

**완료 기준**: 전체 8개 기능 동작, 안정적인 에러 처리, 쾌적한 UX

### Phase 6 (선택): Enhancement & 배포

**태스크**:
- [ ] 하이라이트/노트 Markdown 내보내기
- [ ] 논문 라이브러리 (태그, 폴더, 검색)
- [ ] docker-compose 로컬 배포
- [ ] 설정 페이지 (API 키, 기본 언어, 하이라이트 색상)

## Risks & Considerations

| 리스크 | 영향 | 대응 방안 |
|--------|------|----------|
| LaTeX 수식 추출 정확도 | High | marker + LLM 이중 파이프라인, "Edit LaTeX" 폴백 |
| 긴 논문 토큰 제한 | High | 섹션별 청킹, Claude 200K 컨텍스트 활용, 관련 섹션만 선택 |
| PDF.js ↔ PyMuPDF 좌표 불일치 | Med | 동일 좌표계(72 DPI), viewport 비율로 스케일링, 전용 유틸 |
| 하이라이트 bbox 줌/리사이즈 시 깨짐 | Med | 텍스트 오프셋 기반 저장, 렌더 시 재계산 |
| SSE 스트리밍 프록시 이슈 | Low | FastAPI 직접 호출 (개인 프로젝트이므로 CORS 허용) |

## Quality Gates (각 Phase 완료 시 필수)

- `/simplify` → `code-reviewer` 에이전트 호출
- PR 생성 전: 테스트 실행 (`pytest` / `npm test`)
- 브라우저에서 해당 기능 수동 테스트
