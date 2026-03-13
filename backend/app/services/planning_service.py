from __future__ import annotations

from fastapi import HTTPException

from ..ai.router import AIProviderError
from ..repositories import session_repository
from ..schemas import (
    InterviewConfig,
    InterviewPlan,
    NextQuestionRequest,
    NextQuestionResponse,
    PlanGenerateResponse,
)
from . import interview_core


def generate_plan(session_id: str, user):
    data = session_repository.get_session(session_id)
    if not data or data.get("uid") != user["uid"]:
        raise HTTPException(status_code=404, detail="Sessao nao encontrada")

    if data.get("plan"):
        plan = InterviewPlan(**data.get("plan"))
        return PlanGenerateResponse(
            sessionId=session_id,
            plan=plan,
            plan_status=data.get("plan_status", "completed"),
            provider_used=data.get("provider_used", "unknown"),
            model_used=data.get("model_used", "unknown"),
            latency_ms=int(data.get("latency_ms", 0) or 0),
            tokens_used=data.get("tokens_used"),
            credits=interview_core._get_user_credits(user["uid"]),
        )

    interview_core._ensure_credits(user["uid"], required=1)

    config = InterviewConfig(**data.get("config"))
    plan_context = interview_core._build_plan_context(user.get("uid"), config, auth_token=user.get("token"))
    prompt = interview_core._build_plan_prompt(config, plan_context)

    try:
        result = interview_core.ai_router.generate(
            task_name="plan",
            prompt=prompt,
            max_tokens=800,
            temperature=0.2,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        interview_core._handle_ai_error(e)

    try:
        payload = interview_core._safe_json_loads(result.output_text or "{}")
        plan = interview_core._parse_plan_payload(payload, config)
        if not plan:
            raise ValueError("Invalid plan payload")
    except Exception:
        interview_core.logger.warning(
            "Invalid plan payload from AI (provider=%s model=%s)",
            result.provider_used,
            result.model_used,
        )
        try:
            retry_result = interview_core.ai_router.generate(
                task_name="plan",
                prompt=interview_core._build_plan_prompt_strict(config, plan_context),
                max_tokens=900,
                temperature=0.1,
                response_mime_type="application/json",
            )
            retry_payload = interview_core._safe_json_loads(retry_result.output_text or "{}")
            plan = interview_core._parse_plan_payload(retry_payload, config)
            if not plan:
                raise ValueError("Invalid plan payload after retry")
            result = retry_result
        except AIProviderError as e:
            interview_core._handle_ai_error(e)
        except Exception:
            raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    new_credits = interview_core._debit_credits(user["uid"], amount=1)

    session_repository.upsert_session(
        session_id,
        {
            "plan": plan.model_dump(),
            "plan_status": "completed",
            "provider_used": result.provider_used,
            "model_used": result.model_used,
            "latency_ms": result.latency_ms,
            "tokens_used": result.tokens_used,
            "updatedAt": interview_core.now_iso(),
        },
        merge=True,
    )

    return PlanGenerateResponse(
        sessionId=session_id,
        plan=plan,
        plan_status="completed",
        provider_used=result.provider_used,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        tokens_used=result.tokens_used,
        credits=new_credits,
    )


def ai_plan(config, user):
    from . import session_service

    return session_service.start_session(config, user)


def next_question(payload, user):
    request = payload
    if not isinstance(payload, NextQuestionRequest):
        request = NextQuestionRequest(**payload)

    config = request.config
    history = request.history or []
    remaining_seconds = int(request.remainingSeconds or 0)
    asked_count = len(history)

    duration = interview_core._clamp_duration_minutes(config)
    min_q, max_q = interview_core._plan_question_bounds(duration)

    if remaining_seconds <= 60 or asked_count >= max_q:
        return NextQuestionResponse(shouldFinish=True, reason="time_or_max")

    context = interview_core._build_plan_context(user.get("uid"), config, auth_token=user.get("token"))
    prompt = interview_core._build_next_question_prompt(
        config=config,
        history=history,
        remaining_seconds=remaining_seconds,
        asked_count=asked_count,
        min_q=min_q,
        max_q=max_q,
        difficulty_level=request.difficultyLevel,
        context=context,
    )

    try:
        result = interview_core.ai_router.generate(
            task_name="plan",
            prompt=prompt,
            max_tokens=320,
            temperature=0.4,
            response_mime_type="application/json",
        )
    except AIProviderError as e:
        interview_core._handle_ai_error(e)

    try:
        data = interview_core._safe_json_loads(result.output_text or "{}")
        question, should_finish, reason = interview_core._parse_next_question_payload(data, asked_count)
        if should_finish and asked_count >= min_q:
            return NextQuestionResponse(
                shouldFinish=True,
                reason=reason,
                provider_used=result.provider_used,
                model_used=result.model_used,
                latency_ms=result.latency_ms,
                tokens_used=result.tokens_used,
            )
        if not question:
            raise ValueError("Invalid next question payload")
    except Exception:
        interview_core.logger.warning(
            "Invalid next-question payload (provider=%s model=%s)",
            result.provider_used,
            result.model_used,
        )
        try:
            retry_result = interview_core.ai_router.generate(
                task_name="plan",
                prompt=interview_core._build_next_question_prompt_strict(
                    config=config,
                    history=history,
                    remaining_seconds=remaining_seconds,
                    asked_count=asked_count,
                    min_q=min_q,
                    max_q=max_q,
                    difficulty_level=request.difficultyLevel,
                    context=context,
                ),
                max_tokens=360,
                temperature=0.2,
                response_mime_type="application/json",
            )
            retry_data = interview_core._safe_json_loads(retry_result.output_text or "{}")
            question, should_finish, reason = interview_core._parse_next_question_payload(
                retry_data,
                asked_count,
            )
            if should_finish and asked_count >= min_q:
                return NextQuestionResponse(
                    shouldFinish=True,
                    reason=reason,
                    provider_used=retry_result.provider_used,
                    model_used=retry_result.model_used,
                    latency_ms=retry_result.latency_ms,
                    tokens_used=retry_result.tokens_used,
                )
            if not question:
                raise ValueError("Invalid next question payload after retry")
            result = retry_result
        except AIProviderError as e:
            interview_core._handle_ai_error(e)
        except Exception:
            raise HTTPException(status_code=503, detail="AI retornou resposta invalida")

    return NextQuestionResponse(
        shouldFinish=False,
        reason=None,
        question=question,
        provider_used=result.provider_used,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        tokens_used=result.tokens_used,
    )
