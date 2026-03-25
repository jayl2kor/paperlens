"""Tests for /api/settings endpoints — validation, api_key_configured flag."""

import pytest


class TestGetSettings:
    def test_get_defaults(self, client):
        resp = client.get("/api/settings")
        assert resp.status_code == 200
        data = resp.json()
        assert data["default_language"] == "ko"
        assert data["highlight_color"] == "yellow"
        assert data["claude_model"] == "claude-sonnet-4-20250514"
        assert isinstance(data["api_key_configured"], bool)

    def test_api_key_not_exposed(self, client):
        """API key value should never be in the response."""
        resp = client.get("/api/settings")
        data = resp.json()
        assert "anthropic_api_key" not in data
        # Only the boolean flag should exist
        assert "api_key_configured" in data


class TestUpdateSettings:
    def test_update_language(self, client):
        resp = client.put("/api/settings", json={"default_language": "en"})
        assert resp.status_code == 200
        assert resp.json()["default_language"] == "en"

        # Verify persistence
        resp = client.get("/api/settings")
        assert resp.json()["default_language"] == "en"

    def test_update_color(self, client):
        resp = client.put("/api/settings", json={"highlight_color": "purple"})
        assert resp.status_code == 200
        assert resp.json()["highlight_color"] == "purple"

    def test_update_model(self, client):
        resp = client.put(
            "/api/settings", json={"claude_model": "claude-opus-4-20250514"}
        )
        assert resp.status_code == 200
        assert resp.json()["claude_model"] == "claude-opus-4-20250514"

    def test_update_multiple_fields(self, client):
        resp = client.put(
            "/api/settings",
            json={"default_language": "ja", "highlight_color": "green"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["default_language"] == "ja"
        assert data["highlight_color"] == "green"

    def test_partial_update_preserves_others(self, client):
        # Set language to en
        client.put("/api/settings", json={"default_language": "en"})
        # Update only color
        resp = client.put("/api/settings", json={"highlight_color": "blue"})
        data = resp.json()
        assert data["default_language"] == "en"  # preserved
        assert data["highlight_color"] == "blue"  # updated


class TestSettingsValidation:
    """Allowlist validation for model, language, and color."""

    def test_reject_invalid_model(self, client):
        resp = client.put(
            "/api/settings", json={"claude_model": "gpt-4-turbo"}
        )
        assert resp.status_code == 422

    def test_reject_invalid_language(self, client):
        resp = client.put(
            "/api/settings", json={"default_language": "fr"}
        )
        assert resp.status_code == 422

    def test_reject_invalid_color(self, client):
        resp = client.put(
            "/api/settings", json={"highlight_color": "red"}
        )
        assert resp.status_code == 422

    @pytest.mark.parametrize(
        "model",
        [
            "claude-sonnet-4-20250514",
            "claude-haiku-4-20250414",
            "claude-opus-4-20250514",
        ],
    )
    def test_accept_all_valid_models(self, client, model):
        resp = client.put("/api/settings", json={"claude_model": model})
        assert resp.status_code == 200

    @pytest.mark.parametrize("lang", ["ko", "en", "ja", "zh"])
    def test_accept_all_valid_languages(self, client, lang):
        resp = client.put("/api/settings", json={"default_language": lang})
        assert resp.status_code == 200

    @pytest.mark.parametrize(
        "color", ["yellow", "green", "blue", "pink", "purple"]
    )
    def test_accept_all_valid_colors(self, client, color):
        resp = client.put("/api/settings", json={"highlight_color": color})
        assert resp.status_code == 200
