"""브라우저 에이전트 API — 논문 검색/다운로드 + FE 검증."""

import asyncio
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.browser_agent import (
    TestResult,
    search_and_download_paper,
    verify_frontend,
)

router = APIRouter(prefix="/api/agent", tags=["browser-agent"])

AGENT_TIMEOUT = 300  # 5분


class PaperSearchRequest(BaseModel):
    query: str
    max_papers: int = 1
    source: Literal["arxiv", "google_scholar"] = "arxiv"


class PaperSearchResult(BaseModel):
    title: str
    url: str
    pdf_path: str


class PaperSearchResponse(BaseModel):
    results: list[PaperSearchResult]


class VerifyRequest(BaseModel):
    scenario: str
    base_url: str = "http://localhost:3000"


class TestStep(BaseModel):
    step: str
    passed: bool
    error: str = ""


class VerifyResponse(BaseModel):
    passed: bool
    summary: str
    steps: list[TestStep]
    errors: list[str]


@router.post("/search", response_model=PaperSearchResponse)
async def search_papers(body: PaperSearchRequest):
    """브라우저 에이전트로 논문을 검색하고 PDF를 다운로드한다."""
    try:
        results = await asyncio.wait_for(
            search_and_download_paper(
                body.query,
                max_papers=body.max_papers,
                source=body.source,
                headless=True,
            ),
            timeout=AGENT_TIMEOUT,
        )
        return PaperSearchResponse(
            results=[PaperSearchResult(**r) for r in results]
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="에이전트 실행 시간 초과")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"에이전트 실행 실패: {e}")


@router.post("/verify", response_model=VerifyResponse)
async def verify_fe(body: VerifyRequest):
    """브라우저 에이전트로 프론트엔드 E2E 검증을 수행한다."""
    try:
        result: TestResult = await asyncio.wait_for(
            verify_frontend(
                body.scenario,
                base_url=body.base_url,
                headless=True,
            ),
            timeout=AGENT_TIMEOUT,
        )
        return VerifyResponse(
            passed=result.passed,
            summary=result.summary,
            steps=[TestStep(**s) for s in result.steps],
            errors=result.errors,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="검증 실행 시간 초과")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"검증 실행 실패: {e}")
