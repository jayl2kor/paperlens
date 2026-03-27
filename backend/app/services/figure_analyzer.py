"""Figure/graph analysis — strategy pattern for swappable implementations.

Current: TextBasedAnalyzer (captions + body references, no Vision API)
Future:  VisionAnalyzer (extract images, send to Vision API)
"""

from abc import ABC, abstractmethod

from sqlalchemy.orm import Session

from app.services.ai_service import _cached_json_call, _truncate


class FigureAnalyzer(ABC):
    """Interface for figure analysis strategies."""

    @abstractmethod
    async def analyze(
        self,
        paper_id: int,
        full_text: str,
        structured_content: dict | None,
        file_path: str,
        db: Session,
    ) -> list[dict]:
        """Analyze figures and return structured results."""


# ── Text-based implementation (no Vision API) ────────────────────────────────

_FIGURE_SYSTEM = (
    "You are an expert STEM paper analyst specializing in figure and graph interpretation. "
    "Analyze figures based on their captions, in-text references, and related data from the paper."
)

_FIGURE_USER = """논문의 그래프/차트/그림을 분석해주세요.
본문과 캡션에서 Figure/Fig./Table 참조를 찾아 각각 분석합니다.

논문 전문:
{text}

각 Figure/Table에 대해 다음을 분석해주세요:

JSON 형식:
{{
  "figures": [
    {{
      "id": "Fig. 1",
      "caption": "원문 캡션",
      "figure_type": "line_chart|bar_chart|scatter|heatmap|diagram|table|photo|other",
      "axes": {{"x": "X축 (단위)", "y": "Y축 (단위)"}},
      "data_summary": "그래프가 보여주는 데이터 요약",
      "key_findings": ["핵심 발견 1", "핵심 발견 2"],
      "trends": "트렌드/패턴 분석",
      "related_values": [{{"parameter": "변수명", "value": "값", "unit": "단위"}}],
      "significance": "논문 전체에서의 의의",
      "page_ref": "본문에서 언급된 위치 (e.g., Section 3.2)"
    }}
  ]
}}

규칙:
- 본문에서 "Figure X shows...", "as shown in Fig. X" 등 참조 문장을 반드시 반영
- 캡션에 포함된 수치 정보를 related_values에 추출
- Figure 2의 데이터표 추출 결과와 연결 가능한 값이 있으면 교차 참조
- 본문에 언급되지 않은 시각적 정보는 추론하지 말 것"""


class TextBasedAnalyzer(FigureAnalyzer):
    """Analyze figures using only text: captions + body references."""

    async def analyze(
        self,
        paper_id: int,
        full_text: str,
        structured_content: dict | None,
        file_path: str,
        db: Session,
    ) -> list[dict]:
        return await _cached_json_call(
            paper_id,
            "figure_analysis",
            _FIGURE_SYSTEM,
            _FIGURE_USER.format(text=_truncate(full_text)),
            "figures",
            db,
        )


# ── Factory ──────────────────────────────────────────────────────────────────

_analyzer: FigureAnalyzer = TextBasedAnalyzer()


def get_figure_analyzer() -> FigureAnalyzer:
    """Return the active figure analyzer implementation."""
    return _analyzer


def set_figure_analyzer(analyzer: FigureAnalyzer) -> None:
    """Swap the figure analyzer implementation at runtime."""
    global _analyzer
    _analyzer = analyzer
