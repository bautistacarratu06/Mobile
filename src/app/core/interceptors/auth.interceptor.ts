import { Injectable } from '@angular/core';
import {
  HttpContextToken,
  HttpErrorResponse,
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
} from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthDomainError } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {}

  /**
   * Intercepta peticiones HTTP salientes para gestionar la seguridad de tokens de acceso.
   *
   * Flujo de ejecución:
   * 1. Verifica si la URL pertenece a los orígenes protegidos (`environment.protectedApiOrigins`).
   * 2. Si es protegida y existe token activo, inyecta la cabecera `Authorization: Bearer <token>`.
   * 3. Si la respuesta devuelve HTTP 401 y no fue reintentada previamente, delega en `handle401Refresh`.
   *
   * @param req Petición HTTP saliente original.
   * @param next Siguiente manejador en la cadena de interceptores.
   * @returns Observable con el flujo de eventos HTTP.
   */
  intercept(
    req: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    if (!this.isProtectedApiRequest(req.url)) {
      return next.handle(req);
    }

    const accessToken = this.authService.getAccessTokenSnapshot();
    const authorizedReq = accessToken
      ? req.clone({
          setHeaders: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
      : req;

    return next.handle(authorizedReq).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          !req.context.get(RETRIED_AFTER_REFRESH)
        ) {
          return this.handle401Refresh(req, next);
        }
        return throwError(() => this.sanitizeHttpError(error));
      })
    );
  }

  /**
   * Gestiona respuestas HTTP 401 Unauthorized intentando renovar la sesión una única vez.
   *
   * Marca la solicitud con el contexto `RETRIED_AFTER_REFRESH` para evitar bucles infinitos de reintento.
   * Si la renovación o el segundo intento fallan, fuerza el cierre de sesión y redirige al usuario a login.
   *
   * @param originalReq Petición original que resultó rechazada con código 401.
   * @param next Siguiente manejador HTTP para reintentar la llamada.
   */
  private handle401Refresh(
    originalReq: HttpRequest<unknown>,
    next: HttpHandler
  ): Observable<HttpEvent<unknown>> {
    return this.authService.refreshSession().pipe(
      switchMap((refreshedSession) => {
        if (!refreshedSession.isAuthenticated || !refreshedSession.accessToken) {
          return this.forceLogoutAndRedirect();
        }

        const retriedReq = originalReq.clone({
          context: originalReq.context.set(RETRIED_AFTER_REFRESH, true),
          setHeaders: {
            Authorization: `Bearer ${refreshedSession.accessToken}`,
          },
        });

        return next.handle(retriedReq).pipe(
          catchError((retryErr: unknown) => {
            if (
              retryErr instanceof HttpErrorResponse &&
              retryErr.status === 401
            ) {
              return this.forceLogoutAndRedirect();
            }
            return throwError(() => this.sanitizeHttpError(retryErr));
          })
        );
      }),
      catchError(() => this.forceLogoutAndRedirect())
    );
  }

  private forceLogoutAndRedirect(): Observable<never> {
    return this.authService.logout().pipe(
      switchMap(() => {
        void this.router.navigate(['/auth/login']);
        return throwError(
          () =>
            new AuthDomainError(
              'SessionExpired',
              'Tu sesión expiró. Iniciá sesión nuevamente para continuar.',
              true
            )
        );
      })
    );
  }

  /**
   * Determina si la URL de una petición corresponde a una API interna protegida.
   *
   * Regla de aislamiento de seguridad:
   * Las llamadas dirigidas a servicios de terceros (como OpenTDB) nunca deben recibir credenciales ni tokens de Cognito.
   *
   * @param url Destino de la petición HTTP.
   * @returns `true` si la URL coincide con alguno de los orígenes protegidos configurados; `false` en caso contrario.
   */
  private isProtectedApiRequest(url: string): boolean {
    if (!url) {
      return false;
    }
    const normalized = url.toLowerCase();
    // Jamás enviar el token de Cognito a OpenTDB ni a servicios públicos externos (IFT-8, IFT-14)
    if (normalized.includes('opentdb.com')) {
      return false;
    }

    const allowedOrigins = environment.protectedApiOrigins ?? [];
    return allowedOrigins.some((origin) =>
      normalized.startsWith(origin.toLowerCase())
    );
  }

  private sanitizeHttpError(error: unknown): Error {
    if (error instanceof AuthDomainError) {
      return error;
    }
    if (error instanceof HttpErrorResponse) {
      return new AuthDomainError(
        `HTTP_${error.status || 0}`,
        'No se pudo completar la solicitud con el servidor.',
        true
      );
    }
    return new AuthDomainError(
      'HTTP_ERROR',
      'Ocurrió un error al comunicarse con el servidor.',
      true
    );
  }
}
