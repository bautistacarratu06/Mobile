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
  selector: 'app-confirm-email',
  templateUrl: './confirm-email.page.html',
  styleUrls: ['./confirm-email.page.scss'],
  standalone: false,
})
export class ConfirmEmailPage implements OnInit {
  readonly form: FormGroup;
  isSubmitting = false;
  isResending = false;
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
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
    });
  }

  ngOnInit(): void {
    const queryEmail =
      this.route.snapshot.queryParamMap.get('email') ||
      this.authService.getPendingUnconfirmedEmail() ||
      '';
    if (queryEmail) {
      this.form.patchValue({ email: queryEmail });
    }
    this.returnUrl = sanitizeInternalReturnUrl(
      this.route.snapshot.queryParamMap.get('returnUrl'),
      '/home'
    );
    if (this.route.snapshot.queryParamMap.get('registered') === '1') {
      this.infoMessage =
        'Te enviamos un código de verificación por correo electrónico (en modo desarrollo local podés usar 123456).';
    }
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const email = String(this.form.get('email')?.value ?? '').trim();
    const code = String(this.form.get('code')?.value ?? '').trim();

    if (this.form.invalid || !email || !code) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Ingresá tu email y el código de confirmación.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;
    this.infoMessage = null;

    this.authService
      .confirmEmail(email, code)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.form.get('code')?.reset('');
        })
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/auth/login'], {
            queryParams: {
              confirmed: '1',
              returnUrl: this.returnUrl,
            },
          });
        },
        error: (err: unknown) => {
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'No se pudo verificar el código. Intentá nuevamente.';
        },
      });
  }

  onResendCode(): void {
    if (this.isResending) {
      return;
    }

    const email = String(this.form.get('email')?.value ?? '').trim();
    if (!email) {
      this.errorMessage = 'Ingresá tu email para reenviar el código.';
      return;
    }

    this.isResending = true;
    this.errorMessage = null;

    this.authService
      .resendConfirmationCode(email)
      .pipe(
        finalize(() => {
          this.isResending = false;
        })
      )
      .subscribe({
        next: () => {
          this.infoMessage =
            'Se envió un nuevo código de confirmación a tu correo.';
        },
        error: (err: unknown) => {
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'No se pudo reenviar el código en este momento.';
        },
      });
  }
}
