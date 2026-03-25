"""브라우저 에이전트 API — 논문 검색/다운로드 + FE 검증."""

import asyncio
import ipaddress
import logging
from typing import Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.models.user import User

logger = logging.getLogger(__name__)

from app.services.browser_agent import (
    TestResult,
    search_and_download_paper,
    verify_frontend,
)

router = APIRouter(prefix="/api/agent", tags=["browser-agent"])

AGENT_TIMEOUT = 300  # 5분

# SSRF prevention
_ALLOWED_HOSTS = {"localhost", "127.0.0.1", "frontend"}
_ALLOWED_PORTS = {3000, 3001}


def _validate_base_url(url: str) -> None:
    """Validate base_url against an allowlist to prevent SSRF."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=422, detail="허용되지 않는 URL 스키마입니다.")

    hostname = parsed.hostname or ""
    if hostname not in _ALLOWED_HOSTS:
        # Check if it resolves to a known-safe IP
        try:
            ip = ipaddress.ip_address(hostname)
            if str(ip) not in _ALLOWED_HOSTS:
                raise HTTPException(status_code=422, detail="허용되지 않는 호스트입니다.")
        except ValueError:
            raise HTTPException(status_code=422, detail="허용되지 않는 호스트입니다.")

    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    if port not in _ALLOWED_PORTS:
        raise HTTPException(status_code=422, detail="허용되지 않는 포트입니다.")


class PaperSearchRequest(BaseModel):
    query: str = Field(..., max_length=500)
    max_papers: int = Field(1, ge=1, le=5)
    source: Literal["arxiv", "google_scholar"] = "arxiv"


class PaperSearchResult(BaseModel):
    title: str
    url: str
    pdf_path: str


class PaperSearchResponse(BaseModel):
    results: list[PaperSearchResult]


class VerifyRequest(BaseModel):
    scenario: str = Field(..., max_length=2_000)
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
async def search_papers(body: PaperSearchRequest, user: User = Depends(get_current_user)):
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
    except Exception:
        logger.exception("Agent search failed for query: %s", body.query)
        raise HTTPException(status_code=500, detail="에이전트 실행 중 오류가 발생했습니다.")


@router.post("/verify", response_model=VerifyResponse)
async def verify_fe(body: VerifyRequest, user: User = Depends(get_current_user)):
    """브라우저 에이전트로 프론트엔드 E2E 검증을 수행한다."""
    _validate_base_url(body.base_url)
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
    except Exception:
        logger.exception("Frontend verification failed for scenario: %s", body.scenario)
        raise HTTPException(status_code=500, detail="검증 실행 중 오류가 발생했습니다.")
