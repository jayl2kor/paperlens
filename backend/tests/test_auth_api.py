"""Tests for /api/auth endpoints — register, login, me, and paper isolation."""

import pytest


class TestRegister:
    def test_register_success(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "secret123", "name": "New User"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "new@example.com"
        assert data["user"]["name"] == "New User"

    def test_register_duplicate_email(self, client):
        # test@example.com already exists from conftest
        resp = client.post(
            "/api/auth/register",
            json={"email": "test@example.com", "password": "secret123", "name": "Dup"},
        )
        assert resp.status_code == 409

    def test_register_short_password(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"email": "short@example.com", "password": "12345", "name": "Short"},
        )
        assert resp.status_code == 422

    def test_register_invalid_email(self, client):
        resp = client.post(
            "/api/auth/register",
            json={"email": "not-an-email", "password": "secret123", "name": "Bad"},
        )
        assert resp.status_code == 422


class TestLogin:
    def test_login_success(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "testpass123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == "test@example.com"

    def test_login_wrong_password(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "wrongpass"},
        )
        assert resp.status_code == 401

    def test_login_nonexistent_user(self, client):
        resp = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "secret123"},
        )
        assert resp.status_code == 401


class TestMe:
    def test_me_authenticated(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "test@example.com"

    def test_me_no_token(self, client):
        # Remove auth header
        del client.headers["Authorization"]
        resp = client.get("/api/auth/me")
        assert resp.status_code in (401, 403)

    def test_me_invalid_token(self, client):
        client.headers["Authorization"] = "Bearer invalid-token"
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401


class TestPaperIsolation:
    """Verify that users can only see their own papers."""

    def test_cannot_see_other_users_paper(self, client, uploaded_paper):
        # Register a second user
        resp = client.post(
            "/api/auth/register",
            json={"email": "other@example.com", "password": "secret123", "name": "Other"},
        )
        other_token = resp.json()["token"]

        # Try to access the first user's paper with second user's token
        client.headers["Authorization"] = f"Bearer {other_token}"
        resp = client.get(f"/api/papers/{uploaded_paper['id']}")
        assert resp.status_code == 404

    def test_other_user_list_is_empty(self, client, uploaded_paper):
        # Register a second user
        resp = client.post(
            "/api/auth/register",
            json={"email": "other2@example.com", "password": "secret123", "name": "Other2"},
        )
        other_token = resp.json()["token"]

        # Second user should see no papers
        client.headers["Authorization"] = f"Bearer {other_token}"
        resp = client.get("/api/papers")
        assert resp.json() == []

    def test_unauthenticated_cannot_list_papers(self, client):
        del client.headers["Authorization"]
        resp = client.get("/api/papers")
        assert resp.status_code in (401, 403)

    def test_unauthenticated_cannot_upload(self, client, sample_pdf):
        del client.headers["Authorization"]
        with open(sample_pdf, "rb") as f:
            resp = client.post(
                "/api/papers/upload",
                files={"file": ("paper.pdf", f, "application/pdf")},
            )
        assert resp.status_code in (401, 403)
