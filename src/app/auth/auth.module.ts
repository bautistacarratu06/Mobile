import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared.module';
import { AuthRoutingModule } from './auth-routing.module';
import { ConfirmEmailPage } from './pages/confirm-email/confirm-email.page';
import { ForgotPasswordPage } from './pages/forgot-password/forgot-password.page';
import { LoginPage } from './pages/login/login.page';
import { RegisterPage } from './pages/register/register.page';
import { ResetPasswordPage } from './pages/reset-password/reset-password.page';

@NgModule({
  declarations: [
    LoginPage,
    RegisterPage,
    ConfirmEmailPage,
    ForgotPasswordPage,
    ResetPasswordPage,
  ],
  imports: [SharedModule, AuthRoutingModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AuthModule {}
