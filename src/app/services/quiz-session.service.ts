import { Injectable, Optional } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HapticFeedbackService } from '../core/services/haptic-feedback.service';
import { AuthService } from '../core/services/auth.service';
import { FirestoreHistoryService } from '../core/services/firestore-history.service';
import {
  QuizQuestion,
  QuizSettings,
  QuizState,
} from '../models/quiz.models';

export interface SubmitAnswerOutcome {
  evaluated: boolean;
  isCorrect: boolean;
  correctAnswerId: string;
  selectedAnswerId: string;
  questionId: string;
}

const INITIAL_QUIZ_STATE: QuizState = {
  questions: [],
  currentQuestionIndex: 0,
  selectedAnswerId: undefined,
  answerState: 'unanswered',
  score: 0,
  answeredQuestions: 0,
  startedAt: undefined,
  completedAt: undefined,
  lastSettings: undefined,
};

@Injectable({
  providedIn: 'root',
})
export class QuizSessionService {
  private readonly stateSubject = new BehaviorSubject<QuizState>({
    ...INITIAL_QUIZ_STATE,
  });

  readonly state$: Observable<QuizState> = this.stateSubject.asObservable();

  constructor(
    @Optional() private readonly authService?: AuthService,
    @Optional() private readonly hapticService?: HapticFeedbackService,
    @Optional() private readonly firestoreHistory?: FirestoreHistoryService
  ) {
    this.authService?.registerLogoutCleanup(() => {
      this.resetQuiz();
    });
  }

  get snapshot(): QuizState {
    return this.stateSubject.value;
  }

  /**
   * Inicializa una nueva sesión de trivia con la lista de preguntas provista y los ajustes elegidos.
   *
   * Realiza una copia profunda de las preguntas para garantizar inmutabilidad, restablece el puntaje,
   * registra la marca temporal de inicio (`startedAt`) y reinicia el rastreador de feedback háptico.
   *
   * @param questions Arreglo de preguntas a responder en la sesión.
   * @param settings Opciones de configuración utilizadas para obtener las preguntas (cantidad, categoría, dificultad).
   */
  startQuiz(questions: QuizQuestion[], settings?: QuizSettings): void {
    this.hapticService?.resetSessionTracking();
    if (!Array.isArray(questions) || questions.length === 0) {
      this.resetQuiz();
      return;
    }

    this.stateSubject.next({
      questions: questions.map((q) => ({
        ...q,
        answers: q.answers.map((a) => ({ ...a })),
      })),
      currentQuestionIndex: 0,
      selectedAnswerId: undefined,
      answerState: 'unanswered',
      score: 0,
      answeredQuestions: 0,
      startedAt: Date.now(),
      completedAt: undefined,
      lastSettings: settings ? { ...settings } : undefined,
    });
  }

  getCurrentQuestion(): QuizQuestion | null {
    const state = this.stateSubject.value;
    if (
      !state.questions.length ||
      state.currentQuestionIndex < 0 ||
      state.currentQuestionIndex >= state.questions.length
    ) {
      return null;
    }
    return state.questions[state.currentQuestionIndex];
  }

  /**
   * Registra la opción elegida por el usuario para la pregunta actual antes de confirmarla.
   *
   * Bloquea la selección si la pregunta ya fue evaluada o si la partida se encuentra finalizada.
   *
   * @param answerId Identificador único de la opción seleccionada.
   */
  selectAnswer(answerId: string): void {
    const state = this.stateSubject.value;
    if (state.answerState !== 'unanswered' || state.completedAt !== undefined) {
      return;
    }
    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      return;
    }
    const exists = currentQuestion.answers.some((a) => a.id === answerId);
    if (!exists) {
      return;
    }

    this.stateSubject.next({
      ...state,
      selectedAnswerId: answerId,
    });
  }

  /**
   * Evalúa la respuesta elegida para la pregunta en curso contra la respuesta correcta del dominio.
   *
   * Actualiza el estado de la partida a `'correct'` o `'incorrect'`, incrementa el puntaje acumulado
   * en caso de acierto e incrementa la cantidad de preguntas respondidas.
   *
   * @returns Un objeto `SubmitAnswerOutcome` con el resultado de la evaluación, o `null` si la operación
   *          no pudo efectuarse (por ejemplo, si no hay opción seleccionada o ya fue evaluada).
   */
  submitCurrentAnswer(): SubmitAnswerOutcome | null {
    const state = this.stateSubject.value;
    if (
      state.answerState !== 'unanswered' ||
      !state.selectedAnswerId ||
      state.completedAt !== undefined
    ) {
      return null;
    }

    const currentQuestion = this.getCurrentQuestion();
    if (!currentQuestion) {
      return null;
    }

    const isCorrect =
      currentQuestion.correctAnswerId === state.selectedAnswerId;
    const nextScore = isCorrect ? state.score + 1 : state.score;

    this.stateSubject.next({
      ...state,
      answerState: isCorrect ? 'correct' : 'incorrect',
      score: nextScore,
      answeredQuestions: state.answeredQuestions + 1,
    });

    return {
      evaluated: true,
      isCorrect,
      correctAnswerId: currentQuestion.correctAnswerId,
      selectedAnswerId: state.selectedAnswerId,
      questionId: currentQuestion.id,
    };
  }

  /**
   * Avanza el cursor a la siguiente pregunta de la sesión.
   *
   * Restablece el estado de respuesta a `'unanswered'` y desmarca la opción seleccionada.
   *
   * @returns `true` si se pudo avanzar exitosamente; `false` si la pregunta actual aún no fue respondida
   *          o si ya se alcanzó la última pregunta de la trivia.
   */
  goToNextQuestion(): boolean {
    const state = this.stateSubject.value;
    if (state.answerState === 'unanswered' || !state.questions.length) {
      return false;
    }
    if (this.isLastQuestion()) {
      return false;
    }

    this.stateSubject.next({
      ...state,
      currentQuestionIndex: state.currentQuestionIndex + 1,
      selectedAnswerId: undefined,
      answerState: 'unanswered',
    });
    return true;
  }

  isLastQuestion(): boolean {
    const state = this.stateSubject.value;
    if (!state.questions.length) {
      return false;
    }
    return state.currentQuestionIndex >= state.questions.length - 1;
  }

  getProgress(): number {
    const state = this.stateSubject.value;
    if (!state.questions.length) {
      return 0;
    }
    return (state.currentQuestionIndex + 1) / state.questions.length;
  }

  getScore(): number {
    return this.stateSubject.value.score;
  }

  /**
   * Finaliza la sesión actual fijando la marca de tiempo de finalización (`completedAt`).
   */
  completeQuiz(): void {
    const state = this.stateSubject.value;
    if (!state.questions.length || state.completedAt !== undefined) {
      return;
    }
    this.stateSubject.next({
      ...state,
      completedAt: Date.now(),
    });
    void this.persistHistory(this.stateSubject.value);
  }

  private persistHistory(state: QuizState): void {
    this.firestoreHistory
      ?.saveResult(state)
      .catch((error: unknown) => {
        console.error('Failed to save quiz result to Firestore', error);
      });
  }

  /**
   * Restablece el estado reactivo de la sesión a sus valores iniciales en blanco y limpia la deduplicación háptica.
   */
  resetQuiz(): void {
    this.hapticService?.resetSessionTracking();
    this.stateSubject.next({
      ...INITIAL_QUIZ_STATE,
    });
  }

  hasActiveQuiz(): boolean {
    const state = this.stateSubject.value;
    return state.questions.length > 0 && state.completedAt === undefined;
  }

  hasCompletedQuiz(): boolean {
    const state = this.stateSubject.value;
    return state.questions.length > 0 && state.completedAt !== undefined;
  }
}
