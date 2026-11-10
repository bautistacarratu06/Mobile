import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthDomainError } from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
})
export class ForgotPasswordPage {
  readonly form: FormGroup;
  isSubmitting = false;
  errorMessage: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const email = String(this.form.get('email')?.value ?? '').trim().toLowerCase();
    this.form.get('email')?.setValue(email);

    if (this.form.invalid || !email) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Ingresá un correo electrónico válido.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    this.authService
      .forgotPassword(email)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.form.reset();
        })
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/auth/reset-password'], {
            queryParams: { email },
          });
        },
        error: (err: unknown) => {
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'No se pudo procesar la solicitud. Intentá nuevamente.';
        },
      });
  }
}
