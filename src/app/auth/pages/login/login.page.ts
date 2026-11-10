import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AuthDomainError,
  sanitizeInternalReturnUrl,
} from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  readonly form: FormGroup;
  isSubmitting = false;
  showPassword = false;
  errorMessage: string | null = null;
  infoMessage: string | null = null;
  returnUrl = '/home';

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    const rawReturnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.returnUrl = sanitizeInternalReturnUrl(rawReturnUrl, '/home');

    if (this.route.snapshot.queryParamMap.get('confirmed') === '1') {
      this.infoMessage =
        'Email confirmado correctamente. Ya podés iniciar sesión.';
    } else if (this.route.snapshot.queryParamMap.get('reset') === '1') {
      this.infoMessage =
        'Contraseña actualizada correctamente. Iniciá sesión con tu nueva clave.';
    }
  }

  skipLogin(): void {
    this.authService.enterGuestMode();
    void this.router.navigateByUrl(this.returnUrl || '/home', { replaceUrl: true });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const emailControl = this.form.get('email');
    const rawEmail = String(emailControl?.value ?? '').trim();
    emailControl?.setValue(rawEmail);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Ingresá un email válido y tu contraseña.';
      return;
    }

    const password = String(this.form.get('password')?.value ?? '');
    this.isSubmitting = true;
    this.errorMessage = null;
    this.infoMessage = null;

    this.authService
      .login(rawEmail, password)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.form.get('password')?.reset('');
        })
      )
      .subscribe({
        next: () => {
          const target = sanitizeInternalReturnUrl(this.returnUrl, '/home');
          void this.router.navigateByUrl(target, { replaceUrl: true });
        },
        error: (err: unknown) => {
          if (
            err instanceof AuthDomainError &&
            err.code === 'UserNotConfirmedException'
          ) {
            void this.router.navigate(['/auth/confirm-email'], {
              queryParams: {
                email: rawEmail,
                returnUrl: this.returnUrl,
              },
            });
            return;
          }
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'El email o la contraseña son incorrectos.';
        },
      });
  }
}
