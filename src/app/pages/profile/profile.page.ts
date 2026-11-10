import { ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import {
  AuthDomainError,
  AuthUser,
  isValidCognitoPassword,
} from '../../core/models/auth.models';
import { AuthService } from '../../core/services/auth.service';
import { AuthStateService } from '../../core/services/auth-state.service';
import { HapticFeedbackService } from '../../core/services/haptic-feedback.service';
import { QuizSessionService } from '../../services/quiz-session.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.page.html',
  styleUrls: ['./profile.page.scss'],
  standalone: false,
})
export class ProfilePage implements OnInit, OnDestroy {
  private readonly destroy$ = new Subject<void>();

  user: AuthUser | null = null;
  hapticsEnabled = true;
  hapticsSupported = true;

  currentPassword = '';
  newPassword = '';
  confirmNewPassword = '';
  isChangingPassword = false;
  passwordError: string | null = null;
  passwordSuccess: string | null = null;

  isLoggingOut = false;

  get isGuestUser(): boolean {
    return this.user?.userId === 'guest';
  }

  constructor(
    private readonly authState: AuthStateService,
    private readonly authService: AuthService,
    private readonly quizSession: QuizSessionService,
    private readonly haptics: HapticFeedbackService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.hapticsSupported = this.haptics.isAvailable();
    this.hapticsEnabled = this.haptics.getEnabled();

    this.authState.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        this.user = user;
        this.cdr.markForCheck();
      });

    this.haptics.enabled$
      .pipe(takeUntil(this.destroy$))
      .subscribe((enabled) => {
        this.hapticsEnabled = enabled;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onHapticsToggle(enabled: boolean): void {
    this.hapticsEnabled = Boolean(enabled);
    this.haptics.setEnabled(this.hapticsEnabled);
    this.cdr.markForCheck();
  }

  async submitPasswordChange(): Promise<void> {
    if (this.isChangingPassword) {
      return;
    }

    this.passwordError = null;
    this.passwordSuccess = null;

    if (!this.currentPassword) {
      this.passwordError = 'Ingresá tu contraseña actual.';
      this.cdr.markForCheck();
      return;
    }

    if (!isValidCognitoPassword(this.newPassword)) {
      this.passwordError =
        'La nueva contraseña debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y símbolo.';
      this.cdr.markForCheck();
      return;
    }

    if (this.newPassword !== this.confirmNewPassword) {
      this.passwordError = 'La confirmación de la nueva contraseña no coincide.';
      this.cdr.markForCheck();
      return;
    }

    this.isChangingPassword = true;
    this.cdr.markForCheck();

    try {
      await firstValueFrom(
        this.authService.changePassword(this.currentPassword, this.newPassword)
      );
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmNewPassword = '';
      this.passwordSuccess = 'Tu contraseña ha sido actualizada correctamente.';
    } catch (err: unknown) {
      if (err instanceof AuthDomainError) {
        this.passwordError = err.message;
      } else {
        this.passwordError =
          'No se pudo actualizar la contraseña en este momento.';
      }
    } finally {
      this.isChangingPassword = false;
      this.cdr.markForCheck();
    }
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut) {
      return;
    }
    this.isLoggingOut = true;
    this.cdr.markForCheck();

    try {
      this.quizSession.resetQuiz();
      localStorage.removeItem('quizly_skip_login');
      await firstValueFrom(this.authService.logout());
    } finally {
      this.isLoggingOut = false;
      this.cdr.markForCheck();
      await this.router.navigate(['/home'], { replaceUrl: true });
    }
  }
}
