import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  Subject,
  combineLatest,
  filter,
  takeUntil,
} from 'rxjs';
import { AuthStateService } from '../../core/services/auth-state.service';
import { HapticFeedbackService } from '../../core/services/haptic-feedback.service';
import { QuizAnswer, QuizQuestion } from '../../models/quiz.models';
import { QuizSessionService } from '../../services/quiz-session.service';

@Component({
  selector: 'app-quiz',
  templateUrl: './quiz.page.html',
  styleUrls: ['./quiz.page.scss'],
  standalone: false,
})
export class QuizPage implements OnInit, OnDestroy {
  @ViewChild('feedbackRegionRef') feedbackRegionRef?: ElementRef<HTMLElement>;

  private readonly destroy$ = new Subject<void>();

  currentQuestion: QuizQuestion | null = null;
  displayQuestion: QuizQuestion | null = null;
  currentIndex = 0;
  totalQuestions = 0;
  score = 0;
  selectedAnswerId: string | null = null;
  isAnswered = false;
  lastAnswerCorrect: boolean | null = null;

  constructor(
    private readonly quizSession: QuizSessionService,
    private readonly haptics: HapticFeedbackService,
    private readonly authState: AuthStateService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    if (!this.quizSession.hasActiveQuiz()) {
      void this.router.navigate(['/home'], { replaceUrl: true });
      return;
    }

    // Protect against session expiration mid-game (IFT-10 / IFT-12)
    combineLatest([this.authState.initialized$, this.authState.isAuthenticated$])
      .pipe(
        takeUntil(this.destroy$),
        filter(([initialized, isAuthenticated]) => initialized && !isAuthenticated)
      )
      .subscribe(() => {
        this.quizSession.resetQuiz();
        void this.router.navigate(['/auth/login'], {
          queryParams: { returnUrl: '/home' },
          replaceUrl: true,
        });
      });

    // Track session state
    this.quizSession.state$
      .pipe(takeUntil(this.destroy$))
      .subscribe((state) => {
        this.currentIndex = state.currentQuestionIndex;
        this.totalQuestions = state.questions.length;
        this.score = state.score;
        this.selectedAnswerId = state.selectedAnswerId ?? null;
        this.isAnswered = state.answerState !== 'unanswered';
        this.lastAnswerCorrect =
          state.answerState === 'unanswered'
            ? null
            : state.answerState === 'correct';
        this.currentQuestion =
          state.questions[state.currentQuestionIndex] ?? null;
        this.displayQuestion = this.currentQuestion;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get progressValue(): number {
    if (this.totalQuestions <= 0) {
      return 0;
    }
    return (this.currentIndex + 1) / this.totalQuestions;
  }

  get isLastQuestion(): boolean {
    return (
      this.totalQuestions > 0 && this.currentIndex >= this.totalQuestions - 1
    );
  }

  get feedbackText(): string {
    if (!this.isAnswered || !this.displayQuestion) {
      return '';
    }
    if (this.lastAnswerCorrect) {
      return '¡Respuesta correcta! Sumaste 1 punto.';
    }
    const correctOption = this.displayQuestion.answers.find((a) => a.isCorrect);
    return correctOption
      ? `Respuesta incorrecta. La respuesta correcta es: ${correctOption.text}.`
      : 'Respuesta incorrecta.';
  }

  difficultyLabel(difficulty: string): string {
    switch (difficulty) {
      case 'easy':
        return 'Fácil';
      case 'medium':
        return 'Media';
      case 'hard':
        return 'Difícil';
      default:
        return difficulty;
    }
  }

  selectAnswer(answerId: string): void {
    if (this.isAnswered) {
      return;
    }
    this.quizSession.selectAnswer(answerId);
    this.cdr.markForCheck();
  }

  submitAnswer(): void {
    if (this.isAnswered || !this.selectedAnswerId || !this.currentQuestion) {
      return;
    }
    const questionId = this.currentQuestion.id;
    const result = this.quizSession.submitCurrentAnswer();
    if (!result) {
      return;
    }

    void this.haptics.notifyAnswerResult(questionId, result.isCorrect);
    this.cdr.markForCheck();

    setTimeout(() => {
      this.feedbackRegionRef?.nativeElement?.focus();
    }, 0);
  }

  nextOrFinish(): void {
    if (!this.isAnswered) {
      return;
    }

    if (this.quizSession.isLastQuestion()) {
      this.quizSession.completeQuiz();
      this.cdr.markForCheck();
      void this.haptics.quizCompleted();
      void this.router.navigate(['/results'], { replaceUrl: true });
      return;
    }

    this.quizSession.goToNextQuestion();
    this.cdr.markForCheck();
  }

  abandonQuiz(): void {
    this.quizSession.resetQuiz();
    void this.router.navigate(['/home'], { replaceUrl: true });
  }

  trackByAnswerId(_index: number, option: QuizAnswer): string {
    return option.id;
  }

  getOptionStateClass(option: QuizAnswer): string {
    if (!this.isAnswered) {
      return this.selectedAnswerId === option.id ? 'answer-option--selected' : '';
    }
    if (option.isCorrect) {
      return 'answer-option--correct';
    }
    if (this.selectedAnswerId === option.id && !option.isCorrect) {
      return 'answer-option--incorrect';
    }
    return 'answer-option--locked';
  }
}
