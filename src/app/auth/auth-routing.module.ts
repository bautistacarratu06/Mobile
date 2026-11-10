import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { GuestGuard } from '../core/guards/guest.guard';
import { ConfirmEmailPage } from './pages/confirm-email/confirm-email.page';
import { ForgotPasswordPage } from './pages/forgot-password/forgot-password.page';
import { LoginPage } from './pages/login/login.page';
import { RegisterPage } from './pages/register/register.page';
import { ResetPasswordPage } from './pages/reset-password/reset-password.page';

const routes: Routes = [
  {
    path: 'login',
    component: LoginPage,
    canActivate: [GuestGuard],
  },
  {
    path: 'register',
    component: RegisterPage,
    canActivate: [GuestGuard],
  },
  {
    path: 'confirm-email',
    component: ConfirmEmailPage,
    canActivate: [GuestGuard],
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordPage,
    canActivate: [GuestGuard],
  },
  {
    path: 'reset-password',
    component: ResetPasswordPage,
    canActivate: [GuestGuard],
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class AuthRoutingModule {}
