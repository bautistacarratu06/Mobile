import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  CanActivate,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { Observable, filter, map, switchMap, take } from 'rxjs';
import { AuthStateService } from '../services/auth-state.service';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class GuestGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly authState: AuthStateService,
    private readonly router: Router
  ) {}

  /**
   * Impide que usuarios ya autenticados ingresen a páginas de acceso para invitados (como `/auth/login` o `/auth/register`).
   *
   * Si el usuario ya cuenta con sesión iniciada, lo redirige automáticamente a `/home`.
   *
   * @param _route Información de la ruta solicitada.
   * @param _state Estado del enrutador.
   * @returns Observable que emite `true` si es un invitado sin sesión, o un `UrlTree` hacia `/home`.
   */
  canActivate(
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot
  ): Observable<boolean | UrlTree> {
    if (!this.authState.isInitializedSnapshot) {
      this.authService.initializeSession().subscribe();
    }

    return this.authState.initialized$.pipe(
      filter((initialized) => initialized === true),
      take(1),
      switchMap(() => this.authState.isAuthenticated$.pipe(take(1))),
      map((isAuthenticated) => {
        if (isAuthenticated) {
          return this.router.createUrlTree(['/home']);
        }
        return true;
      })
    );
  }
}
