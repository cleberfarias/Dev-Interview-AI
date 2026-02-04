export type QuestionTopic = 'system_design' | 'algorithms' | 'scalability' | 'default';

export const QUESTION_VISUALS: Record<QuestionTopic, string> = {
  system_design: '/assets/visuals/system_design_01.png',
  algorithms: '/assets/visuals/algorithms_01.png',
  scalability: '/assets/visuals/scalability_01.png',
  default: '/assets/visuals/default_01.png',
};

export const getQuestionVisual = (topic?: string): string => {
  if (!topic) return QUESTION_VISUALS.default;
  const key = topic as QuestionTopic;
  return QUESTION_VISUALS[key] ?? QUESTION_VISUALS.default;
};
