import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AuthDomainError,
  isValidCognitoPassword,
} from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: false,
})
export class ResetPasswordPage implements OnInit {
  readonly form: FormGroup;
  isSubmitting = false;
  errorMessage: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      code: ['', [Validators.required]],
      newPassword: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    const email = this.route.snapshot.queryParamMap.get('email');
    if (email) {
      this.form.patchValue({ email });
    }
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const email = String(this.form.get('email')?.value ?? '').trim().toLowerCase();
    const code = String(this.form.get('code')?.value ?? '').trim();
    const newPassword = String(this.form.get('newPassword')?.value ?? '');
    const confirmPassword = String(this.form.get('confirmPassword')?.value ?? '');

    if (this.form.invalid || !email || !code) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Completá el email, el código y la nueva contraseña.';
      return;
    }

    if (!isValidCognitoPassword(newPassword)) {
      this.errorMessage =
        'La nueva contraseña debe tener al menos 8 caracteres, mayúscula, minúscula, número y símbolo.';
      return;
    }

    if (newPassword !== confirmPassword) {
      this.errorMessage = 'Las contraseñas no coinciden.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    this.authService
      .resetPassword(email, code, newPassword)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.form.reset();
        })
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/auth/login'], {
            queryParams: { reset: '1' },
          });
        },
        error: (err: unknown) => {
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'No se pudo actualizar la contraseña.';
        },
      });
  }
}
