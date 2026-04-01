from app.semantic_index import rank_documents


def test_rank_documents_uses_local_semantic_fallback(monkeypatch):
    monkeypatch.setenv("AI_EMBEDDINGS_ENABLED", "false")

    result = rank_documents(
        user_id="u1",
        query_text="frontend react typescript arquitetura de componentes",
        query_terms=["frontend", "react", "typescript", "arquitetura"],
        documents=[
            {
                "id": "resume-summary",
                "sourceType": "resume",
                "title": "Resumo do curriculo",
                "text": "Engenheiro frontend focado em React, TypeScript e arquitetura de componentes.",
                "snippet": "React e TypeScript.",
                "tags": ["react", "typescript", "frontend"],
                "baseScore": 0.61,
            },
            {
                "id": "job-description",
                "sourceType": "job",
                "title": "Descricao da vaga",
                "text": "Vaga backend com Python, FastAPI e mensageria.",
                "snippet": "Python e FastAPI.",
                "tags": ["python", "fastapi", "backend"],
                "baseScore": 0.64,
            },
        ],
        limit=2,
    )

    assert result["retrievalMode"] == "semantic"
    assert result["indexStats"]["embeddingStrategy"] == "local-hash-v1"
    assert result["items"][0]["id"] == "resume-summary"
    assert result["items"][0]["semanticScore"] >= result["items"][1]["semanticScore"]
