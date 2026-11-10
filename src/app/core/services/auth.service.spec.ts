import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthGuard } from '../guards/auth.guard';
import { GuestGuard } from '../guards/guest.guard';
import {
  AuthDomainError,
  AuthSession,
  isValidCognitoPassword,
  sanitizeInternalReturnUrl,
} from '../models/auth.models';
import { AuthStateService } from './auth-state.service';
import { AuthService } from './auth.service';
import {
  COGNITO_CLIENT_ADAPTER,
  CognitoClientAdapter,
} from './cognito-client.adapter';

describe('AuthService, AuthStateService & Guards (IFT-3, IFT-5, IFT-6, IFT-10)', () => {
  let authService: AuthService;
  let authState: AuthStateService;
  let authGuard: AuthGuard;
  let guestGuard: GuestGuard;
  let router: Router;
  let mockAdapter: CognitoClientAdapter;

  const mockSession: AuthSession = {
    isAuthenticated: true,
    user: {
      userId: 'usr_123',
      username: 'user@quizly.app',
      email: 'user@quizly.app',
      emailVerified: true,
      attributes: { email: 'user@quizly.app', email_verified: 'true' },
    },
    accessToken: 'jwt_access_token_xyz',
    idToken: 'jwt_id_token_xyz',
    expiresAt: Date.now() + 3600_000,
  };

  beforeEach(() => {
    mockAdapter = {
      getStoredSession: vi.fn().mockResolvedValue(null),
      signUp: vi.fn().mockResolvedValue(undefined),
      confirmSignUp: vi.fn().mockResolvedValue(undefined),
      resendConfirmationCode: vi.fn().mockResolvedValue(undefined),
      signIn: vi.fn().mockResolvedValue(mockSession),
      signOut: vi.fn().mockResolvedValue(undefined),
      refreshSession: vi.fn().mockResolvedValue({
        ...mockSession,
        accessToken: 'jwt_access_refreshed',
      }),
      forgotPassword: vi.fn().mockResolvedValue(undefined),
      confirmForgotPassword: vi.fn().mockResolvedValue(undefined),
      changePassword: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        AuthStateService,
        AuthService,
        AuthGuard,
        GuestGuard,
        { provide: COGNITO_CLIENT_ADAPTER, useValue: mockAdapter },
      ],
    });

    authState = TestBed.inject(AuthStateService);
    authService = TestBed.inject(AuthService);
    authGuard = TestBed.inject(AuthGuard);
    guestGuard = TestBed.inject(GuestGuard);
    router = TestBed.inject(Router);
  });

  describe('IFT-3: Session restoration & startup initialization', () => {
    it('starts uninitialized with loading=true and restores an existing Cognito session without requiring password', async () => {
      mockAdapter.getStoredSession = vi.fn().mockResolvedValue(mockSession);

      expect(authState.isInitializedSnapshot).toBe(false);

      const session = await firstValueFrom(authService.initializeSession());

      expect(session.isAuthenticated).toBe(true);
      expect(authState.isInitializedSnapshot).toBe(true);
      expect(authState.isAuthenticatedSnapshot).toBe(true);
      expect(authState.currentUserSnapshot?.email).toBe('user@quizly.app');
    });

    it('marks state as unauthenticated only AFTER initialization completes when no session exists', async () => {
      mockAdapter.getStoredSession = vi.fn().mockResolvedValue(null);

      const session = await firstValueFrom(authService.initializeSession());

      expect(session.isAuthenticated).toBe(false);
      expect(authState.isInitializedSnapshot).toBe(true);
      expect(authState.isAuthenticatedSnapshot).toBe(false);
    });

    it('detects missing Cognito config in development without calling Cognito halfway', async () => {
      const session = await firstValueFrom(
        authService.initializeSession({
          region: '',
          userPoolId: '',
          userPoolClientId: '',
        })
      );

      expect(session.isAuthenticated).toBe(false);
      expect(mockAdapter.getStoredSession).not.toHaveBeenCalled();
      const warning = await firstValueFrom(authState.configWarning$);
      expect(warning).toContain('Cognito');
    });
  });

  describe('IFT-5: Register, Confirm Email & Login', () => {
    it('validates Cognito password policy and registers a valid account', async () => {
      expect(isValidCognitoPassword('short')).toBe(false);
      expect(isValidCognitoPassword('nouppercase1!')).toBe(false);
      expect(isValidCognitoPassword('ValidPass#1')).toBe(true);

      await firstValueFrom(authService.register('new@quizly.app', 'ValidPass#1'));
      expect(mockAdapter.signUp).toHaveBeenCalledWith(
        'new@quizly.app',
        'ValidPass#1'
      );
      expect(authService.getPendingUnconfirmedEmail()).toBe('new@quizly.app');
    });

    it('confirms email and clears pending unconfirmed email', async () => {
      await firstValueFrom(authService.register('new@quizly.app', 'ValidPass#1'));
      await firstValueFrom(authService.confirmEmail('new@quizly.app', '123456'));

      expect(mockAdapter.confirmSignUp).toHaveBeenCalledWith(
        'new@quizly.app',
        '123456'
      );
      expect(authService.getPendingUnconfirmedEmail()).toBeNull();
    });

    it('enforces cooldown when resending confirmation code and maps invalid/expired code errors without AWS details', async () => {
      authService.setResendCooldownMs(5000);
      await firstValueFrom(authService.resendConfirmationCode('new@quizly.app'));

      await expect(
        firstValueFrom(authService.resendConfirmationCode('new@quizly.app'))
      ).rejects.toMatchObject({
        code: 'LimitExceededException',
      });

      mockAdapter.confirmSignUp = vi
        .fn()
        .mockRejectedValue({ name: 'ExpiredCodeException' });

      await expect(
        firstValueFrom(authService.confirmEmail('new@quizly.app', '000000'))
      ).rejects.toMatchObject({
        code: 'ExpiredCodeException',
      });
    });

    it('returns the same generic error for NotAuthorizedException and UserNotFoundException and flags unconfirmed users', async () => {
      mockAdapter.signIn = vi
        .fn()
        .mockRejectedValueOnce({ name: 'NotAuthorizedException' })
        .mockRejectedValueOnce({ name: 'UserNotFoundException' })
        .mockRejectedValueOnce({ name: 'UserNotConfirmedException' });

      let err1!: AuthDomainError;
      let err2!: AuthDomainError;
      let err3!: AuthDomainError;

      try {
        await firstValueFrom(authService.login('a@quizly.app', 'WrongPass#1'));
      } catch (e) {
        err1 = e as AuthDomainError;
      }

      try {
        await firstValueFrom(authService.login('b@quizly.app', 'WrongPass#1'));
      } catch (e) {
        err2 = e as AuthDomainError;
      }

      try {
        await firstValueFrom(authService.login('unconfirmed@quizly.app', 'ValidPass#1'));
      } catch (e) {
        err3 = e as AuthDomainError;
      }

      expect(err1.message).toBe(err2.message);
      expect(err3.code).toBe('UserNotConfirmedException');
      expect(authService.getPendingUnconfirmedEmail()).toBe('unconfirmed@quizly.app');
    });
  });

  describe('IFT-6: Forgot Password & Change Password', () => {
    it('does not reveal whether an email exists during forgotPassword and resets password with valid code', async () => {
      mockAdapter.forgotPassword = vi
        .fn()
        .mockRejectedValue({ name: 'UserNotFoundException' });

      await expect(
        firstValueFrom(authService.forgotPassword('unknown@quizly.app'))
      ).resolves.toBeUndefined();

      await firstValueFrom(
        authService.resetPassword('unknown@quizly.app', '123456', 'NewValid#2026')
      );
      expect(mockAdapter.confirmForgotPassword).toHaveBeenCalledWith(
        'unknown@quizly.app',
        '123456',
        'NewValid#2026'
      );
    });

    it('changes password for an authenticated user and rejects weak passwords', async () => {
      await firstValueFrom(authService.login('user@quizly.app', 'ValidPass#1'));

      await expect(
        firstValueFrom(authService.changePassword('ValidPass#1', 'weak'))
      ).rejects.toMatchObject({
        code: 'InvalidPasswordException',
      });

      await firstValueFrom(
        authService.changePassword('ValidPass#1', 'Stronger#2026')
      );
      expect(mockAdapter.changePassword).toHaveBeenCalledWith(
        'ValidPass#1',
        'Stronger#2026'
      );
    });
  });

  describe('IFT-10: AuthGuard, GuestGuard & Safe Return URLs', () => {
    it('rejects external URLs and protocol-relative URLs in sanitizeInternalReturnUrl', () => {
      expect(sanitizeInternalReturnUrl('/quiz')).toBe('/quiz');
      expect(sanitizeInternalReturnUrl('/results')).toBe('/results');
      expect(sanitizeInternalReturnUrl('https://evil.example.com')).toBe('/home');
      expect(sanitizeInternalReturnUrl('//evil.example.com')).toBe('/home');
      expect(sanitizeInternalReturnUrl('javascript:alert(1)')).toBe('/home');
      expect(sanitizeInternalReturnUrl('/auth/login')).toBe('/home');
    });

    it('redirects unauthenticated users from /quiz to /auth/login?returnUrl=%2Fquiz and allows authenticated users', async () => {
      mockAdapter.getStoredSession = vi.fn().mockResolvedValue(null);

      const unauthResult = await firstValueFrom(
        authGuard.canActivate(
          {} as ActivatedRouteSnapshot,
          { url: '/quiz' } as RouterStateSnapshot
        )
      );

      expect(unauthResult).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(unauthResult as UrlTree)).toBe(
        '/auth/login?returnUrl=%2Fquiz'
      );

      await firstValueFrom(authService.login('user@quizly.app', 'ValidPass#1'));

      const authResult = await firstValueFrom(
        authGuard.canActivate(
          {} as ActivatedRouteSnapshot,
          { url: '/quiz' } as RouterStateSnapshot
        )
      );
      expect(authResult).toBe(true);
    });

    it('redirects authenticated users away from /auth/login to /home via GuestGuard', async () => {
      await firstValueFrom(authService.login('user@quizly.app', 'ValidPass#1'));

      const result = await firstValueFrom(
        guestGuard.canActivate(
          {} as ActivatedRouteSnapshot,
          { url: '/auth/login' } as RouterStateSnapshot
        )
      );

      expect(result).toBeInstanceOf(UrlTree);
      expect(router.serializeUrl(result as UrlTree)).toBe('/home');
    });
  });
});
