import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { finalize } from 'rxjs';
import {
  AuthDomainError,
  isValidCognitoPassword,
  sanitizeInternalReturnUrl,
} from '../../../core/models/auth.models';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  standalone: false,
})
export class RegisterPage {
  readonly form: FormGroup;
  isSubmitting = false;
  showPassword = false;
  errorMessage: string | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly route: ActivatedRoute,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required]],
      confirmPassword: ['', [Validators.required]],
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.isSubmitting) {
      return;
    }

    const emailControl = this.form.get('email');
    const cleanEmail = String(emailControl?.value ?? '').trim().toLowerCase();
    emailControl?.setValue(cleanEmail);

    const password = String(this.form.get('password')?.value ?? '');
    const confirmPassword = String(
      this.form.get('confirmPassword')?.value ?? ''
    );

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Completá todos los campos con un email válido.';
      return;
    }

    if (!isValidCognitoPassword(password)) {
      this.errorMessage =
        'La contraseña debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y símbolo.';
      return;
    }

    if (password !== confirmPassword) {
      this.errorMessage = 'Las contraseñas ingresadas no coinciden.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = null;

    const returnUrl = sanitizeInternalReturnUrl(
      this.route.snapshot.queryParamMap.get('returnUrl'),
      '/home'
    );

    this.authService
      .register(cleanEmail, password)
      .pipe(
        finalize(() => {
          this.isSubmitting = false;
          this.form.get('password')?.reset('');
          this.form.get('confirmPassword')?.reset('');
        })
      )
      .subscribe({
        next: () => {
          void this.router.navigate(['/auth/confirm-email'], {
            queryParams: {
              email: cleanEmail,
              registered: '1',
              returnUrl,
            },
          });
        },
        error: (err: unknown) => {
          this.errorMessage =
            err instanceof AuthDomainError
              ? err.message
              : 'No se pudo completar el registro. Intentá nuevamente.';
        },
      });
  }
}
