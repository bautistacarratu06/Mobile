import { Component, OnDestroy, OnInit, Optional } from '@angular/core';
import { Router } from '@angular/router';
import { App } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';
import { AuthService } from './core/services/auth.service';
import { QuizSessionService } from './services/quiz-session.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnInit, OnDestroy {
  private backButtonHandle?: PluginListenerHandle;

  constructor(
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly quizSession?: QuizSessionService,
    @Optional() private readonly router?: Router
  ) {}

  ngOnInit(): void {
    this.authService?.initializeSession().subscribe();
    void this.registerHardwareBackButton();
  }

  ngOnDestroy(): void {
    void this.backButtonHandle?.remove();
  }

  /**
   * Maneja el botón físico "Atrás" en Android (IFT-13) para que salir de /quiz
   * limpie la sesión activa de forma controlada y no deje estado inconsistente.
   */
  handleHardwareBack(currentUrl: string): void {
    if (!this.router) {
      return;
    }
    if (currentUrl.startsWith('/quiz')) {
      this.quizSession?.resetQuiz();
      void this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }
    if (currentUrl.startsWith('/results') || currentUrl.startsWith('/profile')) {
      void this.router.navigate(['/home'], { replaceUrl: true });
    }
  }

  private async registerHardwareBackButton(): Promise<void> {
    try {
      this.backButtonHandle = await App.addListener('backButton', () => {
        const currentUrl = this.router?.url ?? '/home';
        this.handleHardwareBack(currentUrl);
      });
    } catch {
      // Ignorar en entornos web donde el listener nativo no aplique
    }
  }
}
