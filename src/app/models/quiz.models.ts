export type QuizDifficulty = 'easy' | 'medium' | 'hard';
export type QuizQuestionType = 'multiple' | 'boolean';

export interface QuizSettings {
  amount: number;
  category?: number;
  difficulty?: QuizDifficulty;
  type?: QuizQuestionType;
}

export interface OpenTriviaQuestion {
  category: string;
  type: QuizQuestionType;
  difficulty: string;
  question: string;
  correct_answer: string;
  incorrect_answers: string[];
}

export interface OpenTriviaResponse {
  response_code: number;
  results: OpenTriviaQuestion[];
}

export enum OpenTdbResponseCode {
  Success = 0,
  NoResults = 1,
  InvalidParameter = 2,
  TokenNotFound = 3,
  TokenEmpty = 4,
  RateLimit = 5,
}

export interface QuizAnswer {
  id: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: string;
  category: string;
  difficulty: string;
  type: QuizQuestionType;
  question: string;
  answers: QuizAnswer[];
  correctAnswerId: string;
}

export type AnswerEvaluationState = 'unanswered' | 'correct' | 'incorrect';

export interface QuizState {
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  selectedAnswerId?: string;
  answerState: AnswerEvaluationState;
  score: number;
  answeredQuestions: number;
  startedAt?: number;
  completedAt?: number;
  lastSettings?: QuizSettings;
}

export type QuizErrorCode =
  | 'NO_RESULTS'
  | 'INVALID_PARAMS'
  | 'TOKEN_NOT_FOUND'
  | 'TOKEN_EMPTY'
  | 'RATE_LIMIT'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE';

export class QuizDomainError extends Error {
  constructor(
    public readonly code: QuizErrorCode,
    message: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'QuizDomainError';
  }
}

export interface OpenTdbCategoryOption {
  id: number;
  name: string;
}
