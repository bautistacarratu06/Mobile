import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/lazy';
import { BehaviorSubject, of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/services/auth.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { FirestoreHistoryService } from '../../core/services/firestore-history.service';
import { HapticFeedbackService } from '../../core/services/haptic-feedback.service';
import { QuizSessionService } from '../../services/quiz-session.service';
import { ProfilePage } from './profile.page';

describe('ProfilePage (IFT-6, IFT-12, IFT-14)', () => {
  let component: ProfilePage;
  let fixture: ComponentFixture<ProfilePage>;
  let authState: AuthStateService;
  let quizSession: QuizSessionService;
  let router: Router;
  let hapticsEnabled$: BehaviorSubject<boolean>;
  let mockHaptics: {
    enabled$: BehaviorSubject<boolean>;
    getEnabled: ReturnType<typeof vi.fn>;
    setEnabled: ReturnType<typeof vi.fn>;
    isAvailable: ReturnType<typeof vi.fn>;
    resetSessionTracking: ReturnType<typeof vi.fn>;
  };
  let mockAuthService: {
    logout: ReturnType<typeof vi.fn>;
    changePassword: ReturnType<typeof vi.fn>;
    registerLogoutCleanup: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    hapticsEnabled$ = new BehaviorSubject<boolean>(true);
    mockHaptics = {
      enabled$: hapticsEnabled$,
      getEnabled: vi.fn(() => hapticsEnabled$.value),
      setEnabled: vi.fn((val: boolean) => hapticsEnabled$.next(val)),
      isAvailable: vi.fn().mockReturnValue(true),
      resetSessionTracking: vi.fn(),
    };

    mockAuthService = {
      logout: vi.fn().mockReturnValue(of(undefined)),
      changePassword: vi.fn().mockReturnValue(of(undefined)),
      registerLogoutCleanup: vi.fn(),
    };

    await TestBed.configureTestingModule({
      declarations: [ProfilePage],
      imports: [IonicModule, CommonModule, FormsModule, RouterTestingModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        AuthStateService,
        QuizSessionService,
        {
          provide: FirestoreHistoryService,
          useValue: { saveResult: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: HapticFeedbackService, useValue: mockHaptics },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    authState = TestBed.inject(AuthStateService);
    quizSession = TestBed.inject(QuizSessionService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    authState.setAuthenticatedUser({
      userId: 'u-123',
      username: 'ana@quizly.app',
      email: 'ana@quizly.app',
      emailVerified: true,
      attributes: { email: 'ana@quizly.app', email_verified: 'true' },
    });

    fixture = TestBed.createComponent(ProfilePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('displays the authenticated user email and verification status', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ana@quizly.app');
    expect(el.textContent).toContain('Email verificado');
  });

  it('toggles haptic feedback preference via HapticFeedbackService (IFT-14)', () => {
    expect(component.hapticsEnabled).toBe(true);
    component.onHapticsToggle(false);
    expect(mockHaptics.setEnabled).toHaveBeenCalledWith(false);
    expect(component.hapticsEnabled).toBe(false);
  });

  it('validates Cognito password policy before calling changePassword (IFT-6)', async () => {
    component.currentPassword = 'OldPassword1!';
    component.newPassword = 'weak';
    component.confirmNewPassword = 'weak';

    await component.submitPasswordChange();
    expect(mockAuthService.changePassword).not.toHaveBeenCalled();
    expect(component.passwordError).toBeTruthy();

    component.newPassword = 'NewStrong1!';
    component.confirmNewPassword = 'NewStrong1!';
    await component.submitPasswordChange();

    expect(mockAuthService.changePassword).toHaveBeenCalledWith(
      'OldPassword1!',
      'NewStrong1!'
    );
    expect(component.passwordSuccess).toContain('actualizada');
  });

  it('clears active quiz session, logs out, and navigates to /home with replaceUrl (IFT-12)', async () => {
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

    await component.logout();

    expect(quizSession.hasActiveQuiz()).toBe(false);
    expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/home'], {
      replaceUrl: true,
    });
  });
});
