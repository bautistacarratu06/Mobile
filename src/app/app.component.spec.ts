import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';

import { APP_ROUTES } from './app-routing.module';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { FirestoreHistoryService } from './core/services/firestore-history.service';
import { QuizSessionService } from './services/quiz-session.service';

describe('AppComponent & Routing (IFT-1, IFT-3, IFT-13)', () => {
  let mockAuthService: {
    initializeSession: ReturnType<typeof vi.fn>;
    registerLogoutCleanup: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAuthService = {
      initializeSession: vi
        .fn()
        .mockReturnValue(of({ isAuthenticated: false, user: null })),
      registerLogoutCleanup: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [RouterTestingModule.withRoutes(APP_ROUTES)],
      providers: [
        QuizSessionService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: AuthService, useValue: mockAuthService },
      ],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
  });

  it('creates the app and restores the Cognito session on startup (IFT-3)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges();

    expect(app).toBeTruthy();
    expect(mockAuthService.initializeSession).toHaveBeenCalledTimes(1);
  });

  it('defines routes for /home, /quiz, /results, /profile, /history and redirects wildcard ** to home (IFT-1, IFT-10)', () => {
    const paths = APP_ROUTES.map((r) => r.path);
    expect(paths).toContain('home');
    expect(paths).toContain('quiz');
    expect(paths).toContain('results');
    expect(paths).toContain('profile');
    expect(paths).toContain('history');
    const wildcard = APP_ROUTES.find((r) => r.path === '**');
    expect(wildcard?.redirectTo).toBe('home');
  });

  it('cleans up an active quiz and returns to /home on Android hardware back button during /quiz (IFT-13)', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    const quizSession = TestBed.inject(QuizSessionService);
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    quizSession.startQuiz(
      [
        {
          id: 'q1',
          category: 'General',
          difficulty: 'easy',
          type: 'boolean',
          question: 'Q?',
          correctAnswerId: 'a1',
          answers: [
            { id: 'a1', text: 'True', isCorrect: true },
          ],
        },
      ],
      { amount: 1 }
    );
    expect(quizSession.hasActiveQuiz()).toBe(true);

    app.handleHardwareBack('/quiz');
    expect(quizSession.hasActiveQuiz()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });
});
