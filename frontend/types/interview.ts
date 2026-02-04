export type DifficultyLevel = 1 | 2 | 3;

export type QuestionType = 'multiple_choice' | 'multiple_choice_with_justification' | 'open';

export interface InterviewOption {
  id: string;
  label: string;
  text: string;
}

export interface InterviewQuestion {
  id: string;
  title: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  topic?: string;
  options?: InterviewOption[];
  bullets?: string[];
}

export interface InterviewAnswerDraft {
  questionId: string;
  selectedOptionId?: string;
  justification?: string;
}
