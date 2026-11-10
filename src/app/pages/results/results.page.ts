import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { QuizSessionService } from '../../services/quiz-session.service';

@Component({
  selector: 'app-results',
  templateUrl: './results.page.html',
  styleUrls: ['./results.page.scss'],
  standalone: false,
})
export class ResultsPage implements OnInit {
  score = 0;
  totalQuestions = 0;
  percentage = 0;
  accuracyRatio = 0;
  hasValidResults = false;

  constructor(
    private readonly quizSession: QuizSessionService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.quizSession.hasCompletedQuiz()) {
      void this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    const state = this.quizSession.snapshot;
    this.score = state.score;
    this.totalQuestions = state.questions.length;
    this.accuracyRatio =
      this.totalQuestions > 0 ? this.score / this.totalQuestions : 0;
    this.percentage = Math.round(this.accuracyRatio * 100);
    this.hasValidResults = true;
    this.cdr.markForCheck();
  }

  get performanceTitle(): string {
    if (this.percentage >= 80) {
      return '¡Excelente!';
    }
    if (this.percentage >= 50) {
      return '¡Muy buen trabajo!';
    }
    return '¡Sigue practicando!';
  }

  get performanceSubtitle(): string {
    if (this.percentage >= 80) {
      return 'Dominás estos temas con gran precisión.';
    }
    if (this.percentage >= 50) {
      return 'Superaste la mitad de las preguntas. ¡Vas por muy buen camino!';
    }
    return 'Cada partida te ayuda a descubrir nuevos datos y mejorar tu marca.';
  }

  playAgain(): void {
    this.quizSession.resetQuiz();
    void this.router.navigate(['/home'], { replaceUrl: true });
  }

  goHome(): void {
    this.quizSession.resetQuiz();
    void this.router.navigate(['/home'], { replaceUrl: true });
  }
}
