# Paperlens

AI 기반 논문 리딩 도구 — 요약, 수식 설명, 번역, AI 토론으로 논문 파악 시간을 획기적으로 단축합니다.

![Python](https://img.shields.io/badge/Python-3.12-blue)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/License-MIT-green)

## 주요 기능

| 기능 | 설명 |
|------|------|
| **AI 요약** | 3줄 요약 + 방법론 요약을 SSE 스트리밍으로 제공 |
| **오토 하이라이트** | 논문 로드 시 독창성/방법/결과를 자동 하이라이트 |
| **선택 설명** | 텍스트를 선택하면 문맥 기반 설명 제공 |
| **번역** | 한국어, 영어, 일본어, 중국어 번역 |
| **수식 추출** | PDF 영역에서 LaTeX 수식을 추출하고 렌더링 |
| **AI 채팅** | 논문에 대해 질문 (일반/한계점/연결) |
| **인용 분석** | 논문 내 인용 관계 추출 |
| **유저 하이라이트** | 5색 하이라이트 + 메모, 마크다운 내보내기 |
| **논문 관리** | 태그, 검색(제목/저자/파일명), 필터링 |
| **브라우저 에이전트** | arXiv/Google Scholar 자동 검색 및 PDF 다운로드 |

## 데모

```
PDF 업로드 → AI 자동 요약 & 하이라이트 → 텍스트 선택으로 설명/번역 → AI 채팅으로 심층 분석
```

## 빠른 시작

### Docker (권장)

```bash
git clone https://github.com/your-username/paperlens.git
cd paperlens

# 환경 변수 설정
cat > .env << EOF
ANTHROPIC_API_KEY=sk-ant-...
JWT_SECRET=$(openssl rand -base64 32)
EOF

# 실행
docker compose up -d
```

http://localhost:3000 에서 접속 가능합니다.

### 로컬 개발

**백엔드**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# .env 파일 생성
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

uvicorn app.main:app --reload --port 8081
```

**프론트엔드**

```bash
cd frontend
npm install
npm run dev
```

http://localhost:3000 에서 접속, API는 자동으로 백엔드(8081)로 프록시됩니다.

## 환경 변수

| 변수 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `ANTHROPIC_API_KEY` | O | - | Claude API 키 |
| `JWT_SECRET` | - | 자동 생성 | JWT 서명 키 (프로덕션에서는 필수 설정) |
| `DATABASE_URL` | - | `sqlite:///./data/paperlens.db` | 데이터베이스 URL |
| `CLAUDE_MODEL` | - | `claude-sonnet-4-20250514` | 사용할 Claude 모델 |
| `MAX_UPLOAD_SIZE_MB` | - | `50` | 최대 업로드 크기 (MB) |

## 기술 스택

**백엔드**
- FastAPI + SQLAlchemy + SQLite
- PyMuPDF — PDF 파싱, 텍스트/수식 추출
- Anthropic SDK — Claude API 연동
- bcrypt + python-jose — JWT 인증

**프론트엔드**
- Next.js 16 (App Router) + React 19 + TypeScript
- react-pdf — PDF 렌더링
- KaTeX — LaTeX 수식 렌더링
- Zustand — 상태 관리
- Tailwind CSS 4

## 프로젝트 구조

```
paperlens/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 엔트리포인트
│   │   ├── config.py            # 설정 관리
│   │   ├── auth.py              # JWT 인증
│   │   ├── api/
│   │   │   ├── papers.py        # 논문 CRUD, 태그, 내보내기
│   │   │   ├── ai.py            # AI 요약/설명/번역/채팅
│   │   │   ├── highlights.py    # 유저 하이라이트 CRUD
│   │   │   ├── auth.py          # 회원가입/로그인
│   │   │   ├── settings.py      # 사용자 설정
│   │   │   └── browser_agent.py # 논문 검색 에이전트
│   │   ├── models/              # SQLAlchemy 모델
│   │   └── services/            # PDF 파싱, AI 서비스
│   ├── tests/                   # pytest 테스트
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js 페이지
│   │   ├── components/
│   │   │   ├── pdf/             # PDF 뷰어, 하이라이트, 툴바
│   │   │   └── sidebar/         # 요약, 번역, 채팅, 노트 패널
│   │   ├── lib/                 # API 클라이언트, 인증
│   │   └── stores/              # Zustand 상태 관리
│   ├── Dockerfile
│   └── package.json
└── docker-compose.yml
```

## API 개요

모든 API는 JWT 인증이 필요합니다 (`/api/auth/*`, `/api/health` 제외).

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 |
| POST | `/api/papers/upload` | PDF 업로드 |
| GET | `/api/papers` | 논문 목록 (검색/태그 필터) |
| GET | `/api/papers/{id}/file` | PDF 파일 다운로드 |
| POST | `/api/ai/summary/{id}` | AI 요약 (SSE) |
| POST | `/api/ai/explain/{id}` | 선택 텍스트 설명 (SSE) |
| POST | `/api/ai/translate/{id}` | 번역 (SSE) |
| POST | `/api/ai/chat/{id}` | AI 채팅 (SSE) |
| POST | `/api/ai/formula/{id}` | 수식 LaTeX 추출 |
| POST | `/api/ai/auto-highlight/{id}` | 자동 하이라이트 |
| POST | `/api/ai/citations/{id}` | 인용 분석 |
| GET/POST/PATCH/DELETE | `/api/papers/{id}/highlights/*` | 하이라이트 CRUD |
| GET/PUT | `/api/settings` | 사용자 설정 |

## 테스트

```bash
cd backend
pip install pytest httpx
pytest -v
```

## 키보드 단축키

| 단축키 | 동작 |
|--------|------|
| `/` 또는 `Cmd+K` | 논문 검색 |
| `Cmd+,` | 설정 열기 |
| `Cmd+B` | 사이드바 토글 |
| `Cmd+H` | 하이라이트 토글 |
| `Alt+1~4` | 사이드바 탭 전환 |
| `Esc` | 검색 해제 |

## 라이선스

MIT
