# Quizly — Aplicación Móvil de Trivia Interactiva (Ionic + Angular + Capacitor + AWS Cognito)

**Quizly** es una aplicación híbrida desarrollada con **Ionic + Angular (NgModules)** y **Capacitor**, diseñada para consumir preguntas reales en tiempo real desde **Open Trivia Database (OpenTDB)**, traducirlas automáticamente al español con caché y fallback seguro, ofrecer feedback háptico configurable en dispositivos compatibles y gestionar autenticación e identidad mediante **Amazon Cognito** (`aws-amplify/auth`).

---

## Características principales

1. **Esqueleto Ionic accesible y responsivo (`IFT-1`)**:
   - Arquitectura modular tradicional con `NgModules` (`standalone: false`) y TypeScript `strict: true`.
   - Navegación con rutas `/home`, `/auth/*`, `/quiz`, `/results`, `/profile` y redirección comodín `** -> /home`.
   - Paleta semántica con contraste WCAG AA y objetivos táctiles mínimos de `44x44px`.
2. **Integración real con Open Trivia Database (`IFT-2`, `IFT-4`)**:
   - Construcción segura de parámetros (`amount` 1..50, `category`, `difficulty`, `type`, `encode=url3986`).
   - Decodificación de entidades HTML y porcentaje URL, sanitización de etiquetas ejecutables y mezcla imparcial **Fisher-Yates** conservando `correctAnswerId`.
   - Manejo explícito de códigos de respuesta OpenTDB (`0..5`), timeouts y errores de red con acciones de recuperación.
3. **Autenticación completa con Amazon Cognito (`IFT-3`, `IFT-5`, `IFT-6`, `IFT-8`, `IFT-10`, `IFT-12`)**:
   - Restauración de sesión al iniciar (`initializeSession`), registro con validación de política de contraseñas de Cognito, confirmación por código de 6 dígitos con cooldown de reenvío, inicio de sesión, recuperación y cambio de contraseña.
   - `AuthGuard` y `GuestGuard` basados en `UrlTree` con validación estricta de `returnUrl` interno para impedir *open redirects*.
   - `AuthInterceptor` que adjunta el token Bearer **exclusivamente** a orígenes propios (`environment.protectedApiOrigins`) y **jamás** a OpenTDB ni a proveedores externos de traducción, con reintento único ante `401`.
4. **Juego interactivo, traducción al español y feedback háptico (`IFT-7`, `IFT-9`, `IFT-11`, `IFT-14`)**:
   - Progreso en vivo (`Pregunta X de Y`), selección única, confirmación explícita y evaluación inmutable por `correctAnswerId` (nunca comparando cadenas traducidas).
   - Traducción automática al español compatible con **LibreTranslate** + caché en memoria (`TranslationCacheService`) + fallback transparente al inglés original si el servicio externo falla o expira.
   - Feedback háptico con `@capacitor/haptics` (`ImpactStyle.Medium` al fallar, `ImpactStyle.Light` al acertar, `NotificationType.Success` al completar), garantizando una única vibración por pregunta y opción persistente para encenderlo/apagarlo en `/profile`.

---

## Ejecución en navegador (Desarrollo)

```bash
npm install
npm start
```

La aplicación estará disponible en `http://localhost:4200`.

### Modo de desarrollo local sin credenciales AWS

Por defecto, `src/environments/environment.ts` incluye `useLocalDevPool: true` dentro del bloque `cognito`. Esto permite probar **todo el flujo de registro, confirmación de email (aceptando cualquier código de 6 dígitos como `123456`), login, recuperación de contraseña, cambio de contraseña y cierre de sesión** de manera local sin necesidad de aprovisionar un User Pool en AWS.

Para conectar contra un User Pool real de **Amazon Cognito**:
1. Editar `src/environments/environment.ts` (o `environment.staging.ts` / `environment.prod.ts`).
2. Configurar `region`, `userPoolId`, `userPoolClientId` (App Client público sin client secret) y cambiar `useLocalDevPool: false`.

---

## Pruebas automatizadas y Linter

```bash
# Ejecutar toda la suite de pruebas unitarias (Vitest)
npm test -- --watch=false

# Ejecutar linter (ESLint)
npm run lint

# Compilar bundle de producción
npm run build
```

---

## Compilación e instalación móvil con Capacitor (`IFT-13`)

La configuración de Capacitor se encuentra en `capacitor.config.ts` (`appId: 'com.ifts11.quizly'`, `appName: 'Quizly'`, `webDir: 'www'`).

```bash
# 1. Generar el build web de producción en www/
npm run build

# 2. Agregar la plataforma nativa deseada (primera vez)
npx cap add android
# o en macOS: npx cap add ios

# 3. Sincronizar assets web y plugins nativos (@capacitor/haptics, @capacitor/app, etc.)
npx cap sync

# 4. Abrir en Android Studio o Xcode para ejecutar en emulador o dispositivo físico
npx cap open android
```

---

## Limitaciones conocidas de OpenTDB y Traducción (`IFT-2`, `IFT-11`, `IFT-13`)

1. **Idioma de origen (OpenTDB)**: La API pública de Open Trivia Database entrega su banco de preguntas originalmente en inglés. Quizly incorpora una capa desacoplada (`TranslationService` + `LibreTranslateProvider`) que traduce enunciados y opciones al español y permite alternar en cualquier momento entre **Español (`ES`)** e **Inglés original (`EN`)**.
2. **Disponibilidad de combinaciones de filtros (`response_code = 1`)**: Algunas combinaciones muy específicas de categoría + dificultad + tipo no cuentan con 50 preguntas en OpenTDB. Cuando OpenTDB responde con `response_code = 1`, Quizly informa la situación en un banner accesible y ofrece el botón **"Restablecer filtros recomendados"**.
3. **Límite de tasa (`response_code = 5`)**: OpenTDB limita las solicitudes por IP a aproximadamente 1 petición cada 5 segundos. Quizly evita disparos duplicados deshabilitando el botón de inicio durante la carga y deduplicando solicitudes en vuelo (`shareReplay`).
