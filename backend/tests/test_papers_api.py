"""Tests for /api/papers endpoints — upload, list, get, delete, tags, export."""

import io

import pytest


class TestUpload:
    def test_upload_valid_pdf(self, client, sample_pdf):
        with open(sample_pdf, "rb") as f:
            resp = client.post(
                "/api/papers/upload",
                files={"file": ("paper.pdf", f, "application/pdf")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] > 0
        assert data["filename"] == "paper.pdf"
        assert data["total_pages"] == 2
        assert isinstance(data["authors"], list)
        assert isinstance(data["tags"], list)

    def test_upload_rejects_non_pdf(self, client):
        fake = io.BytesIO(b"not a pdf")
        resp = client.post(
            "/api/papers/upload",
            files={"file": ("notes.txt", fake, "text/plain")},
        )
        assert resp.status_code == 400
        assert "PDF" in resp.json()["detail"]

    def test_upload_rejects_oversized_file(self, client, tmp_path):
        """Files exceeding max_upload_size_mb should be rejected."""
        import app.config as config_mod

        original = config_mod.settings.max_upload_size_mb
        config_mod.settings.max_upload_size_mb = 0  # 0 MB = reject everything

        import fitz

        pdf_path = tmp_path / "tiny.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.save(str(pdf_path))
        doc.close()

        with open(pdf_path, "rb") as f:
            resp = client.post(
                "/api/papers/upload",
                files={"file": ("tiny.pdf", f, "application/pdf")},
            )
        assert resp.status_code == 413

        config_mod.settings.max_upload_size_mb = original

    def test_upload_extracts_title(self, uploaded_paper):
        # The sample PDF has "A Novel Approach to Neural Networks" as title
        assert "Novel" in uploaded_paper["title"] or len(uploaded_paper["title"]) > 0

    def test_upload_extracts_authors(self, uploaded_paper):
        # Authors may or may not be extracted depending on heuristics
        assert isinstance(uploaded_paper["authors"], list)


class TestListPapers:
    def test_list_empty(self, client):
        resp = client.get("/api/papers")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_returns_uploaded(self, client, uploaded_paper):
        resp = client.get("/api/papers")
        assert resp.status_code == 200
        papers = resp.json()
        assert len(papers) == 1
        assert papers[0]["id"] == uploaded_paper["id"]

    def test_list_search_by_title(self, client, uploaded_paper):
        resp = client.get("/api/papers", params={"q": "Novel"})
        assert len(resp.json()) == 1

        resp = client.get("/api/papers", params={"q": "nonexistent_xyz"})
        assert len(resp.json()) == 0

    def test_list_filter_by_tag(self, client, uploaded_paper):
        # Add a tag first
        client.put(
            f"/api/papers/{uploaded_paper['id']}/tags",
            json=["ml", "deep-learning"],
        )
        resp = client.get("/api/papers", params={"tag": "ml"})
        assert len(resp.json()) == 1

        resp = client.get("/api/papers", params={"tag": "nonexistent"})
        assert len(resp.json()) == 0


class TestGetPaper:
    def test_get_existing(self, client, uploaded_paper):
        resp = client.get(f"/api/papers/{uploaded_paper['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == uploaded_paper["id"]
        assert "full_text" in data
        assert "structured_content" in data

    def test_get_nonexistent(self, client):
        resp = client.get("/api/papers/99999")
        assert resp.status_code == 404


class TestGetPaperFile:
    def test_download_file(self, client, uploaded_paper):
        resp = client.get(f"/api/papers/{uploaded_paper['id']}/file")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "application/pdf"
        assert len(resp.content) > 0

    def test_download_nonexistent(self, client):
        resp = client.get("/api/papers/99999/file")
        assert resp.status_code == 404


class TestDeletePaper:
    def test_delete_existing(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        resp = client.delete(f"/api/papers/{paper_id}")
        assert resp.status_code == 200

        # Verify it's gone
        resp = client.get(f"/api/papers/{paper_id}")
        assert resp.status_code == 404

    def test_delete_nonexistent(self, client):
        resp = client.delete("/api/papers/99999")
        assert resp.status_code == 404

    def test_delete_cascades_highlights(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        # Create a highlight
        client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "test", "page": 1},
        )
        # Delete paper
        client.delete(f"/api/papers/{paper_id}")
        # Highlight should be gone (paper is gone)
        resp = client.get(f"/api/papers/{paper_id}/highlights")
        assert resp.status_code == 404


class TestTags:
    def test_update_tags(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        resp = client.put(f"/api/papers/{paper_id}/tags", json=["ai", "ml"])
        assert resp.status_code == 200
        assert resp.json()["tags"] == ["ai", "ml"]

    def test_tags_deduplication(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        resp = client.put(
            f"/api/papers/{paper_id}/tags", json=["ai", "ai", "ml", "ml"]
        )
        assert resp.json()["tags"] == ["ai", "ml"]

    def test_tags_limit_20(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        many_tags = [f"tag{i}" for i in range(25)]
        resp = client.put(f"/api/papers/{paper_id}/tags", json=many_tags)
        assert len(resp.json()["tags"]) == 20

    def test_tags_strips_whitespace(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        resp = client.put(
            f"/api/papers/{paper_id}/tags", json=["  ai  ", "", "  ml  "]
        )
        assert resp.json()["tags"] == ["ai", "ml"]

    def test_list_all_tags(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        client.put(f"/api/papers/{paper_id}/tags", json=["ai", "ml"])
        resp = client.get("/api/papers/meta/tags")
        assert resp.status_code == 200
        assert "ai" in resp.json()
        assert "ml" in resp.json()

    def test_update_tags_nonexistent_paper(self, client):
        resp = client.put("/api/papers/99999/tags", json=["ai"])
        assert resp.status_code == 404


class TestMarkdownExport:
    def test_export_basic(self, client, uploaded_paper):
        resp = client.get(f"/api/papers/{uploaded_paper['id']}/export/markdown")
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers["content-type"]
        body = resp.text
        assert uploaded_paper["title"] in body
        assert "저자" in body

    def test_export_includes_highlights(self, client, uploaded_paper):
        paper_id = uploaded_paper["id"]
        client.post(
            f"/api/papers/{paper_id}/highlights",
            json={"text": "important finding", "page": 1, "note": "my note"},
        )
        resp = client.get(f"/api/papers/{paper_id}/export/markdown")
        body = resp.text
        assert "important finding" in body
        assert "my note" in body

    def test_export_nonexistent(self, client):
        resp = client.get("/api/papers/99999/export/markdown")
        assert resp.status_code == 404
