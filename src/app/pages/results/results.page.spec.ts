import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/lazy';
import { vi } from 'vitest';
import { FirestoreHistoryService } from '../../core/services/firestore-history.service';
import { QuizQuestion } from '../../models/quiz.models';
import { QuizSessionService } from '../../services/quiz-session.service';
import { ResultsPage } from './results.page';

describe('ResultsPage (IFT-9)', () => {
  let component: ResultsPage;
  let fixture: ComponentFixture<ResultsPage>;
  let quizSession: QuizSessionService;
  let router: Router;

  const sampleQuestions: QuizQuestion[] = [
    {
      id: 'q1',
      category: 'General Knowledge',
      difficulty: 'easy',
      type: 'boolean',
      question: 'Q1?',
      correctAnswerId: 'a1',
      answers: [
        { id: 'a1', text: 'True', isCorrect: true },
        { id: 'a2', text: 'False', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      category: 'General Knowledge',
      difficulty: 'easy',
      type: 'boolean',
      question: 'Q2?',
      correctAnswerId: 'b1',
      answers: [
        { id: 'b1', text: 'True', isCorrect: true },
        { id: 'b2', text: 'False', isCorrect: false },
      ],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ResultsPage],
      imports: [IonicModule, CommonModule, RouterTestingModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        QuizSessionService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compileComponents();

    quizSession = TestBed.inject(QuizSessionService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('redirects to /home if opened without a completed quiz', () => {
    fixture = TestBed.createComponent(ResultsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });

  it('displays score, percentage, and dynamic performance message for a completed quiz', () => {
    quizSession.startQuiz(sampleQuestions, { amount: 2 });
    // Answer Q1 right, Q2 right -> 100%
    quizSession.selectAnswer('a1');
    quizSession.submitCurrentAnswer();
    quizSession.goToNextQuestion();
    quizSession.selectAnswer('b1');
    quizSession.submitCurrentAnswer();
    quizSession.completeQuiz();

    fixture = TestBed.createComponent(ResultsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(component.score).toBe(2);
    expect(component.totalQuestions).toBe(2);
    expect(component.percentage).toBe(100);
    expect(el.textContent).toContain('100%');
    expect(el.textContent).toContain('Excelente');
  });

  it('resets the quiz session and navigates to /home when clicking Jugar de nuevo', () => {
    quizSession.startQuiz(sampleQuestions, { amount: 2 });
    quizSession.selectAnswer('a2');
    quizSession.submitCurrentAnswer();
    quizSession.completeQuiz();

    fixture = TestBed.createComponent(ResultsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.performanceTitle).toContain('Sigue practicando');

    component.playAgain();
    expect(quizSession.hasCompletedQuiz()).toBe(false);
    expect(quizSession.hasActiveQuiz()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });
});
