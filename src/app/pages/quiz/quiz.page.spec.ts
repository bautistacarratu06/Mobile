import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/lazy';
import { vi } from 'vitest';
import { AuthStateService } from '../../core/services/auth-state.service';
import { FirestoreHistoryService } from '../../core/services/firestore-history.service';
import { HapticFeedbackService } from '../../core/services/haptic-feedback.service';
import { QuizQuestion } from '../../models/quiz.models';
import { QuizSessionService } from '../../services/quiz-session.service';
import { QuizPage } from './quiz.page';

describe('QuizPage (IFT-7, IFT-14)', () => {
  let component: QuizPage;
  let fixture: ComponentFixture<QuizPage>;
  let quizSession: QuizSessionService;
  let authState: AuthStateService;
  let router: Router;
  let mockHaptics: {
    notifyAnswerResult: ReturnType<typeof vi.fn>;
    quizCompleted: ReturnType<typeof vi.fn>;
    resetSessionTracking: ReturnType<typeof vi.fn>;
  };

  const questions: QuizQuestion[] = [
    {
      id: 'q1',
      category: 'Science: Computers',
      difficulty: 'easy',
      type: 'multiple',
      question: 'What does CPU stand for?',
      correctAnswerId: 'a1',
      answers: [
        {
          id: 'a1',
          text: 'Central Processing Unit',
          isCorrect: true,
        },
        {
          id: 'a2',
          text: 'Computer Personal Unit',
          isCorrect: false,
        },
      ],
    },
    {
      id: 'q2',
      category: 'Science: Computers',
      difficulty: 'medium',
      type: 'boolean',
      question: 'HTML is a programming language.',
      correctAnswerId: 'b2',
      answers: [
        { id: 'b1', text: 'True', isCorrect: false },
        { id: 'b2', text: 'False', isCorrect: true },
      ],
    },
  ];

  beforeEach(async () => {
    mockHaptics = {
      notifyAnswerResult: vi.fn().mockResolvedValue(undefined),
      quizCompleted: vi.fn().mockResolvedValue(undefined),
      resetSessionTracking: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [QuizPage],
      imports: [IonicModule, CommonModule, FormsModule, RouterTestingModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        QuizSessionService,
        AuthStateService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: HapticFeedbackService, useValue: mockHaptics },
      ],
    }).compileComponents();

    quizSession = TestBed.inject(QuizSessionService);
    authState = TestBed.inject(AuthStateService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    authState.setAuthenticatedUser({
      userId: 'u-1',
      username: 'user@quizly.app',
      email: 'user@quizly.app',
      emailVerified: true,
      attributes: {},
    });
  });

  it('redirects to /home if opened without an active quiz session', () => {
    fixture = TestBed.createComponent(QuizPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });

  it('displays question progress, renders question text directly in English, and disables confirm until an option is selected', () => {
    quizSession.startQuiz(questions, { amount: 2 });
    fixture = TestBed.createComponent(QuizPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Pregunta 1 de 2');
    expect(el.textContent).toContain('What does CPU stand for?');

    const confirmBtn = el.querySelector(
      '[data-testid="confirm-answer-btn"]'
    ) as HTMLIonButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    component.selectAnswer('a2');
    fixture.detectChanges();
    expect(confirmBtn.disabled).toBe(false);
  });

  it('triggers haptic feedback once on answer confirmation, shows accessible feedback, and advances to results on last question', () => {
    quizSession.startQuiz(questions, { amount: 2 });
    fixture = TestBed.createComponent(QuizPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    // Select wrong answer on Q1
    component.selectAnswer('a2');
    component.submitAnswer();
    fixture.detectChanges();

    expect(mockHaptics.notifyAnswerResult).toHaveBeenCalledTimes(1);
    expect(mockHaptics.notifyAnswerResult).toHaveBeenCalledWith('q1', false);
    expect(component.isAnswered).toBe(true);
    expect(component.feedbackText).toContain('Respuesta incorrecta');

    // Attempt to submit again on same question does nothing
    component.submitAnswer();
    expect(mockHaptics.notifyAnswerResult).toHaveBeenCalledTimes(1);

    // Advance to Q2
    component.nextOrFinish();
    fixture.detectChanges();

    expect(component.currentIndex).toBe(1);
    expect(component.isLastQuestion).toBe(true);

    // Select right answer on Q2
    component.selectAnswer('b2');
    component.submitAnswer();
    fixture.detectChanges();

    expect(mockHaptics.notifyAnswerResult).toHaveBeenCalledWith('q2', true);
    expect(component.score).toBe(1);

    // Finish quiz -> navigates to /results
    component.nextOrFinish();
    expect(mockHaptics.quizCompleted).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/results'], {
      replaceUrl: true,
    });
  });
});
