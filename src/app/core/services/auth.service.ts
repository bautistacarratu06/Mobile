import { Inject, Injectable, Optional } from '@angular/core';
import {
  Observable,
  catchError,
  defer,
  finalize,
  from,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { CognitoConfig } from '../../../environments/environment.model';
import {
  AuthDomainError,
  AuthSession,
  AuthUser,
  isValidCognitoPassword,
} from '../models/auth.models';
import { AuthStateService } from './auth-state.service';
import {
  AwsCognitoClientAdapter,
  COGNITO_CLIENT_ADAPTER,
  CognitoClientAdapter,
} from './cognito-client.adapter';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly adapter: CognitoClientAdapter;
  private currentSession: AuthSession = { isAuthenticated: false, user: null };
  private initInFlight$: Observable<AuthSession> | null = null;
  private refreshInFlight$: Observable<AuthSession> | null = null;
  private readonly logoutCleanupCallbacks: Array<() => void> = [];
  private lastResendByEmail = new Map<string, number>();
  private resendCooldownMs = 30000;
  private pendingUnconfirmedEmail: string | null = null;

  constructor(
    private readonly authState: AuthStateService,
    private readonly defaultAdapter: AwsCognitoClientAdapter,
    @Optional()
    @Inject(COGNITO_CLIENT_ADAPTER)
    customAdapter?: CognitoClientAdapter
  ) {
    this.adapter = customAdapter ?? this.defaultAdapter;
  }

  /**
   * Registra callbacks de limpieza que se ejecutan al cerrar sesión o perder sesión (IFT-12, IFT-14).
   */
  /**
   * Habilita el modo invitado en la aplicación sin requerir credenciales de Cognito.
   *
   * Asigna un usuario efímero con identificador `'guest'`, marca la bandera de bypass en LocalStorage
   * y actualiza el estado de autenticación reactivo.
   *
   * @returns La sesión de autenticación configurada para el invitado.
   */
  enterGuestMode(): AuthSession {
    try {
      localStorage.setItem('quizly_skip_login', '1');
    } catch {
      // ignorar
    }
    return this.applyGuestSession();
  }

  private isGuestModeFlagged(): boolean {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('quizly_skip_login') === '1';
    } catch {
      return false;
    }
  }

  private applyGuestSession(): AuthSession {
    const guest: AuthUser = {
      userId: 'guest',
      username: 'invitado',
      email: 'invitado@quizly.local',
      emailVerified: true,
      attributes: { email: 'invitado@quizly.local' },
    };
    this.currentSession = {
      isAuthenticated: true,
      user: guest,
      accessToken: 'guest-token',
      expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000,
    };
    this.authState.setConfigWarning(null);
    this.authState.setAuthenticatedUser(guest);
    return this.currentSession;
  }

  registerLogoutCleanup(callback: () => void): void {
    this.logoutCleanupCallbacks.push(callback);
  }

  setResendCooldownMs(ms: number): void {
    this.resendCooldownMs = Math.max(0, ms);
  }

  getPendingUnconfirmedEmail(): string | null {
    return this.pendingUnconfirmedEmail;
  }

  setPendingUnconfirmedEmail(email: string | null): void {
    this.pendingUnconfirmedEmail = email ? email.trim().toLowerCase() : null;
  }

  /**
   * Valida que la configuración pública de Cognito esté completa (IFT-3).
   */
  isCognitoConfigValid(config: CognitoConfig = environment.cognito): boolean {
    return Boolean(
      config &&
        typeof config.region === 'string' &&
        config.region.trim().length > 0 &&
        typeof config.userPoolId === 'string' &&
        config.userPoolId.trim().length > 0 &&
        typeof config.userPoolClientId === 'string' &&
        config.userPoolClientId.trim().length > 0
    );
  }

  /**
   * Inicializa y restaura la sesión de autenticación al arrancar la aplicación.
   *
   * Verifica si existe una sesión de invitado activa, valida la configuración del User Pool de Cognito
   * y recupera los tokens almacenados mediante el adaptador. Deduplica peticiones concurrentes mediante `shareReplay(1)`.
   *
   * @param config Configuración del pool de Cognito a utilizar (por defecto la de `environment.cognito`).
   * @returns Un Observable que emite la sesión restaurada o una sesión no autenticada.
   */
  initializeSession(
    config: CognitoConfig = environment.cognito
  ): Observable<AuthSession> {
    if (this.isGuestModeFlagged()) {
      return of(this.applyGuestSession());
    }

    if (this.initInFlight$) {
      return this.initInFlight$;
    }

    this.authState.setLoading(true);

    if (!this.isCognitoConfigValid(config)) {
      if (!environment.production) {
        this.authState.setConfigWarning(
          'Falta configurar Amazon Cognito (region, userPoolId o userPoolClientId) en environment.ts. No se realizarán llamadas a Cognito hasta completarla.'
        );
      }
      this.currentSession = { isAuthenticated: false, user: null };
      this.authState.setUnauthenticated();
      return of(this.currentSession);
    }

    this.authState.setConfigWarning(null);

    const request$ = defer(() => from(this.adapter.getStoredSession())).pipe(
      map((stored) => {
        if (stored && stored.isAuthenticated && stored.user) {
          this.currentSession = stored;
          this.authState.setAuthenticatedUser(stored.user);
          return stored;
        }
        this.currentSession = { isAuthenticated: false, user: null };
        this.authState.setUnauthenticated();
        return this.currentSession;
      }),
      catchError(() => {
        this.currentSession = { isAuthenticated: false, user: null };
        this.authState.setUnauthenticated();
        return of(this.currentSession);
      }),
      finalize(() => {
        this.initInFlight$ = null;
      }),
      shareReplay(1)
    );

    this.initInFlight$ = request$;
    return request$;
  }

  /**
   * Registra una nueva cuenta de usuario en el User Pool de Cognito.
   *
   * Valida previamente el formato del email y el cumplimiento de la política de contraseñas.
   * Al completarse, guarda el email como pendiente de confirmación.
   *
   * @param email Dirección de correo electrónico del usuario.
   * @param password Contraseña elegida conforme a la política de Cognito.
   * @returns Un Observable que completa cuando la solicitud de registro es aceptada.
   * @throws {AuthDomainError} Si el email o contraseña son inválidos o si el usuario ya existe (`UsernameExistsException`).
   */
  register(email: string, password: string): Observable<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!this.isValidEmail(cleanEmail)) {
      return throwError(
        () =>
          new AuthDomainError(
            'INVALID_EMAIL',
            'Ingresá una dirección de email válida.',
            true
          )
      );
    }
    if (!isValidCognitoPassword(password)) {
      return throwError(
        () =>
          new AuthDomainError(
            'InvalidPasswordException',
            'La contraseña debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y símbolo.',
            true
          )
      );
    }
    if (!this.isCognitoConfigValid()) {
      return throwError(() => this.createMissingConfigError());
    }

    this.authState.setLoading(true);
    return defer(() => from(this.adapter.signUp(cleanEmail, password))).pipe(
      tap(() => {
        this.pendingUnconfirmedEmail = cleanEmail;
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'register');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Confirma la cuenta de un usuario mediante el código numérico de 6 dígitos enviado por correo.
   *
   * @param email Dirección de correo electrónico registrada.
   * @param code Código de confirmación recibido.
   * @returns Un Observable que completa al verificar exitosamente el código.
   * @throws {AuthDomainError} Si los parámetros están incompletos, el código expiró o es incorrecto (`CodeMismatchException`).
   */
  confirmEmail(email: string, code: string): Observable<void> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!cleanEmail || !cleanCode) {
      return throwError(
        () =>
          new AuthDomainError(
            'CodeMismatchException',
            'Ingresá tu email y el código de verificación recibido.',
            true
          )
      );
    }

    this.authState.setLoading(true);
    return defer(() =>
      from(this.adapter.confirmSignUp(cleanEmail, cleanCode))
    ).pipe(
      tap(() => {
        if (this.pendingUnconfirmedEmail === cleanEmail) {
          this.pendingUnconfirmedEmail = null;
        }
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'confirm');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Reenvía el código de confirmación de email con control de frecuencia (*cooldown*) para evitar sobrecargar Cognito.
   *
   * @param email Dirección de correo electrónico del usuario.
   * @returns Un Observable que completa cuando Cognito acepta el reenvío.
   * @throws {AuthDomainError} Si el email no es válido o si se superó el límite de intentos (`LimitExceededException`).
   */
  resendConfirmationCode(email: string): Observable<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!this.isValidEmail(cleanEmail)) {
      return throwError(
        () =>
          new AuthDomainError(
            'INVALID_EMAIL',
            'Ingresá un email válido para reenviar el código.',
            true
          )
      );
    }

    const lastSent = this.lastResendByEmail.get(cleanEmail) ?? 0;
    const now = Date.now();
    if (now - lastSent < this.resendCooldownMs) {
      return throwError(
        () =>
          new AuthDomainError(
            'LimitExceededException',
            'Por favor esperá unos segundos antes de solicitar un nuevo código.',
            true
          )
      );
    }

    this.authState.setLoading(true);
    return defer(() =>
      from(this.adapter.resendConfirmationCode(cleanEmail))
    ).pipe(
      tap(() => {
        this.lastResendByEmail.set(cleanEmail, Date.now());
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'confirm');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Autentica a un usuario mediante sus credenciales (email y contraseña).
   *
   * En caso de éxito, actualiza el estado de autenticación reactivo con los tokens emitidos.
   * Si la cuenta no fue confirmada aún, almacena el email en `pendingUnconfirmedEmail` y lanza
   * `UserNotConfirmedException` para habilitar el flujo de confirmación.
   *
   * @param email Correo electrónico registrado.
   * @param password Contraseña de acceso.
   * @returns Un Observable que emite los datos del usuario autenticado (`AuthUser`).
   * @throws {AuthDomainError} Con `'NotAuthorizedException'` ante credenciales incorrectas,
   *                           o `'UserNotConfirmedException'` si requiere ingresar el código de verificación.
   */
  login(email: string, password: string): Observable<AuthUser> {
    const cleanEmail = email.trim().toLowerCase();
    if (!this.isValidEmail(cleanEmail) || !password) {
      return throwError(
        () =>
          new AuthDomainError(
            'NotAuthorizedException',
            'El email o la contraseña son incorrectos.',
            true
          )
      );
    }
    if (!this.isCognitoConfigValid()) {
      return throwError(() => this.createMissingConfigError());
    }

    this.authState.setLoading(true);
    return defer(() => from(this.adapter.signIn(cleanEmail, password))).pipe(
      map((session) => {
        if (!session.user) {
          throw new AuthDomainError(
            'NotAuthorizedException',
            'El email o la contraseña son incorrectos.',
            true
          );
        }
        this.currentSession = session;
        this.pendingUnconfirmedEmail = null;
        try {
          localStorage.removeItem('quizly_skip_login');
        } catch {
          // ignorar
        }
        this.authState.setAuthenticatedUser(session.user);
        return session.user;
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'login');
        if (mapped.code === 'UserNotConfirmedException') {
          this.pendingUnconfirmedEmail = cleanEmail;
        }
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Cierra la sesión activa del usuario, revoca los tokens en Cognito y ejecuta los callbacks de limpieza registrados.
   *
   * @returns Un Observable que completa al finalizar el proceso de cierre de sesión.
   */
  logout(): Observable<void> {
    this.authState.setLoading(true);
    return defer(() => from(this.adapter.signOut())).pipe(
      catchError(() => of(undefined)),
      tap(() => {
        this.clearSessionAndNotifyCallbacks();
      })
    );
  }

  getCurrentUser(): Observable<AuthUser | null> {
    return this.authState.currentUser$;
  }

  getSession(): Observable<AuthSession> {
    return of({
      isAuthenticated: this.currentSession.isAuthenticated,
      user: this.currentSession.user,
      accessToken: this.currentSession.accessToken,
      idToken: this.currentSession.idToken,
      expiresAt: this.currentSession.expiresAt,
    });
  }

  getAccessTokenSnapshot(): string | undefined {
    return this.currentSession.isAuthenticated
      ? this.currentSession.accessToken
      : undefined;
  }

  /**
   * Solicita la renovación del token de acceso (`accessToken`) ante la expiración de la sesión.
   *
   * Implementa deduplicación concurrente mediante `shareReplay(1)` para evitar ráfagas de solicitudes de refresco.
   *
   * @returns Un Observable que emite la sesión actualizada con nuevos tokens.
   */
  refreshSession(): Observable<AuthSession> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }

    const request$ = defer(() => from(this.adapter.refreshSession())).pipe(
      tap((refreshed) => {
        this.currentSession = refreshed;
        if (refreshed.user) {
          this.authState.setAuthenticatedUser(refreshed.user);
        }
      }),
      catchError((err: unknown) => {
        this.clearSessionAndNotifyCallbacks();
        const mapped = this.mapCognitoError(err, 'refresh');
        return throwError(() => mapped);
      }),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
      shareReplay(1)
    );

    this.refreshInFlight$ = request$;
    return request$;
  }

  /**
   * Inicia el flujo de recuperación de contraseña olvidada.
   *
   * Por razones de seguridad (prevención de enumeración de usuarios), si el usuario no existe en Cognito
   * la operación no lanza error y completa exitosamente sin revelar la inexistencia del correo.
   *
   * @param email Dirección de correo electrónico del usuario.
   * @returns Un Observable que completa al enviar el código de recuperación.
   * @throws {AuthDomainError} Si el formato del email es inválido o ante errores no recuperables del servicio.
   */
  forgotPassword(email: string): Observable<void> {
    const cleanEmail = email.trim().toLowerCase();
    if (!this.isValidEmail(cleanEmail)) {
      return throwError(
        () =>
          new AuthDomainError(
            'INVALID_EMAIL',
            'Ingresá una dirección de email válida.',
            true
          )
      );
    }

    this.authState.setLoading(true);
    return defer(() => from(this.adapter.forgotPassword(cleanEmail))).pipe(
      tap(() => {
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const rawName = this.extractErrorName(err);
        // Nunca revelar si el usuario existe o no (IFT-6)
        if (rawName === 'UserNotFoundException') {
          this.authState.setLoading(false);
          this.authState.setAuthError(null);
          return of(undefined);
        }
        const mapped = this.mapCognitoError(err, 'forgotPassword');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Restablece la contraseña utilizando el código de confirmación recibido por correo.
   *
   * @param email Dirección de correo electrónico asociada a la cuenta.
   * @param code Código de recuperación de 6 dígitos.
   * @param newPassword Nueva contraseña elegida conforme a la política de seguridad.
   * @returns Un Observable que completa tras actualizar la contraseña exitosamente.
   * @throws {AuthDomainError} Si el código es incorrecto (`CodeMismatchException`) o la contraseña no es válida.
   */
  resetPassword(
    email: string,
    code: string,
    newPassword: string
  ): Observable<void> {
    const cleanEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();
    if (!this.isValidEmail(cleanEmail) || !cleanCode) {
      return throwError(
        () =>
          new AuthDomainError(
            'CodeMismatchException',
            'Completá el email y el código de recuperación recibido.',
            true
          )
      );
    }
    if (!isValidCognitoPassword(newPassword)) {
      return throwError(
        () =>
          new AuthDomainError(
            'InvalidPasswordException',
            'La nueva contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.',
            true
          )
      );
    }

    this.authState.setLoading(true);
    return defer(() =>
      from(
        this.adapter.confirmForgotPassword(cleanEmail, cleanCode, newPassword)
      )
    ).pipe(
      tap(() => {
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'resetPassword');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  /**
   * Modifica la contraseña de acceso de un usuario con sesión autenticada activa.
   *
   * @param oldPassword Contraseña actual del usuario.
   * @param newPassword Nueva contraseña a establecer.
   * @returns Un Observable que completa al confirmarse el cambio en Cognito.
   * @throws {AuthDomainError} Si la contraseña actual es errónea (`NotAuthorizedException`) o la nueva es inválida.
   */
  changePassword(oldPassword: string, newPassword: string): Observable<void> {
    if (!oldPassword) {
      return throwError(
        () =>
          new AuthDomainError(
            'NotAuthorizedException',
            'Ingresá tu contraseña actual.',
            true
          )
      );
    }
    if (!isValidCognitoPassword(newPassword)) {
      return throwError(
        () =>
          new AuthDomainError(
            'InvalidPasswordException',
            'La nueva contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.',
            true
          )
      );
    }

    this.authState.setLoading(true);
    return defer(() =>
      from(this.adapter.changePassword(oldPassword, newPassword))
    ).pipe(
      tap(() => {
        this.authState.setLoading(false);
        this.authState.setAuthError(null);
      }),
      catchError((err: unknown) => {
        const mapped = this.mapCognitoError(err, 'changePassword');
        this.authState.setAuthError(mapped);
        return throwError(() => mapped);
      })
    );
  }

  isAuthenticated(): Observable<boolean> {
    return this.authState.isAuthenticated$;
  }

  private clearSessionAndNotifyCallbacks(): void {
    try {
      localStorage.removeItem('quizly_skip_login');
    } catch {
      // ignorar
    }
    this.currentSession = { isAuthenticated: false, user: null };
    this.pendingUnconfirmedEmail = null;
    this.authState.resetOnLogout();
    for (const cb of this.logoutCleanupCallbacks) {
      try {
        cb();
      } catch {
        // Evitar que un callback interrumpa el cierre de sesión
      }
    }
  }

  private mapCognitoError(
    error: unknown,
    context:
      | 'login'
      | 'register'
      | 'confirm'
      | 'forgotPassword'
      | 'resetPassword'
      | 'changePassword'
      | 'refresh'
  ): AuthDomainError {
    if (error instanceof AuthDomainError) {
      return error;
    }

    const name = this.extractErrorName(error);

    switch (name) {
      case 'NotAuthorizedException':
      case 'UserNotFoundException':
        if (context === 'changePassword') {
          return new AuthDomainError(
            'NotAuthorizedException',
            'La contraseña actual ingresada no es correcta.',
            true
          );
        }
        return new AuthDomainError(
          'NotAuthorizedException',
          'El email o la contraseña son incorrectos.',
          true
        );

      case 'UsernameExistsException':
        return new AuthDomainError(
          'UsernameExistsException',
          'Ya existe una cuenta registrada con este email.',
          true
        );

      case 'CodeMismatchException':
        return new AuthDomainError(
          'CodeMismatchException',
          'El código ingresado es incorrecto. Verificalo e intentá nuevamente.',
          true
        );

      case 'ExpiredCodeException':
        return new AuthDomainError(
          'ExpiredCodeException',
          'El código ha vencido. Solicitá uno nuevo para continuar.',
          true
        );

      case 'LimitExceededException':
      case 'TooManyRequestsException':
        return new AuthDomainError(
          'LimitExceededException',
          'Demasiados intentos seguidos. Esperá unos minutos antes de volver a intentar.',
          true
        );

      case 'InvalidPasswordException':
        return new AuthDomainError(
          'InvalidPasswordException',
          'La contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.',
          true
        );

      case 'UserNotConfirmedException':
        return new AuthDomainError(
          'UserNotConfirmedException',
          'Tu email todavía no está confirmado. Ingresá el código que te enviamos.',
          true
        );

      case 'PasswordResetRequiredException':
        return new AuthDomainError(
          'PasswordResetRequiredException',
          'Es necesario restablecer tu contraseña antes de iniciar sesión.',
          true
        );

      case 'NetworkError':
        return new AuthDomainError(
          'NetworkError',
          'No se pudo conectar con el servicio de autenticación. Revisá tu conexión a Internet.',
          true
        );

      default:
        return new AuthDomainError(
          'AuthUnknownError',
          'No se pudo completar la operación en este momento. Intentá nuevamente.',
          true
        );
    }
  }

  private extractErrorName(error: unknown): string {
    if (error && typeof error === 'object' && 'name' in error) {
      const name = (error as { name?: unknown }).name;
      if (typeof name === 'string') {
        return name;
      }
    }
    return 'UnknownError';
  }

  private createMissingConfigError(): AuthDomainError {
    return new AuthDomainError(
      'MissingCognitoConfig',
      'El servicio de autenticación no está configurado en este entorno.',
      false
    );
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }
}
