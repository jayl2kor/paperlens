# Requirements: paperlens

Generated: 2026-03-22

## Project
- **name**: paperlens
- **purpose**: AI 기반 논문 리딩 도구 — 요약, 수식 설명, 번역, AI 토론 등으로 논문 파악 시간을 획기적으로 단축
- **users**: 논문을 읽는 모든 사람 (연구자, 학생, 개발자 등)
- **repo_path**: /Users/user/git/paperlens

## Stack
- **language**: Python, TypeScript
- **framework**: FastAPI (backend), Next.js + React (frontend)
- **database**: TBD (사용자 하이라이트/주석 저장용)
- **infrastructure**: TBD
- **key_libraries**:
  - PDF 파싱: PyMuPDF (fitz), pdfplumber, or marker
  - LaTeX 수식: KaTeX or MathJax (프론트엔드 렌더링)
  - PDF 뷰어: react-pdf or pdf.js
  - AI/LLM: anthropic SDK or openai SDK
- **external_apis**:
  - LLM API (Claude API 등 — 요약, 설명, 번역, Q&A용)

## Features

### 1. 빠른 파악
- [ ] **3줄 & 핵심 요약**: 3줄 요약 + 반 페이지 방법론 요약. 공유 가능
- [ ] **오토 하이라이트**: 논문 로드 시 AI가 독창성·방법·결과를 자동 하이라이트

### 2. 심층 이해
- [ ] **문장/표/수식 설명**: 마우스 오버 시 AI가 쉽게 설명
- [ ] **LaTeX 수식 복사**: 클릭 한 번으로 완벽한 LaTeX 문법 복사
- [ ] **맥락 기반 번역**: 원문·번역문 나란히 비교 + 분야별 용어 반영

### 3. AI 토론
- [ ] **AI와 토론하기**: 논문 기반 Q&A, 한계점 분석, 연구 연결 탐색
- [ ] **스마트 인용**: 참고문헌 요약 정보를 인라인으로 표시

### 4. 사용자 기록
- [ ] **하이라이트 & 주석**: 다색 하이라이트 + 주석 기능, 사이드바에 정리

## Workflows
- [x] feature development
- [ ] code review
- [ ] deployment

## Agents Needed
| Agent | Purpose | Source | Action |
|-------|---------|--------|--------|
| code-reviewer | 코드 품질 검토 | bundled | apply |
| ui-designer | PDF 뷰어 UI/인터랙션 설계 | bundled | apply |
| ux-designer | 사용자 경험 흐름 설계 | bundled | apply |

## Skills Needed
| Skill | Purpose | Source | Action |
|-------|---------|--------|--------|
| code-formatting | 일관된 코드 스타일 (Python + TS) | bundled | apply |
| antipattern-detection | 코드 리뷰·리팩토링 시 안티패턴 감지 | bundled | apply |
| backend-patterns | FastAPI API 설계, 서비스 아키텍처 | bundled | apply |
| frontend-patterns | React 컴포넌트 설계, 상태 관리 | bundled | apply |
| deep-research | 기술 선택·아키텍처 결정 시 심층 리서치 | bundled | apply |
| seo | Next.js SSR 기반 SEO 최적화 | bundled | apply |

## Memory Seeds
| File | Type | Content Summary |
|------|------|-----------------|
| project.md | project | 프로젝트 개요 및 목적 |
| stack.md | reference | 기술 스택 참조 |

## Permissions
allow:
  - Bash(git:*)
  - Bash(npm:*)
  - Bash(pip:*)
  - Bash(python:*)
  - Bash(npx:*)
deny: []

## Hooks
| Event | Trigger | Action |
|-------|---------|--------|
| Stop | 항상 | Quality Gate 체크리스트 출력 |
