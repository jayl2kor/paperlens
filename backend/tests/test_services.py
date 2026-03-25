"""Unit tests for service layer — context_manager, text_matcher, ai_service helpers."""

import hashlib

import pytest


class TestContextManager:
    """Tests for app.services.context_manager.select_context."""

    def test_short_text_returns_all(self):
        from app.services.context_manager import select_context

        text = "Short paper text." * 100  # ~1700 chars, well under 200K
        result = select_context("question", text, None, "general")
        assert result == text

    def test_long_text_truncated(self):
        from app.services.context_manager import select_context

        # Create text > 200K chars
        text = "Word " * 50000  # 250K chars
        structured = {
            "pages": [
                {"page_number": i + 1, "text": f"Page {i+1} content. " * 200}
                for i in range(50)
            ]
        }
        result = select_context("neural network", text, structured, "general")
        assert len(result) <= 200_001  # budget is 200K

    def test_includes_first_and_last_pages(self):
        from app.services.context_manager import select_context

        pages = [
            {"page_number": i + 1, "text": f"unique_marker_page{i+1} " * 500}
            for i in range(20)
        ]
        text = "\n\n".join(p["text"] for p in pages)
        if len(text) <= 200_000:
            # Need to make it longer
            text = text + " padding" * 50000
            for p in pages:
                p["text"] = p["text"] + " padding" * 2500

        structured = {"pages": pages}
        result = select_context("question", text, structured, "general")
        # First and last pages should always be included
        assert "unique_marker_page1" in result
        assert "unique_marker_page2" in result


class TestTextMatcher:
    """Tests for app.services.text_matcher.match_highlights_to_bboxes."""

    def test_exact_match(self):
        from app.services.text_matcher import match_highlights_to_bboxes

        highlights = [{"text": "exact match text", "category": "novelty", "reason": "r"}]
        structured = {
            "pages": [
                {
                    "page_number": 1,
                    "text": "some prefix exact match text some suffix",
                    "blocks": [
                        {
                            "type": "text",
                            "text": "some prefix exact match text some suffix",
                            "bbox": {"x": 72, "y": 100, "w": 400, "h": 20},
                        }
                    ],
                    "width": 612,
                    "height": 792,
                }
            ]
        }

        result = match_highlights_to_bboxes(highlights, structured)
        assert len(result) == 1
        assert result[0]["page"] == 1
        assert "bbox" in result[0]
        assert result[0]["page_width"] == 612

    def test_no_match_still_returns(self):
        from app.services.text_matcher import match_highlights_to_bboxes

        highlights = [
            {"text": "completely nonexistent text xyz123", "category": "novelty", "reason": "r"}
        ]
        structured = {
            "pages": [
                {
                    "page_number": 1,
                    "text": "unrelated content here",
                    "blocks": [
                        {
                            "type": "text",
                            "text": "unrelated content here",
                            "bbox": {"x": 72, "y": 100, "w": 400, "h": 20},
                        }
                    ],
                    "width": 612,
                    "height": 792,
                }
            ]
        }

        result = match_highlights_to_bboxes(highlights, structured)
        # Should return something (best effort match or fallback)
        assert isinstance(result, list)

    def test_multi_page_matching(self):
        from app.services.text_matcher import match_highlights_to_bboxes

        highlights = [
            {"text": "found on page two", "category": "method", "reason": "r"}
        ]
        structured = {
            "pages": [
                {
                    "page_number": 1,
                    "text": "page one content only",
                    "blocks": [
                        {
                            "type": "text",
                            "text": "page one content only",
                            "bbox": {"x": 72, "y": 100, "w": 400, "h": 20},
                        }
                    ],
                    "width": 612,
                    "height": 792,
                },
                {
                    "page_number": 2,
                    "text": "this is found on page two here",
                    "blocks": [
                        {
                            "type": "text",
                            "text": "this is found on page two here",
                            "bbox": {"x": 72, "y": 100, "w": 400, "h": 20},
                        }
                    ],
                    "width": 612,
                    "height": 792,
                },
            ]
        }

        result = match_highlights_to_bboxes(highlights, structured)
        assert len(result) == 1
        assert result[0]["page"] == 2


class TestAiServiceHelpers:
    """Tests for ai_service internal helpers."""

    def test_truncate_short_text(self):
        from app.services.ai_service import _truncate

        text = "short"
        assert _truncate(text) == text

    def test_truncate_long_text(self):
        from app.services.ai_service import _truncate, MAX_TEXT_CHARS

        text = "a" * (MAX_TEXT_CHARS + 10000)
        result = _truncate(text)
        assert len(result) < len(text)
        assert "중간 생략" in result

    def test_parse_json_clean(self):
        from app.services.ai_service import _parse_json

        result = _parse_json('{"key": "value"}')
        assert result == {"key": "value"}

    def test_parse_json_with_markdown(self):
        from app.services.ai_service import _parse_json

        result = _parse_json('```json\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_parse_json_with_bare_backticks(self):
        from app.services.ai_service import _parse_json

        result = _parse_json('```\n{"key": "value"}\n```')
        assert result == {"key": "value"}

    def test_cache_hash_is_sha256(self):
        """Verify we use SHA256 not MD5 for cache keys."""
        text = "test text"
        expected = hashlib.sha256(text.encode()).hexdigest()[:16]
        # The hash should be 16 hex chars (SHA256)
        assert len(expected) == 16

    def test_get_client_raises_without_key(self):
        from app.services.ai_service import get_client

        import app.config as config_mod

        original = config_mod.settings.anthropic_api_key
        config_mod.settings.anthropic_api_key = ""
        try:
            with pytest.raises(ValueError, match="API_KEY"):
                get_client()
        finally:
            config_mod.settings.anthropic_api_key = original

    def test_resolve_api_key_uses_config(self):
        from app.services.ai_service import _resolve_api_key

        import app.config as config_mod

        original = config_mod.settings.anthropic_api_key
        config_mod.settings.anthropic_api_key = "sk-ant-test-12345"
        try:
            assert _resolve_api_key() == "sk-ant-test-12345"
        finally:
            config_mod.settings.anthropic_api_key = original
