"""Unit tests for PDF parser — title extraction, author extraction, structured content."""

from pathlib import Path

import fitz
import pytest

from app.services.pdf_parser import extract_pdf_data


def _make_pdf(tmp_path: Path, pages: list[list[tuple[tuple, str, int]]]) -> Path:
    """Helper: create a PDF with specified text placements.

    pages: list of pages, each page is list of ((x,y), text, fontsize) tuples.
    """
    pdf_path = tmp_path / "test.pdf"
    doc = fitz.open()
    for page_texts in pages:
        page = doc.new_page(width=612, height=792)
        for (x, y), text, size in page_texts:
            page.insert_text((x, y), text, fontsize=size)
    doc.save(str(pdf_path))
    doc.close()
    return pdf_path


class TestExtractPdfData:
    def test_basic_extraction(self, sample_pdf):
        result = extract_pdf_data(str(sample_pdf))
        assert result["total_pages"] == 2
        assert isinstance(result["title"], str)
        assert len(result["title"]) > 0
        assert isinstance(result["authors"], list)
        assert isinstance(result["full_text"], str)
        assert len(result["full_text"]) > 0
        assert "pages" in result["structured_content"]

    def test_structured_content_has_pages(self, sample_pdf):
        result = extract_pdf_data(str(sample_pdf))
        pages = result["structured_content"]["pages"]
        assert len(pages) == 2
        for page in pages:
            assert "page_number" in page
            assert "text" in page
            assert "blocks" in page
            assert "width" in page
            assert "height" in page

    def test_page_numbers_are_1_based(self, sample_pdf):
        result = extract_pdf_data(str(sample_pdf))
        pages = result["structured_content"]["pages"]
        assert pages[0]["page_number"] == 1
        assert pages[1]["page_number"] == 2

    def test_blocks_have_bbox(self, sample_pdf):
        result = extract_pdf_data(str(sample_pdf))
        pages = result["structured_content"]["pages"]
        for page in pages:
            for block in page["blocks"]:
                assert block["type"] in ("text", "image")
                bbox = block["bbox"]
                assert "x" in bbox
                assert "y" in bbox
                assert "w" in bbox
                assert "h" in bbox


class TestTitleExtraction:
    def test_title_from_largest_font(self, tmp_path):
        pdf = _make_pdf(
            tmp_path,
            [
                [
                    ((72, 100), "My Paper Title", 24),
                    ((72, 150), "Author Name", 12),
                    ((72, 200), "Body text here", 10),
                ]
            ],
        )
        result = extract_pdf_data(str(pdf))
        assert "My Paper Title" in result["title"]

    def test_title_from_metadata(self, tmp_path):
        pdf_path = tmp_path / "meta.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.set_metadata({"title": "Metadata Title"})
        doc.save(str(pdf_path))
        doc.close()

        result = extract_pdf_data(str(pdf_path))
        assert result["title"] == "Metadata Title"

    def test_title_fallback_to_filename(self, tmp_path):
        pdf_path = tmp_path / "my_paper_name.pdf"
        doc = fitz.open()
        doc.new_page()  # blank page
        doc.save(str(pdf_path))
        doc.close()

        result = extract_pdf_data(str(pdf_path))
        assert result["title"] == "my_paper_name"


class TestAuthorExtraction:
    def test_authors_from_metadata(self, tmp_path):
        pdf_path = tmp_path / "authors.pdf"
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((72, 100), "Title", fontsize=20)
        doc.set_metadata({"author": "Alice Smith, Bob Jones"})
        doc.save(str(pdf_path))
        doc.close()

        result = extract_pdf_data(str(pdf_path))
        assert len(result["authors"]) >= 2
        assert any("Alice" in a for a in result["authors"])

    def test_authors_from_metadata_semicolon(self, tmp_path):
        pdf_path = tmp_path / "authors2.pdf"
        doc = fitz.open()
        doc.new_page()
        doc.set_metadata({"author": "Alice Smith; Bob Jones; Charlie Brown"})
        doc.save(str(pdf_path))
        doc.close()

        result = extract_pdf_data(str(pdf_path))
        assert len(result["authors"]) >= 3

    def test_no_authors_returns_empty(self, tmp_path):
        pdf_path = tmp_path / "no_authors.pdf"
        doc = fitz.open()
        doc.new_page()  # blank page, no metadata
        doc.save(str(pdf_path))
        doc.close()

        result = extract_pdf_data(str(pdf_path))
        assert isinstance(result["authors"], list)


class TestFullTextExtraction:
    def test_full_text_contains_all_pages(self, tmp_path):
        pdf = _make_pdf(
            tmp_path,
            [
                [((72, 100), "Page one content", 12)],
                [((72, 100), "Page two content", 12)],
                [((72, 100), "Page three content", 12)],
            ],
        )
        result = extract_pdf_data(str(pdf))
        assert "Page one content" in result["full_text"]
        assert "Page two content" in result["full_text"]
        assert "Page three content" in result["full_text"]
        assert result["total_pages"] == 3
