import { Injectable, InjectionToken } from '@angular/core';
import {
  confirmResetPassword,
  confirmSignUp,
  fetchAuthSession,
  fetchUserAttributes,
  getCurrentUser,
  resendSignUpCode,
  resetPassword,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from 'aws-amplify/auth';
import { environment } from '../../../environments/environment';
import { AuthSession, AuthUser } from '../models/auth.models';

export interface CognitoRawError {
  name: string;
  message?: string;
}

export interface CognitoClientAdapter {
  getStoredSession(): Promise<AuthSession | null>;
  signUp(email: string, password: string): Promise<void>;
  confirmSignUp(email: string, code: string): Promise<void>;
  resendConfirmationCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<AuthSession>;
  signOut(): Promise<void>;
  refreshSession(): Promise<AuthSession>;
  forgotPassword(email: string): Promise<void>;
  confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<void>;
  changePassword(oldPassword: string, newPassword: string): Promise<void>;
}

export const COGNITO_CLIENT_ADAPTER = new InjectionToken<CognitoClientAdapter>(
  'COGNITO_CLIENT_ADAPTER'
);

interface LocalPoolUserRecord {
  userId: string;
  email: string;
  passwordHash: string;
  confirmed: boolean;
  confirmationCode: string;
  resetCode?: string;
}

/**
 * Adaptador para Amazon Cognito User Pool.
 * - Cuando `environment.cognito.useLocalDevPool` es false, usa AWS Amplify Auth
 *   contra el User Pool configurado en `environment.cognito`.
 * - Cuando `useLocalDevPool` es true, provee un User Pool en memoria para pruebas
 *   offline (p. ej. demo@quizly.app / Quizly#2026).
 */
@Injectable({
  providedIn: 'root',
})
export class AwsCognitoClientAdapter implements CognitoClientAdapter {
  private activeSession: AuthSession | null = null;
  private refreshTokenInMemory: string | null = null;
  private readonly localUsers = new Map<string, LocalPoolUserRecord>();

  constructor() {
    const demoEmail = 'demo@quizly.app';
    this.localUsers.set(demoEmail, {
      userId: 'usr_demo_quizly_01',
      email: demoEmail,
      passwordHash: this.hashSecret('Quizly#2026'),
      confirmed: true,
      confirmationCode: '123456',
    });
  }

  private get useLocal(): boolean {
    return Boolean(environment.cognito.useLocalDevPool);
  }

  async getStoredSession(): Promise<AuthSession | null> {
    if (this.useLocal) {
      if (
        this.activeSession &&
        this.activeSession.isAuthenticated &&
        (!this.activeSession.expiresAt ||
          this.activeSession.expiresAt > Date.now())
      ) {
        return { ...this.activeSession };
      }
      return null;
    }

    try {
      return await this.buildAmplifySession();
    } catch {
      return null;
    }
  }

  /**
   * Registra un nuevo usuario en AWS Cognito o en el pool local de desarrollo.
   *
   * @param email Dirección de correo electrónico del usuario.
   * @param password Contraseña elegida.
   * @throws Error de Cognito si el usuario ya existe o si las credenciales no satisfacen las políticas.
   */
  async signUp(email: string, password: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!this.useLocal) {
      try {
        await signUp({
          username: normalizedEmail,
          password,
          options: {
            userAttributes: { email: normalizedEmail },
          },
        });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    if (this.localUsers.has(normalizedEmail)) {
      throw this.createCognitoError(
        'UsernameExistsException',
        'An account with the given email already exists.'
      );
    }

    this.localUsers.set(normalizedEmail, {
      userId: `usr_${Math.random().toString(36).slice(2, 10)}`,
      email: normalizedEmail,
      passwordHash: this.hashSecret(password),
      confirmed: false,
      confirmationCode: '123456',
    });
  }

  /**
   * Confirma el registro del usuario mediante el código de verificación recibido.
   *
   * En modo local (`useLocalDevPool: true`), el código por defecto aceptado es `'123456'`.
   *
   * @param email Email del usuario registrado.
   * @param code Código de 6 dígitos ingresado por el usuario.
   */
  async confirmSignUp(email: string, code: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!this.useLocal) {
      try {
        await confirmSignUp({
          username: normalizedEmail,
          confirmationCode: cleanCode,
        });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    if (cleanCode === '000000') {
      throw this.createCognitoError(
        'ExpiredCodeException',
        'Invalid code provided, please request a code again.'
      );
    }

    const record = this.localUsers.get(normalizedEmail);
    if (
      !record ||
      (cleanCode !== record.confirmationCode && cleanCode !== '123456')
    ) {
      throw this.createCognitoError(
        'CodeMismatchException',
        'Invalid verification code provided, please try again.'
      );
    }

    record.confirmed = true;
  }

  async resendConfirmationCode(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!this.useLocal) {
      try {
        await resendSignUpCode({ username: normalizedEmail });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    const record = this.localUsers.get(normalizedEmail);
    if (record) {
      record.confirmationCode = '123456';
    }
  }

  /**
   * Autentica al usuario en AWS Cognito (mediante SRP) o en el pool local determinístico.
   *
   * @param email Email del usuario.
   * @param password Contraseña en texto plano.
   * @returns Sesión con tokens de acceso y perfil del usuario.
   * @throws Error tipado de Cognito si las credenciales son erróneas o la cuenta no fue confirmada.
   */
  async signIn(email: string, password: string): Promise<AuthSession> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!this.useLocal) {
      try {
        // Si ya hay sesión Amplify (p. ej. refresh incompleto), la cerramos antes.
        try {
          await getCurrentUser();
          await signOut();
        } catch {
          // No había sesión previa
        }

        const result = await signIn({
          username: normalizedEmail,
          password,
        });
        if (!result.isSignedIn) {
          const step = result.nextStep?.signInStep;
          if (step === 'CONFIRM_SIGN_UP') {
            throw this.createCognitoError(
              'UserNotConfirmedException',
              'User is not confirmed.'
            );
          }
          throw this.createCognitoError(
            'NotAuthorizedException',
            'Additional authentication steps are required.'
          );
        }
        return await this.buildAmplifySession();
      } catch (err) {
        throw this.toCognitoError(err);
      }
    }

    const record = this.localUsers.get(normalizedEmail);
    if (!record) {
      throw this.createCognitoError(
        'UserNotFoundException',
        'User does not exist.'
      );
    }
    if (record.passwordHash !== this.hashSecret(password)) {
      throw this.createCognitoError(
        'NotAuthorizedException',
        'Incorrect username or password.'
      );
    }
    if (!record.confirmed) {
      throw this.createCognitoError(
        'UserNotConfirmedException',
        'User is not confirmed.'
      );
    }

    const user: AuthUser = {
      userId: record.userId,
      username: record.email,
      email: record.email,
      emailVerified: true,
      attributes: {
        email: record.email,
        email_verified: 'true',
      },
    };

    const session: AuthSession = {
      isAuthenticated: true,
      user,
      accessToken: `eyJ_quizly_access_${record.userId}_${Date.now()}`,
      idToken: `eyJ_quizly_id_${record.userId}_${Date.now()}`,
      expiresAt: Date.now() + 3600 * 1000,
    };

    this.activeSession = session;
    this.refreshTokenInMemory = `rft_${record.userId}_${Date.now()}`;
    return { ...session };
  }

  async signOut(): Promise<void> {
    if (!this.useLocal) {
      try {
        await signOut();
      } catch {
        // Siempre limpiar sesión local aunque falle la red
      }
    }
    this.activeSession = null;
    this.refreshTokenInMemory = null;
  }

  /**
   * Renueva los tokens de sesión mediante el refresh token almacenado.
   *
   * @returns Nueva sesión con `accessToken` actualizado.
   * @throws Error de Cognito si el refresh token ha expirado o no existe.
   */
  async refreshSession(): Promise<AuthSession> {
    if (!this.useLocal) {
      try {
        const session = await this.buildAmplifySession(true);
        if (!session) {
          throw this.createCognitoError(
            'NotAuthorizedException',
            'Refresh token has expired or is missing.'
          );
        }
        return session;
      } catch (err) {
        throw this.toCognitoError(err);
      }
    }

    if (!this.activeSession?.user || !this.refreshTokenInMemory) {
      throw this.createCognitoError(
        'NotAuthorizedException',
        'Refresh token is missing or expired.'
      );
    }

    const refreshed: AuthSession = {
      ...this.activeSession,
      isAuthenticated: true,
      accessToken: `eyJ_quizly_access_refreshed_${Date.now()}`,
      idToken: `eyJ_quizly_id_refreshed_${Date.now()}`,
      expiresAt: Date.now() + 3600 * 1000,
    };
    this.activeSession = refreshed;
    return { ...refreshed };
  }

  async forgotPassword(email: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    if (!this.useLocal) {
      try {
        await resetPassword({ username: normalizedEmail });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    const record = this.localUsers.get(normalizedEmail);
    if (record) {
      record.resetCode = '123456';
    }
  }

  async confirmForgotPassword(
    email: string,
    code: string,
    newPassword: string
  ): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();
    const cleanCode = code.trim();

    if (!this.useLocal) {
      try {
        await confirmResetPassword({
          username: normalizedEmail,
          confirmationCode: cleanCode,
          newPassword,
        });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    if (cleanCode === '000000') {
      throw this.createCognitoError(
        'ExpiredCodeException',
        'Reset code has expired.'
      );
    }

    const record = this.localUsers.get(normalizedEmail);
    if (
      !record ||
      (cleanCode !== (record.resetCode ?? '123456') && cleanCode !== '123456')
    ) {
      throw this.createCognitoError(
        'CodeMismatchException',
        'Invalid verification code provided.'
      );
    }

    record.passwordHash = this.hashSecret(newPassword);
    record.resetCode = undefined;
    record.confirmed = true;
  }

  async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!this.useLocal) {
      try {
        await updatePassword({
          oldPassword,
          newPassword,
        });
      } catch (err) {
        throw this.toCognitoError(err);
      }
      return;
    }

    if (!this.activeSession?.isAuthenticated || !this.activeSession.user) {
      throw this.createCognitoError(
        'NotAuthorizedException',
        'No authenticated user session.'
      );
    }

    const email = (
      this.activeSession.user.email || this.activeSession.user.username
    ).toLowerCase();
    const record = this.localUsers.get(email);
    if (!record || record.passwordHash !== this.hashSecret(oldPassword)) {
      throw this.createCognitoError(
        'NotAuthorizedException',
        'Incorrect current password.'
      );
    }

    record.passwordHash = this.hashSecret(newPassword);
  }

  private async buildAmplifySession(
    forceRefresh = false
  ): Promise<AuthSession> {
    const current = await getCurrentUser();
    const authSession = await fetchAuthSession({ forceRefresh });
    const accessToken = authSession.tokens?.accessToken?.toString();
    if (!accessToken) {
      throw this.createCognitoError(
        'NotAuthorizedException',
        'Missing authentication tokens.'
      );
    }

    let attributes: Record<string, string | undefined> = {};
    try {
      attributes = (await fetchUserAttributes()) as Record<
        string,
        string | undefined
      >;
    } catch {
      attributes = {};
    }

    const email =
      attributes['email'] || current.username || current.userId || '';
    const emailVerified =
      attributes['email_verified'] === 'true' ||
      attributes['email_verified'] === 'True';

    const user: AuthUser = {
      userId: current.userId,
      username: current.username || email,
      email,
      emailVerified,
      attributes: {
        ...attributes,
        email,
        email_verified: emailVerified ? 'true' : 'false',
      },
    };

    const expiresAtMs = authSession.tokens?.accessToken?.payload?.exp
      ? Number(authSession.tokens.accessToken.payload.exp) * 1000
      : Date.now() + 3600 * 1000;

    const session: AuthSession = {
      isAuthenticated: true,
      user,
      accessToken,
      idToken: authSession.tokens?.idToken?.toString(),
      expiresAt: expiresAtMs,
    };

    this.activeSession = session;
    return { ...session };
  }

  private toCognitoError(error: unknown): CognitoRawError {
    if (error && typeof error === 'object') {
      const record = error as { name?: unknown; message?: unknown };
      const name =
        typeof record.name === 'string' && record.name
          ? record.name
          : 'CognitoError';
      const message =
        typeof record.message === 'string' ? record.message : 'Cognito error';

      if (name === 'UserAlreadyAuthenticatedException') {
        return this.createCognitoError('NotAuthorizedException', message);
      }
      if (name === 'EmptySignInUsername' || name === 'EmptySignInPassword') {
        return this.createCognitoError('NotAuthorizedException', message);
      }
      if (name === 'NetworkError' || /network/i.test(message)) {
        return this.createCognitoError('NetworkError', message);
      }
      return this.createCognitoError(name, message);
    }
    return this.createCognitoError('CognitoError', 'Cognito error');
  }

  private createCognitoError(name: string, message: string): CognitoRawError {
    return { name, message };
  }

  private hashSecret(secret: string): string {
    let hash = 2166136261;
    for (let i = 0; i < secret.length; i++) {
      hash ^= secret.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `h_${(hash >>> 0).toString(16)}`;
  }
}
