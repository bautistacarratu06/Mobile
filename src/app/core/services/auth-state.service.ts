import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthError, AuthUser } from '../models/auth.models';

@Injectable({
  providedIn: 'root',
})
export class AuthStateService {
  private readonly isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);
  private readonly loadingSubject = new BehaviorSubject<boolean>(true);
  private readonly initializedSubject = new BehaviorSubject<boolean>(false);
  private readonly authErrorSubject = new BehaviorSubject<AuthError | null>(null);
  private readonly configWarningSubject = new BehaviorSubject<string | null>(null);

  readonly isAuthenticated$: Observable<boolean> =
    this.isAuthenticatedSubject.asObservable();
  readonly currentUser$: Observable<AuthUser | null> =
    this.currentUserSubject.asObservable();
  readonly loading$: Observable<boolean> = this.loadingSubject.asObservable();
  readonly initialized$: Observable<boolean> =
    this.initializedSubject.asObservable();
  readonly authError$: Observable<AuthError | null> =
    this.authErrorSubject.asObservable();
  readonly configWarning$: Observable<string | null> =
    this.configWarningSubject.asObservable();

  get isAuthenticatedSnapshot(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  get currentUserSnapshot(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get isInitializedSnapshot(): boolean {
    return this.initializedSubject.value;
  }

  setLoading(isLoading: boolean): void {
    this.loadingSubject.next(Boolean(isLoading));
  }

  /**
   * Actualiza el estado reactivo global tras una autenticación exitosa.
   *
   * Establece `isAuthenticated` en `true`, publica el usuario autenticado, limpia errores previos
   * y marca `initialized$` en `true` y `loading$` en `false`.
   *
   * @param user Información del usuario autenticado devuelta por Cognito o el pool local.
   */
  setAuthenticatedUser(user: AuthUser): void {
    this.currentUserSubject.next(user);
    this.isAuthenticatedSubject.next(true);
    this.authErrorSubject.next(null);
    this.loadingSubject.next(false);
    this.initializedSubject.next(true);
  }

  /**
   * Actualiza el estado reactivo global cuando el usuario no posee una sesión válida.
   */
  setUnauthenticated(): void {
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    this.loadingSubject.next(false);
    this.initializedSubject.next(true);
  }

  setAuthError(error: AuthError | null): void {
    this.authErrorSubject.next(error);
    this.loadingSubject.next(false);
  }

  setConfigWarning(warning: string | null): void {
    this.configWarningSubject.next(warning);
  }

  /**
   * Restablece el estado reactivo de autenticación tras el cierre de sesión voluntario del usuario.
   */
  resetOnLogout(): void {
    this.currentUserSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    this.authErrorSubject.next(null);
    this.loadingSubject.next(false);
    this.initializedSubject.next(true);
  }
}
