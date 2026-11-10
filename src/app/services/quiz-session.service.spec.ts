import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FirestoreHistoryService } from '../core/services/firestore-history.service';
import { QuizQuestion } from '../models/quiz.models';
import { QuizSessionService } from './quiz-session.service';

describe('QuizSessionService (IFT-4, IFT-7, IFT-9)', () => {
  let service: QuizSessionService;

  const sampleQuestions: QuizQuestion[] = [
    {
      id: 'q1',
      category: 'Science',
      difficulty: 'easy',
      type: 'multiple',
      question: 'Question 1?',
      correctAnswerId: 'q1_correct',
      answers: [
        { id: 'q1_correct', text: 'Right 1', isCorrect: true },
        { id: 'q1_wrong', text: 'Wrong 1', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      category: 'History',
      difficulty: 'medium',
      type: 'boolean',
      question: 'Question 2?',
      correctAnswerId: 'q2_correct',
      answers: [
        { id: 'q2_wrong', text: 'False', isCorrect: false },
        { id: 'q2_correct', text: 'True', isCorrect: true },
      ],
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        QuizSessionService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    });
    service = TestBed.inject(QuizSessionService);
  });

  it('starts a quiz, returns current question, and resets any previous state', () => {
    service.startQuiz(sampleQuestions);
    expect(service.hasActiveQuiz()).toBe(true);
    expect(service.getCurrentQuestion()?.id).toBe('q1');
    expect(service.getScore()).toBe(0);
    expect(service.getProgress()).toBe(0.5);
    expect(service.isLastQuestion()).toBe(false);
  });

  it('prevents submitting without selecting an answer', () => {
    service.startQuiz(sampleQuestions);
    const outcome = service.submitCurrentAnswer();
    expect(outcome).toBeNull();
    expect(service.getScore()).toBe(0);
  });

  it('increments score on correct answer and prevents changing answer or double submission', () => {
    service.startQuiz(sampleQuestions);
    service.selectAnswer('q1_correct');

    const firstSubmit = service.submitCurrentAnswer();
    expect(firstSubmit?.isCorrect).toBe(true);
    expect(service.getScore()).toBe(1);
    expect(service.snapshot.answerState).toBe('correct');

    // Attempt to change answer after confirming
    service.selectAnswer('q1_wrong');
    expect(service.snapshot.selectedAnswerId).toBe('q1_correct');

    // Attempt to confirm a second time
    const secondSubmit = service.submitCurrentAnswer();
    expect(secondSubmit).toBeNull();
    expect(service.getScore()).toBe(1);
  });

  it('does not increment score on incorrect answer, advances to next question, and detects last question', () => {
    service.startQuiz(sampleQuestions);
    service.selectAnswer('q1_wrong');
    const firstSubmit = service.submitCurrentAnswer();
    expect(firstSubmit?.isCorrect).toBe(false);
    expect(service.getScore()).toBe(0);
    expect(service.snapshot.answerState).toBe('incorrect');

    const advanced = service.goToNextQuestion();
    expect(advanced).toBe(true);
    expect(service.getCurrentQuestion()?.id).toBe('q2');
    expect(service.snapshot.selectedAnswerId).toBeUndefined();
    expect(service.snapshot.answerState).toBe('unanswered');
    expect(service.isLastQuestion()).toBe(true);
    expect(service.getProgress()).toBe(1);
  });

  it('completes and resets a quiz session cleanly', () => {
    service.startQuiz(sampleQuestions);
    service.selectAnswer('q1_correct');
    service.submitCurrentAnswer();
    service.goToNextQuestion();
    service.selectAnswer('q2_correct');
    service.submitCurrentAnswer();
    service.completeQuiz();

    expect(service.hasCompletedQuiz()).toBe(true);
    expect(service.getScore()).toBe(2);

    service.resetQuiz();
    expect(service.hasActiveQuiz()).toBe(false);
    expect(service.hasCompletedQuiz()).toBe(false);
    expect(service.getCurrentQuestion()).toBeNull();
    expect(service.getScore()).toBe(0);
  });
});
