from __future__ import annotations

import ast
from pathlib import Path


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _agents_dir() -> Path:
    return _repo_root() / "backend" / "app" / "agents"


def _routes_interview_file() -> Path:
    return _repo_root() / "backend" / "app" / "api" / "routes_interview.py"


def _interview_core_file() -> Path:
    return _repo_root() / "backend" / "app" / "services" / "interview_core.py"


def _imported_modules(py_file: Path) -> set[str]:
    tree = ast.parse(py_file.read_text(encoding="utf-8"))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name:
                    modules.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                imported = f"{module}.{alias.name}".strip(".")
                modules.add(imported)
    return modules


def test_agents_do_not_import_interview_core_or_repositories():
    forbidden_snippets = (
        "interview_core",
        "repositories",
        "firebase_admin",
        "get_firestore_client",
    )
    offenders: list[str] = []

    for file_path in sorted(_agents_dir().glob("*.py")):
        if file_path.name == "__init__.py":
            continue
        modules = _imported_modules(file_path)
        for module in modules:
            lowered = module.lower()
            if any(snippet in lowered for snippet in forbidden_snippets):
                offenders.append(f"{file_path.name}:{module}")

    assert not offenders, f"Agents com dependencias proibidas: {offenders}"


def test_routes_interview_has_no_http_endpoints():
    text = _routes_interview_file().read_text(encoding="utf-8")
    disallowed = ("@router.get(", "@router.post(", "@router.put(", "@router.delete(", "@router.patch(")
    found = [token for token in disallowed if token in text]
    assert not found, f"routes_interview.py nao deve expor endpoints HTTP: {found}"


def test_interview_core_has_no_http_route_decorators():
    text = _interview_core_file().read_text(encoding="utf-8")
    disallowed = ("@router.get(", "@router.post(", "@router.put(", "@router.delete(", "@router.patch(")
    found = [token for token in disallowed if token in text]
    assert not found, f"interview_core.py nao deve expor endpoints HTTP: {found}"
