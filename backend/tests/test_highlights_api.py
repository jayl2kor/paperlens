"""Tests for /api/papers/{paper_id}/highlights endpoints."""

import pytest


class TestCreateHighlight:
    def test_create_highlight(self, client, uploaded_paper):
        resp = client.post(
            f"/api/papers/{uploaded_paper['id']}/highlights",
            json={"text": "important text", "page": 1, "color": "yellow"},
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["text"] == "important text"
        assert data["page"] == 1
        assert data["color"] == "yellow"
        assert data["note"] is None
        assert data["paper_id"] == uploaded_paper["id"]

    def test_create_highlight_with_note(self, client, uploaded_paper):
        resp = client.post(
            f"/api/papers/{uploaded_paper['id']}/highlights",
            json={"text": "key result", "page": 2, "note": "Very interesting"},
        )
        assert resp.status_code == 201
        assert resp.json()["note"] == "Very interesting"

    def test_create_highlight_default_color(self, client, uploaded_paper):
        resp = client.post(
            f"/api/papers/{uploaded_paper['id']}/highlights",
            json={"text": "default color", "page": 1},
        )
        assert resp.status_code == 201
        assert resp.json()["color"] == "yellow"

    def test_create_highlight_all_colors(self, client, uploaded_paper):
        for color in ["yellow", "green", "blue", "pink", "purple"]:
            resp = client.post(
                f"/api/papers/{uploaded_paper['id']}/highlights",
                json={"text": f"text_{color}", "page": 1, "color": color},
            )
            assert resp.status_code == 201
            assert resp.json()["color"] == color

    def test_create_highlight_invalid_color(self, client, uploaded_paper):
        resp = client.post(
            f"/api/papers/{uploaded_paper['id']}/highlights",
            json={"text": "text", "page": 1, "color": "red"},
        )
        assert resp.status_code == 422

    def test_create_highlight_nonexistent_paper(self, client):
        resp = client.post(
            "/api/papers/99999/highlights",
            json={"text": "text", "page": 1},
        )
        assert resp.status_code == 404


class TestListHighlights:
    def test_list_empty(self, client, uploaded_paper):
        resp = client.get(f"/api/papers/{uploaded_paper['id']}/highlights")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_returns_created(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "first", "page": 1},
        )
        client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "second", "page": 2},
        )
        resp = client.get(f"/api/papers/{paper_id}/highlights")
        assert len(resp.json()) == 2

    def test_list_nonexistent_paper(self, client):
        resp = client.get("/api/papers/99999/highlights")
        assert resp.status_code == 404


class TestUpdateHighlight:
    def test_update_color(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        create_resp = client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "text", "page": 1, "color": "yellow"},
        )
        h_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/papers/{paper_id}/highlights/{h_id}",
            json={"color": "blue"},
        )
        assert resp.status_code == 200
        assert resp.json()["color"] == "blue"

    def test_update_note(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        create_resp = client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "text", "page": 1},
        )
        h_id = create_resp.json()["id"]

        resp = client.patch(
            f"/api/papers/{paper_id}/highlights/{h_id}",
            json={"note": "added note"},
        )
        assert resp.status_code == 200
        assert resp.json()["note"] == "added note"

    def test_update_nonexistent_highlight(self, client, uploaded_paper):
        resp = client.patch(
            f"/api/papers/{uploaded_paper['id']}/highlights/99999",
            json={"color": "blue"},
        )
        assert resp.status_code == 404


class TestDeleteHighlight:
    def test_delete_highlight(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        create_resp = client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "to delete", "page": 1},
        )
        h_id = create_resp.json()["id"]

        resp = client.delete(f"/api/papers/{paper_id}/highlights/{h_id}")
        assert resp.status_code == 200

        # Verify it's gone
        highlights = client.get(f"/api/papers/{paper_id}/highlights").json()
        assert all(h["id"] != h_id for h in highlights)

    def test_delete_nonexistent_highlight(self, client, uploaded_paper):
        resp = client.delete(
            f"/api/papers/{uploaded_paper['id']}/highlights/99999"
        )
        assert resp.status_code == 404
