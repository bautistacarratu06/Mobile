import { TestBed } from '@angular/core/testing';
import {
  HTTP_INTERCEPTORS,
  HttpClient,
} from '@angular/common/http';
import {
  HttpClientTestingModule,
  HttpTestingController,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthDomainError, AuthSession } from '../models/auth.models';
import { AuthService } from '../services/auth.service';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor (IFT-8)', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;
  let mockAuthService: {
    getAccessTokenSnapshot: ReturnType<typeof vi.fn>;
    refreshSession: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  const protectedOrigin = environment.protectedApiOrigins[0];

  beforeEach(() => {
    mockAuthService = {
      getAccessTokenSnapshot: vi.fn().mockReturnValue('initial_access_token'),
      refreshSession: vi.fn(),
      logout: vi.fn().mockReturnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        {
          provide: HTTP_INTERCEPTORS,
          useClass: AuthInterceptor,
          multi: true,
        },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('NEVER sends Authorization header to OpenTDB or external non-protected endpoints', () => {
    http.get('https://opentdb.com/api.php?amount=5').subscribe();

    const openTdbReq = httpMock.expectOne('https://opentdb.com/api.php?amount=5');
    expect(openTdbReq.request.headers.has('Authorization')).toBe(false);
    openTdbReq.flush({ response_code: 0, results: [] });
  });

  it('attaches Bearer token to allowed own-API origins', () => {
    http.get(`${protectedOrigin}/scores`).subscribe();

    const req = httpMock.expectOne(`${protectedOrigin}/scores`);
    expect(req.request.headers.get('Authorization')).toBe(
      'Bearer initial_access_token'
    );
    req.flush({ ok: true });
  });

  it('refreshes session once on 401 from own API and retries the original request with the new token', () => {
    const refreshedSession: AuthSession = {
      isAuthenticated: true,
      user: {
        userId: 'u1',
        username: 'u1@quizly.app',
        attributes: {},
      },
      accessToken: 'refreshed_access_token_2',
    };
    mockAuthService.refreshSession.mockReturnValue(of(refreshedSession));

    let responseBody: unknown;
    http.get(`${protectedOrigin}/scores`).subscribe((res) => {
      responseBody = res;
    });

    const firstReq = httpMock.expectOne(`${protectedOrigin}/scores`);
    expect(firstReq.request.headers.get('Authorization')).toBe(
      'Bearer initial_access_token'
    );
    firstReq.flush(
      { message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' }
    );

    expect(mockAuthService.refreshSession).toHaveBeenCalledTimes(1);

    const retriedReq = httpMock.expectOne(`${protectedOrigin}/scores`);
    expect(retriedReq.request.headers.get('Authorization')).toBe(
      'Bearer refreshed_access_token_2'
    );
    retriedReq.flush({ items: [100] });

    expect(responseBody).toEqual({ items: [100] });
  });

  it('logs out and redirects to /auth/login without infinite refresh loops when refresh fails', () => {
    mockAuthService.refreshSession.mockReturnValue(
      throwError(
        () => new AuthDomainError('NotAuthorizedException', 'Expired', true)
      )
    );

    let capturedError: unknown;
    http.get(`${protectedOrigin}/scores`).subscribe({
      error: (err) => {
        capturedError = err;
      },
    });

    const firstReq = httpMock.expectOne(`${protectedOrigin}/scores`);
    firstReq.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(mockAuthService.refreshSession).toHaveBeenCalledTimes(1);
    expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
    expect(router.navigate).toHaveBeenCalledWith(['/auth/login']);
    expect(capturedError).toBeInstanceOf(AuthDomainError);
    expect((capturedError as AuthDomainError).message).not.toContain(
      'initial_access_token'
    );
  });
});
