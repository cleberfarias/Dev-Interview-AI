from app.agents import behavior_agent, culture_fit_agent
from app.schemas import SpeechMetrics
from app.services import communication_analysis_service, partial_feedback_service


def test_communication_analysis_derives_signals_from_metrics():
    metrics = SpeechMetrics(
        answerId="answer-1",
        timeToFirstSpeechMs=800,
        totalDurationMs=18000,
        silenceDurationMs=2200,
        pauseCount=3,
        longPauseCount=1,
        fillerCount=1,
        hesitationMarkers=["ahn"],
        wordsPerMinute=128,
        interruptionRecoveryCount=1,
        fluencyScore=7.6,
        fluencyLevel="high",
    )

    communication = communication_analysis_service.derive_communication_signals(
        transcript="Eu estruturaria a resposta em contexto, decisao tecnica e impacto medido.",
        speech_metrics=metrics,
    )
    behavioral = communication_analysis_service.derive_behavioral_speech_signals(
        transcript="Eu estruturaria a resposta em contexto, decisao tecnica e impacto medido.",
        speech_metrics=metrics,
        communication_signals=communication,
    )

    assert communication.responseClarity > 6.5
    assert communication.responseConfidence > 6.0
    assert 0 <= communication.hesitationLevel <= 1
    assert behavioral.consistency > 6.0
    assert behavioral.emotionalControl > 5.5


def test_partial_feedback_prefers_single_low_intrusion_message():
    metrics = SpeechMetrics(
        answerId="answer-2",
        timeToFirstSpeechMs=2100,
        totalDurationMs=9000,
        silenceDurationMs=3800,
        pauseCount=4,
        longPauseCount=2,
        fillerCount=5,
        hesitationMarkers=["ahn", "tipo", "acho que"],
        wordsPerMinute=82,
        interruptionRecoveryCount=0,
        fluencyScore=4.3,
        fluencyLevel="moderate",
    )

    feedback = partial_feedback_service.build_partial_feedback(
        transcript="Ahn... tipo... acho que eu faria alguma coisa na API.",
        speech_metrics=metrics,
        mode="candidate_coaching_mode",
        chunk_index=2,
        already_triggered=False,
        partial_feedback_enabled=True,
    )

    assert feedback is not None
    assert feedback.type == "partial_feedback"
    assert feedback.severity == "low"
    assert "firmeza" in feedback.message.lower() or "exemplo" in feedback.message.lower()


def test_behavior_and_culture_agents_build_dedicated_profiles():
    metrics = SpeechMetrics(
        answerId="answer-3",
        timeToFirstSpeechMs=700,
        totalDurationMs=12000,
        silenceDurationMs=1500,
        pauseCount=2,
        longPauseCount=0,
        fillerCount=1,
        hesitationMarkers=["ahn"],
        wordsPerMinute=132,
        interruptionRecoveryCount=1,
        fluencyScore=7.9,
        fluencyLevel="high",
    )
    transcript = (
        "Eu alinhei com a equipe, assumi o incidente em producao e adaptei o rollout com base no feedback "
        "dos stakeholders para reduzir o risco."
    )
    communication = communication_analysis_service.derive_communication_signals(
        transcript=transcript,
        speech_metrics=metrics,
    )
    behavioral = communication_analysis_service.derive_behavioral_speech_signals(
        transcript=transcript,
        speech_metrics=metrics,
        communication_signals=communication,
    )

    behavior = behavior_agent.run(
        transcript=transcript,
        communication_signals=communication,
        behavioral_speech_signals=behavioral,
        evaluation={"criteriaScores": {"technicalPrecision": 8}},
    )
    culture = culture_fit_agent.run(
        transcript=transcript,
        communication_signals=communication,
        behavioral_speech_signals=behavioral,
        behavior_profile=behavior,
        evaluation={"criteriaScores": {"technicalPrecision": 8}},
        job_context={"softSkills": ["teamwork", "ownership", "adaptability"]},
        match_context={"matchScore": 80},
    )

    assert behavior.communicationStyle != ""
    assert behavior.discReadiness.conscientiousness > 6.0
    assert len(behavior.observedTraits) >= 1
    assert culture.collaboration > 6.0
    assert culture.ownership > 6.0
    assert culture.overallAlignment > 6.0
