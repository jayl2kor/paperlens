"""Security tests — SSRF prevention, input validation, security headers, error sanitization."""

import pytest


class TestSecurityHeaders:
    def test_health_has_security_headers(self, client):
        resp = client.get("/api/health")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"
        assert resp.headers["X-Frame-Options"] == "DENY"
        assert resp.headers["X-XSS-Protection"] == "0"
        assert resp.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"

    def test_api_response_has_security_headers(self, client):
        resp = client.get("/api/papers")
        assert resp.headers["X-Content-Type-Options"] == "nosniff"


class TestSSRFPrevention:
    """SSRF prevention on /api/agent/verify endpoint."""

    def test_reject_aws_metadata_url(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={
                "scenario": "test",
                "base_url": "http://169.254.169.254/latest/meta-data/",
            },
        )
        assert resp.status_code == 422

    def test_reject_internal_ip(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "http://10.0.0.1:3000"},
        )
        assert resp.status_code == 422

    def test_reject_arbitrary_host(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "http://evil.com:3000"},
        )
        assert resp.status_code == 422

    def test_reject_wrong_port(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "http://localhost:8080"},
        )
        assert resp.status_code == 422

    def test_reject_ftp_scheme(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "ftp://localhost:3000"},
        )
        assert resp.status_code == 422

    def test_accept_localhost_3000(self, client):
        # This should pass URL validation (will fail on actual agent execution)
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "http://localhost:3000"},
        )
        # 500 is expected since browser agent isn't available in tests
        # but NOT 422 — the URL itself is valid
        assert resp.status_code != 422

    def test_accept_127_0_0_1(self, client):
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": "test", "base_url": "http://127.0.0.1:3000"},
        )
        assert resp.status_code != 422


class TestInputValidation:
    """Input length limits on AI/agent endpoints."""

    def test_chat_question_max_length(self, client, uploaded_paper):
        long_question = "a" * 5001
        resp = client.post(
            f"/api/ai/chat/{uploaded_paper['id']}",
            json={"question": long_question},
        )
        assert resp.status_code == 422

    def test_explain_selected_text_max_length(self, client, uploaded_paper):
        long_text = "a" * 10001
        resp = client.post(
            f"/api/ai/explain/{uploaded_paper['id']}",
            json={"selected_text": long_text},
        )
        assert resp.status_code == 422

    def test_translate_text_max_length(self, client, uploaded_paper):
        long_text = "a" * 100001
        resp = client.post(
            f"/api/ai/translate/{uploaded_paper['id']}",
            json={"text": long_text},
        )
        assert resp.status_code == 422

    def test_agent_search_query_max_length(self, client):
        long_query = "a" * 501
        resp = client.post(
            "/api/agent/search",
            json={"query": long_query},
        )
        assert resp.status_code == 422

    def test_agent_verify_scenario_max_length(self, client):
        long_scenario = "a" * 2001
        resp = client.post(
            "/api/agent/verify",
            json={"scenario": long_scenario},
        )
        assert resp.status_code == 422

    def test_agent_search_max_papers_limit(self, client):
        resp = client.post(
            "/api/agent/search",
            json={"query": "test", "max_papers": 10},
        )
        assert resp.status_code == 422

    def test_valid_inputs_pass(self, client, uploaded_paper):
        """Within-limit inputs should not be rejected by validation."""
        resp = client.post(
            f"/api/ai/chat/{uploaded_paper['id']}",
            json={"question": "What is this paper about?"},
        )
        # Should not be 422 (may be 500 if AI service not available)
        assert resp.status_code != 422


class TestErrorSanitization:
    """Error responses should not leak internal details."""

    def test_pdf_parse_error_sanitized(self, client):
        """Upload a corrupt file that will fail parsing."""
        import io

        # A file with .pdf extension but invalid content
        fake_pdf = io.BytesIO(b"%PDF-1.4 corrupted content")
        resp = client.post(
            "/api/papers/upload",
            files={"file": ("bad.pdf", fake_pdf, "application/pdf")},
        )
        if resp.status_code == 422:
            detail = resp.json()["detail"]
            # Should NOT contain Python traceback or internal paths
            assert "Traceback" not in detail
            assert "/Users/" not in detail
            assert "app/" not in detail
