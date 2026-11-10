import { Inject, Injectable, InjectionToken, Optional } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { BehaviorSubject, Observable } from 'rxjs';

export interface HapticSettings {
  enabled: boolean;
}

export interface HapticsDriver {
  impact(options: { style: ImpactStyle }): Promise<void>;
  notification(options: { type: NotificationType }): Promise<void>;
  selectionStart(): Promise<void>;
  isSupported(): boolean;
}

export const HAPTICS_DRIVER = new InjectionToken<HapticsDriver>('HAPTICS_DRIVER');

const HAPTIC_STORAGE_KEY = 'quizly.pref.haptics.v1';

@Injectable({
  providedIn: 'root',
})
export class CapacitorHapticsDriver implements HapticsDriver {
  isSupported(): boolean {
    try {
      if (Capacitor.isNativePlatform()) {
        return Capacitor.isPluginAvailable('Haptics');
      }
      return (
        typeof navigator !== 'undefined' &&
        typeof navigator.vibrate === 'function'
      );
    } catch {
      return false;
    }
  }

  async impact(options: { style: ImpactStyle }): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact(options);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const duration = options.style === ImpactStyle.Medium ? 45 : 20;
      navigator.vibrate(duration);
    }
  }

  async notification(options: { type: NotificationType }): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Haptics.notification(options);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(options.type === NotificationType.Success ? 35 : 50);
    }
  }

  async selectionStart(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      await Haptics.selectionStart();
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class HapticFeedbackService {
  private readonly driver: HapticsDriver;
  private readonly enabledSubject: BehaviorSubject<boolean>;
  private readonly triggeredQuestionIds = new Set<string>();

  readonly enabled$: Observable<boolean>;

  constructor(
    private readonly defaultDriver: CapacitorHapticsDriver,
    @Optional() @Inject(HAPTICS_DRIVER) customDriver?: HapticsDriver
  ) {
    this.driver = customDriver ?? this.defaultDriver;
    const initialEnabled = this.readInitialPreference();
    this.enabledSubject = new BehaviorSubject<boolean>(initialEnabled);
    this.enabled$ = this.enabledSubject.asObservable();
  }

  isAvailable(): boolean {
    try {
      return this.driver.isSupported();
    } catch {
      return false;
    }
  }

  getEnabled(): boolean {
    return this.enabledSubject.value;
  }

  setEnabled(enabled: boolean): void {
    const normalized = Boolean(enabled);
    this.enabledSubject.next(normalized);
    this.persistPreference(normalized);
  }

  /**
   * Ejecuta una vibración de intensidad media ante una respuesta errónea.
   *
   * Silencia cualquier excepción del plugin de hardware para evitar interrumpir la partida.
   */
  async error(): Promise<void> {
    if (!this.canTrigger()) {
      return;
    }
    try {
      await this.driver.impact({ style: ImpactStyle.Medium });
    } catch {
      // Silenciar fallo del plugin para no interrumpir la partida (IFT-14)
    }
  }

  /**
   * Ejecuta una vibración suave y sutil ante una respuesta acertada.
   */
  async success(): Promise<void> {
    if (!this.canTrigger()) {
      return;
    }
    try {
      await this.driver.impact({ style: ImpactStyle.Light });
    } catch {
      // Silenciar fallo del plugin
    }
  }

  /**
   * Feedback de selección puntual (opcional).
   */
  async selection(): Promise<void> {
    if (!this.canTrigger()) {
      return;
    }
    try {
      await this.driver.selectionStart();
    } catch {
      // Silenciar fallo del plugin
    }
  }

  /**
   * Emite una notificación háptica de éxito al completar el último ítem de la trivia.
   */
  async quizCompleted(): Promise<void> {
    if (!this.canTrigger()) {
      return;
    }
    try {
      await this.driver.notification({ type: NotificationType.Success });
    } catch {
      // Silenciar fallo del plugin
    }
  }

  /**
   * Dispara el feedback háptico adecuado una única vez por pregunta al confirmarse la respuesta.
   *
   * Registra el `questionId` en un conjunto en memoria para prevenir vibraciones duplicadas por doble toque o re-render.
   *
   * @param questionId Identificador único de la pregunta evaluada.
   * @param isCorrect `true` si la respuesta fue correcta (impacto suave); `false` si fue incorrecta (impacto medio).
   */
  async notifyAnswerResult(
    questionId: string,
    isCorrect: boolean
  ): Promise<void> {
    if (!questionId || this.triggeredQuestionIds.has(questionId)) {
      return;
    }
    this.triggeredQuestionIds.add(questionId);
    if (isCorrect) {
      await this.success();
    } else {
      await this.error();
    }
  }

  /**
   * Limpia el registro de preguntas vibradas al iniciar o cerrar una partida.
   */
  resetSessionTracking(): void {
    this.triggeredQuestionIds.clear();
  }

  /**
   * Evalúa si es seguro y oportuno disparar una vibración háptica.
   *
   * Verifica que la opción esté habilitada por el usuario, que el hardware lo soporte
   * y que el sistema operativo no tenga activa la preferencia de accesibilidad `prefers-reduced-motion`.
   */
  private canTrigger(): boolean {
    if (!this.getEnabled()) {
      return false;
    }
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return false;
    }
    return this.isAvailable();
  }

  /**
   * Recupera la preferencia de vibración almacenada en `localStorage`.
   *
   * Cuenta con manejo de excepciones y degradación segura al valor por defecto (`true`)
   * si el JSON almacenado está dañado o el acceso al almacenamiento está restringido.
   */
  private readInitialPreference(): boolean {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(HAPTIC_STORAGE_KEY);
        if (raw !== null) {
          const parsed = JSON.parse(raw) as Partial<HapticSettings>;
          if (typeof parsed?.enabled === 'boolean') {
            return parsed.enabled;
          }
        }
      }
    } catch {
      // En caso de JSON corrupto o almacenamiento bloqueado, usar valor por defecto
    }
    return true;
  }

  private persistPreference(enabled: boolean): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const payload: HapticSettings = { enabled };
        window.localStorage.setItem(HAPTIC_STORAGE_KEY, JSON.stringify(payload));
      }
    } catch {
      // Ignorar si almacenamiento local no está disponible
    }
  }
}
