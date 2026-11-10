import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { OPENTDB_CATEGORIES } from '../config/opentdb-categories';
import { AuthStateService } from '../core/services/auth-state.service';
import {
  OpenTdbCategoryOption,
  QuizDifficulty,
  QuizDomainError,
  QuizQuestionType,
  QuizSettings,
} from '../models/quiz.models';
import { OpenTdbService } from '../services/opentdb.service';
import { QuizSessionService } from '../services/quiz-session.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage {
  @ViewChild('errorBannerRef') errorBannerRef?: ElementRef<HTMLElement>;

  readonly categories: readonly OpenTdbCategoryOption[] = OPENTDB_CATEGORIES;
  readonly isAuthenticated$ = this.authState.isAuthenticated$;
  readonly currentUser$ = this.authState.currentUser$;
  readonly configWarning$ = this.authState.configWarning$;

  amount = 10;
  selectedCategory: number | 'all' = 'all';
  selectedDifficulty: QuizDifficulty | 'any' = 'any';
  selectedType: QuizQuestionType | 'any' = 'any';

  isLoading = false;
  errorMessage: string | null = null;
  errorCode: string | null = null;

  constructor(
    private readonly openTdbService: OpenTdbService,
    private readonly quizSession: QuizSessionService,
    private readonly authState: AuthStateService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {}

  onAmountInput(rawValue: string | number | null | undefined): void {
    this.amount = Number(rawValue);
  }

  isAmountValid(): boolean {
    return (
      Number.isInteger(Number(this.amount)) &&
      Number(this.amount) >= 1 &&
      Number(this.amount) <= 50
    );
  }

  startQuiz(): void {
    if (this.isLoading) {
      return;
    }

    const parsedAmount = Number(this.amount);
    if (
      !Number.isInteger(parsedAmount) ||
      parsedAmount < 1 ||
      parsedAmount > 50
    ) {
      this.errorCode = 'INVALID_PARAMS';
      this.errorMessage =
        'Elegí una cantidad válida de preguntas entre 1 y 50 para comenzar.';
      this.focusErrorBanner();
      return;
    }

    const settings: QuizSettings = {
      amount: parsedAmount,
      category:
        this.selectedCategory !== 'all'
          ? Number(this.selectedCategory)
          : undefined,
      difficulty:
        this.selectedDifficulty !== 'any' ? this.selectedDifficulty : undefined,
      type: this.selectedType !== 'any' ? this.selectedType : undefined,
    };

    this.isLoading = true;
    this.errorMessage = null;
    this.errorCode = null;
    this.cdr.markForCheck();

    this.openTdbService
      .getQuestions(settings)
      .pipe(
        finalize(() => {
          this.isLoading = false;
          this.cdr.markForCheck();
        })
      )
      .subscribe({
        next: (questions) => {
          this.quizSession.startQuiz(questions, settings);
          void this.router.navigate(['/quiz']);
        },
        error: (err: unknown) => {
          if (err instanceof QuizDomainError) {
            this.errorCode = err.code;
            this.errorMessage = err.message;
          } else {
            this.errorCode = 'NETWORK_ERROR';
            this.errorMessage =
              'No se pudieron cargar las preguntas en este momento. Verificá tu conexión e intentá nuevamente.';
          }
          this.cdr.markForCheck();
          this.focusErrorBanner();
        },
      });
  }

  resetFilters(): void {
    this.amount = 10;
    this.selectedCategory = 'all';
    this.selectedDifficulty = 'any';
    this.selectedType = 'any';
    this.errorMessage = null;
    this.errorCode = null;
  }

  private focusErrorBanner(): void {
    setTimeout(() => {
      this.errorBannerRef?.nativeElement?.focus();
    }, 0);
  }
}
