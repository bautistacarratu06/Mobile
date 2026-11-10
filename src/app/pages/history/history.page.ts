import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import {
  FirestoreHistoryService,
  QuizHistoryEntry,
} from '../../core/services/firestore-history.service';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: false,
})
export class HistoryPage implements OnInit {
  entries: QuizHistoryEntry[] = [];
  isLoading = false;
  errorMessage: string | null = null;

  constructor(
    private readonly historyService: FirestoreHistoryService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    void this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.cdr.markForCheck();

    try {
      this.entries = await this.historyService.getRecentResults();
    } catch (error: unknown) {
      console.error('Failed to load quiz history from Firestore', error);
      this.errorMessage =
        'No se pudo cargar el historial. Verificá tu conexión e intentá nuevamente.';
      this.entries = [];
    } finally {
      this.isLoading = false;
      this.cdr.markForCheck();
    }
  }

  formatDate(value: Date | null): string {
    if (!value) {
      return 'Fecha no disponible';
    }
    return new Intl.DateTimeFormat('es-AR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(value);
  }

  difficultyLabel(difficulty?: string): string {
    switch (difficulty) {
      case 'easy':
        return 'Fácil';
      case 'medium':
        return 'Media';
      case 'hard':
        return 'Difícil';
      default:
        return difficulty ?? '';
    }
  }

  metaText(entry: QuizHistoryEntry): string {
    const parts: string[] = [];
    if (entry.category) {
      parts.push(entry.category);
    }
    const difficulty = this.difficultyLabel(entry.difficulty);
    if (difficulty) {
      parts.push(difficulty);
    }
    return parts.join(' · ');
  }

  displayScore(entry: QuizHistoryEntry): string {
    return entry.score || 'Sin puntaje';
  }
}
