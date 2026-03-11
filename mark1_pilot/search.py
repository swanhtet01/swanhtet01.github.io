from __future__ import annotations

import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from xml.etree import ElementTree
from zipfile import ZipFile


INDEXABLE_TEXT_EXTENSIONS = {
    ".csv",
    ".docx",
    ".json",
    ".md",
    ".pdf",
    ".py",
    ".txt",
    ".xlsx",
}

SQLITE_PRAGMAS = (
    "PRAGMA journal_mode=WAL;",
    "PRAGMA synchronous=NORMAL;",
)


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, UTC).isoformat()


def _read_text_file(path: Path, char_limit: int) -> str:
    return path.read_text(encoding="utf-8", errors="ignore")[:char_limit]


def _read_docx_text(path: Path, char_limit: int) -> str:
    with ZipFile(path) as archive:
        xml_bytes = archive.read("word/document.xml")
    root = ElementTree.fromstring(xml_bytes)
    texts = [node.text for node in root.iter() if node.text]
    return " ".join(texts)[:char_limit]


def _read_xlsx_text(path: Path, char_limit: int) -> str:
    parts: list[str] = []
    total = 0

    def _append(text: str) -> bool:
        nonlocal total
        if not text:
            return False
        parts.append(text)
        total += len(text)
        return total >= char_limit

    with ZipFile(path) as archive:
        try:
            workbook_xml = archive.read("xl/workbook.xml")
            workbook_root = ElementTree.fromstring(workbook_xml)
            for node in workbook_root.iter():
                if node.tag.endswith("sheet"):
                    name = node.attrib.get("name", "").strip()
                    if name and _append(f"[Sheet] {name}"):
                        return "\n".join(parts)[:char_limit]
        except KeyError:
            pass

    return "\n".join(parts)[:char_limit]


def _read_pdf_text(path: Path, char_limit: int) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        return ""

    reader = PdfReader(str(path))
    parts: list[str] = []
    total = 0
    for page in reader.pages[:5]:
        text = page.extract_text() or ""
        if not text:
            continue
        parts.append(text)
        total += len(text)
        if total >= char_limit:
            break
    return "\n".join(parts)[:char_limit]


def extract_search_text(path: Path, char_limit: int = 20000) -> str:
    ext = path.suffix.lower()
    if ext in {".txt", ".md", ".csv", ".json", ".py"}:
        return _read_text_file(path, char_limit)
    if ext == ".docx":
        return _read_docx_text(path, char_limit)
    if ext == ".xlsx":
        return _read_xlsx_text(path, char_limit)
    if ext == ".pdf":
        return _read_pdf_text(path, char_limit)
    return ""


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=30)
    for pragma in SQLITE_PRAGMAS:
        conn.execute(pragma)
    return conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS documents;
        DROP TABLE IF EXISTS documents_fts;

        CREATE TABLE documents (
            path TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            extension TEXT NOT NULL,
            top_level TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            modified_at TEXT NOT NULL,
            indexed_at TEXT NOT NULL,
            content TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE documents_fts USING fts5(
            path,
            name,
            extension,
            top_level,
            content
        );
        """
    )


def build_search_index(
    root: Path,
    db_path: Path,
    *,
    char_limit: int = 20000,
    top_levels: set[str] | None = None,
) -> dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"Local source root does not exist: {root}")

    for candidate in (
        db_path,
        Path(f"{db_path}-wal"),
        Path(f"{db_path}-shm"),
    ):
        if candidate.exists():
            candidate.unlink()

    conn = _connect(db_path)
    indexed = 0
    content_indexed = 0
    errors: list[dict[str, str]] = []
    try:
        _init_schema(conn)
        indexed_at = datetime.now(UTC).isoformat()

        for path in root.rglob("*"):
            if not path.is_file():
                continue

            rel = path.relative_to(root)
            rel_str = str(rel).replace("\\", "/")
            ext = path.suffix.lower()
            top_level = rel.parts[0] if rel.parts else "."
            if top_levels and top_level not in top_levels:
                continue
            stat = path.stat()
            content = ""

            if ext in INDEXABLE_TEXT_EXTENSIONS:
                try:
                    content = extract_search_text(path, char_limit=char_limit)
                except Exception as exc:
                    errors.append({"path": rel_str, "error": str(exc)})
                    content = ""

            if content.strip():
                content_indexed += 1

            conn.execute(
                """
                INSERT INTO documents (
                    path,
                    name,
                    extension,
                    top_level,
                    size_bytes,
                    modified_at,
                    indexed_at,
                    content
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rel_str,
                    path.name,
                    ext or "[no_extension]",
                    top_level,
                    stat.st_size,
                    _iso(stat.st_mtime),
                    indexed_at,
                    content,
                ),
            )
            conn.execute(
                """
                INSERT INTO documents_fts (path, name, extension, top_level, content)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    rel_str,
                    path.name,
                    ext or "[no_extension]",
                    top_level,
                    content,
                ),
            )
            indexed += 1

        conn.commit()
    finally:
        conn.close()

    return {
        "status": "ready",
        "root": str(root),
        "db_path": str(db_path.resolve()),
        "top_levels": sorted(top_levels) if top_levels else [],
        "indexed_documents": indexed,
        "documents_with_content": content_indexed,
        "error_count": len(errors),
        "errors": errors[:25],
    }


def search_index(db_path: Path, query: str, *, top_k: int = 10) -> dict[str, Any]:
    db_path = db_path.expanduser().resolve()
    if not db_path.exists():
        return {
            "status": "missing_index",
            "message": f"Search index does not exist: {db_path}",
            "query": query,
        }

    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT
                d.path,
                d.name,
                d.extension,
                d.top_level,
                d.size_bytes,
                d.modified_at,
                snippet(documents_fts, 4, '[', ']', ' ... ', 14) AS snippet,
                bm25(documents_fts) AS score
            FROM documents_fts
            JOIN documents d ON d.path = documents_fts.path
            WHERE documents_fts MATCH ?
            ORDER BY score
            LIMIT ?
            """,
            (query, top_k),
        ).fetchall()
    finally:
        conn.close()

    results = [
        {
            "path": row[0],
            "name": row[1],
            "extension": row[2],
            "top_level": row[3],
            "size_bytes": row[4],
            "modified_at": row[5],
            "snippet": row[6],
            "score": row[7],
        }
        for row in rows
    ]
    return {
        "status": "ready",
        "query": query,
        "db_path": str(db_path),
        "results": results,
    }
