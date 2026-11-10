import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/lazy';
import { Subject, of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthStateService } from '../core/services/auth-state.service';
import { FirestoreHistoryService } from '../core/services/firestore-history.service';
import { QuizDomainError, QuizQuestion } from '../models/quiz.models';
import { OpenTdbService } from '../services/opentdb.service';
import { QuizSessionService } from '../services/quiz-session.service';
import { SharedModule } from '../shared/shared.module';
import { HomePage } from './home.page';

describe('HomePage (IFT-1, IFT-4)', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;
  let mockOpenTdb: { getQuestions: ReturnType<typeof vi.fn> };
  let quizSession: QuizSessionService;
  let router: Router;

  const sampleQuestions: QuizQuestion[] = [
    {
      id: 'q1',
      category: 'General Knowledge',
      difficulty: 'easy',
      type: 'multiple',
      question: 'Sample question?',
      correctAnswerId: 'a1',
      answers: [
        { id: 'a1', text: 'Yes', isCorrect: true },
        { id: 'a2', text: 'No', isCorrect: false },
      ],
    },
  ];

  beforeEach(async () => {
    mockOpenTdb = {
      getQuestions: vi.fn().mockReturnValue(of(sampleQuestions)),
    };

    await TestBed.configureTestingModule({
      declarations: [HomePage],
      imports: [IonicModule, CommonModule, FormsModule, RouterTestingModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        QuizSessionService,
        AuthStateService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: OpenTdbService, useValue: mockOpenTdb },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    quizSession = TestBed.inject(QuizSessionService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  });

  it('renders Quizly brand and hero heading on startup without errors', () => {
    expect(component).toBeTruthy();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Quizly');
    expect(compiled.textContent).toContain('Pon a prueba tus conocimientos');
  });

  it('rejects question amounts outside 1..50 without calling OpenTDB', () => {
    component.amount = 0;
    component.startQuiz();
    expect(mockOpenTdb.getQuestions).not.toHaveBeenCalled();
    expect(component.errorCode).toBe('INVALID_PARAMS');

    component.amount = 51;
    component.startQuiz();
    expect(mockOpenTdb.getQuestions).not.toHaveBeenCalled();
  });

  it('disables the primary button while loading and prevents double navigation', () => {
    const pending$ = new Subject<QuizQuestion[]>();
    mockOpenTdb.getQuestions.mockReturnValue(pending$.asObservable());

    component.startQuiz();
    fixture.detectChanges();

    expect(component.isLoading).toBe(true);
    const btn = fixture.nativeElement.querySelector(
      '[data-testid="start-quiz-btn"]'
    ) as HTMLIonButtonElement;
    expect(btn.disabled).toBe(true);

    // Second click while loading should be ignored
    component.startQuiz();
    expect(mockOpenTdb.getQuestions).toHaveBeenCalledTimes(1);

    pending$.next(sampleQuestions);
    pending$.complete();
    fixture.detectChanges();

    expect(component.isLoading).toBe(false);
    expect(quizSession.hasActiveQuiz()).toBe(true);
    expect(router.navigate).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/quiz']);
  });

  it('displays an accessible error message and recovery action when the API fails or returns no results', () => {
    mockOpenTdb.getQuestions.mockReturnValue(
      throwError(
        () =>
          new QuizDomainError(
            'NO_RESULTS',
            'No se encontraron preguntas para los filtros elegidos.',
            true
          )
      )
    );

    component.startQuiz();
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector(
      '[data-testid="home-error-banner"]'
    ) as HTMLElement;
    expect(banner).toBeTruthy();
    expect(banner.textContent).toContain(
      'No se encontraron preguntas para los filtros elegidos.'
    );
    const resetBtn = fixture.nativeElement.querySelector(
      '[data-testid="home-reset-filters-btn"]'
    );
    expect(resetBtn).toBeTruthy();
  });

  it('renders a discrete Spanish translation availability notice in the footer', () => {
    fixture.detectChanges();
    const footerNotice = fixture.nativeElement.querySelector(
      '[data-testid="footer-translation-notice"]'
    ) as HTMLElement;
    expect(footerNotice).toBeTruthy();
    expect(footerNotice.textContent?.trim()).toContain(
      'Esta aplicación todavía no está disponible en español. El contenido está en inglés.'
    );
  });
});
