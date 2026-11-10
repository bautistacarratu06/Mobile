export interface AuthUser {
  userId: string;
  username: string;
  email?: string;
  emailVerified?: boolean;
  attributes: Record<string, string | undefined>;
}

export interface AuthSession {
  isAuthenticated: boolean;
  user: AuthUser | null;
  accessToken?: string;
  idToken?: string;
  expiresAt?: number;
}

export interface AuthError {
  code: string;
  message: string;
  recoverable: boolean;
}

export class AuthDomainError extends Error implements AuthError {
  constructor(
    public readonly code: string,
    message: string,
    public readonly recoverable: boolean = true
  ) {
    super(message);
    this.name = 'AuthDomainError';
  }
}

/**
 * Valida la conformidad de una contraseña con la política de seguridad estándar de AWS Cognito.
 *
 * Restricciones exigidas:
 * - Longitud mínima de 8 caracteres.
 * - Al menos una letra mayúscula (`A-Z`).
 * - Al menos una letra minúscula (`a-z`).
 * - Al menos un dígito numérico (`0-9`).
 * - Al menos un carácter especial o símbolo no alfanumérico.
 *
 * @param password Contraseña en texto plano a evaluar.
 * @returns `true` si la contraseña satisface todos los requisitos; `false` en caso contrario.
 */
export function isValidCognitoPassword(password: string): boolean {
  if (!password || password.length < 8) {
    return false;
  }
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9\s]/.test(password);
  return hasUpper && hasLower && hasDigit && hasSymbol;
}

/**
 * Sanea y valida una URL de retorno posterior al inicio de sesión para prevenir vulnerabilidades de *Open Redirect*.
 *
 * Reglas de seguridad aplicadas:
 * - Debe comenzar estrictamente con `/`.
 * - Rechaza esquemas con doble barra inicial (`//`) o barra invertida (`/\`) que simulan rutas absolutas.
 * - Rechaza esquemas con protocolo (`http:`, `javascript:`, etc.).
 * - Rechaza saltos de línea y retornos de carro (`\r`, `\n`) para mitigar inyecciones de cabeceras HTTP.
 * - Rechaza bucles de redirección hacia el módulo `/auth`.
 *
 * @param rawUrl Cadena de URL obtenida de los query params (por ejemplo `returnUrl`).
 * @param fallback Ruta por defecto a utilizar si la URL provista es inválida o insegura (por defecto `'/home'`).
 * @returns Ruta interna segura y saneada.
 */
export function sanitizeInternalReturnUrl(
  rawUrl: string | null | undefined,
  fallback: string = '/home'
): string {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return fallback;
  }
  const trimmed = rawUrl.trim();
  if (
    !trimmed.startsWith('/') ||
    trimmed.startsWith('//') ||
    trimmed.startsWith('/\\') ||
    /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ||
    trimmed.includes('\r') ||
    trimmed.includes('\n')
  ) {
    return fallback;
  }
  if (trimmed.startsWith('/auth')) {
    return fallback;
  }
  return trimmed;
}
