from __future__ import annotations

import io
import os


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except Exception:
            continue
    return content.decode("utf-8", errors="ignore")


def _extract_from_txt(content: bytes) -> str:
    return _decode_text(content)


def _extract_from_pdf(content: bytes) -> str:
    try:
        from pypdf import PdfReader
    except Exception as exc:
        raise RuntimeError("PDF parsing requires 'pypdf' package") from exc

    reader = PdfReader(io.BytesIO(content))
    chunks = [(page.extract_text() or "").strip() for page in reader.pages]
    return "\n".join(c for c in chunks if c)


def _extract_from_docx(content: bytes) -> str:
    try:
        from docx import Document
    except Exception as exc:
        raise RuntimeError("DOCX parsing requires 'python-docx' package") from exc

    doc = Document(io.BytesIO(content))
    chunks = [p.text.strip() for p in doc.paragraphs if p.text and p.text.strip()]
    return "\n".join(chunks)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


def extract_text(file_name: str, content: bytes, mime_type: str | None = None) -> str:
    ext = os.path.splitext(file_name or "")[1].lower().strip()
    mt = (mime_type or "").lower().strip()

    if ext == ".txt" or mt.startswith("text/"):
        return normalize_text(_extract_from_txt(content))

    if ext == ".pdf" or mt == "application/pdf":
        return normalize_text(_extract_from_pdf(content))

    if ext == ".docx" or mt in {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }:
        return normalize_text(_extract_from_docx(content))

    raise ValueError("Unsupported resume format. Use TXT, PDF, or DOCX.")

