# paperlens

AI 기반 논문 리딩 도구 — 요약, 수식 설명, 번역, AI 토론 등으로 논문 파악 시간을 획기적으로 단축

## Quick Start
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Architecture
- **Frontend**: Next.js + React (TypeScript) — PDF 뷰어, 인터랙션 UI
- **Backend**: FastAPI (Python) — PDF 파싱, AI 처리, API 서버
- **PDF 파싱**: PyMuPDF / pdfplumber — LaTeX 기반 논문 PDF 처리
- **AI/LLM**: Claude API 또는 OpenAI API — 요약, 설명, 번역, Q&A

## Key Files
```
paperlens/
├── backend/
│   ├── app/
│   │   ├── main.py          # FastAPI 앱 엔트리포인트
│   │   ├── api/             # API 라우터
│   │   ├── services/        # 비즈니스 로직 (PDF 파싱, AI 처리)
│   │   └── models/          # Pydantic 모델
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router
│   │   ├── components/      # React 컴포넌트
│   │   └── lib/             # 유틸리티, API 클라이언트
│   └── package.json
├── docs/
│   ├── requirements.md      # 프로젝트 요구사항
│   └── plan.md              # 구현 로드맵
└── CLAUDE.md
```

## Code Style
- **Python**: snake_case, type hints 사용, Black 포매터
- **TypeScript**: camelCase, strict mode, ESLint + Prettier
- **커밋 메시지**: 한글 또는 영어, 동사로 시작

## Testing
```bash
# Backend
cd backend && pytest

# Frontend
cd frontend && npm test
```

## Gotchas
- LaTeX 수식이 포함된 PDF는 일반 텍스트 추출로 수식이 깨질 수 있음 — 수식 영역 별도 처리 필요
- PDF.js와 PyMuPDF의 페이지 인덱스가 다를 수 있음 (0-based vs 1-based)
- LLM API 호출 시 토큰 제한 주의 — 긴 논문은 청크 분할 필요

## Workflows
1. **기능 개발**: 브랜치 생성 → 구현 → 테스트 → PR
2. **PDF 파싱 테스트**: 다양한 형식의 논문 PDF로 파싱 결과 검증

## Quality Gates

기능 구현 완료 후, PR 생성 전, 또는 주요 마일스톤마다 아래 커맨드를 순서대로 실행한다.

### 기능 구현 완료 시
1. `/simplify` — 구현한 코드의 중복 제거, 복잡도 감소, 가독성 개선
2. `code-reviewer` 에이전트 호출 — DRY, SOLID, 프로젝트 컨벤션 준수 검토

### PR 생성 전
3. 테스트 실행: `cd backend && pytest` / `cd frontend && npm test`

### CLAUDE.md 업데이트 필요 시
- 새로 발견한 컨벤션, 빌드 명령 변경, 주의사항 반영

## Context 관리 (중요)

Claude의 컨텍스트 창은 유한하다. 큰 작업 단위가 끝날 때마다 아래 절차를 따른다.

### /clear 권장 시점
- 독립적인 기능 구현이 완료된 후
- 긴 디버깅 세션이 끝난 후
- 주제가 완전히 바뀌는 새 작업 시작 전
- 컨텍스트가 많이 소모되어 응답 품질이 떨어진다고 느낄 때

### /clear 전 필수 절차

1. **중요 컨텍스트를 memory에 저장** (Claude가 직접 실행):
   - 완료한 작업 요약 → `memory/session-log.md` 업데이트
   - 발견한 버그·해결책 → `memory/debugging.md`
   - 새로 파악한 컨벤션 → `memory/feedback-*.md`
   - 결정된 아키텍처 사항 → `memory/architecture.md`

2. **사용자에게 제안**: "작업이 완료됐습니다. `/clear`로 컨텍스트를 정리한 후 다음 작업을 시작하면 더 효율적입니다."

### /clear 후 세션 복원
새 세션 시작 시 Claude는 자동으로:
- CLAUDE.md 전체 로드
- `memory/MEMORY.md` 인덱스 첫 200줄 로드
- 필요한 memory 파일을 요청 시 추가 로드

## Installed Agents & Skills

| 컴포넌트 | 호출 방법 | 용도 |
|---------|----------|------|
| `code-reviewer` | "코드 리뷰해줘" / "review this" | 코드 품질, DRY, 컨벤션 |
| `ui-designer` | "UI 디자인 검토해줘" / "review UI" | 색상, 타이포, 스페이싱, 접근성 |
| `ux-designer` | "UX 검토해줘" / "review UX flow" | 사용자 흐름, 폼 설계, 에러 상태 |
| `/simplify` | `/simplify` | 코드 중복·복잡도 개선 |
| `/ui-ux-pro-max` | `/ui-ux-pro-max` | UI/UX 디자인 시스템 생성 |
