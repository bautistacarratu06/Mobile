import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, filter, map, of, switchMap, take } from 'rxjs';
import { sanitizeInternalReturnUrl } from '../models/auth.models';
import { AuthStateService } from '../services/auth-state.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly authState: AuthStateService,
    private readonly router: Router
  ) {}

  /**
   * Controla el acceso a rutas que exigen un usuario autenticado o en modo invitado.
   *
   * Espera a que el servicio de autenticación complete la inicialización (`initialized$ === true`).
   * Si no hay sesión válida, redirige a `/auth/login` preservando la ruta solicitada en `returnUrl` (saneada contra *Open Redirects*).
   *
   * @param _route Información de la ruta activada.
   * @param state Estado actual del enrutador y URL solicitada.
   * @returns Observable que emite `true` si se permite la navegación o un `UrlTree` hacia el login.
   */
  canActivate(
    _route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    // Modo invitado: permite saltar el login (boton 'Saltar login')
    if (typeof localStorage !== 'undefined' && localStorage.getItem('quizly_skip_login') === '1') {
      return of(true);
    }

    if (!this.authState.isInitializedSnapshot) {
      this.authService.initializeSession().subscribe();
    }

    return this.authState.initialized$.pipe(
      filter((initialized) => initialized === true),
      take(1),
      switchMap(() => this.authState.isAuthenticated$.pipe(take(1))),
      map((isAuthenticated) => {
        if (isAuthenticated) {
          return true;
        }
        const safeReturnUrl = sanitizeInternalReturnUrl(state.url, '/home');
        return this.router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: safeReturnUrl },
        });
      })
    );
  }
}
