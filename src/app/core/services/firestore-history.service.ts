import { Injectable, Optional } from '@angular/core';
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../../firebase';
import { QuizState } from '../../models/quiz.models';
import { AuthStateService } from './auth-state.service';

export interface QuizHistoryEntry {
  id: string;
  score: string;
  correct?: number;
  total?: number;
  createdAt: Date | null;
  category?: string;
  difficulty?: string;
}


@Injectable({
  providedIn: 'root',
})
export class FirestoreHistoryService {
  constructor(@Optional() private readonly authState?: AuthStateService) {}

  async saveResult(state: QuizState): Promise<void> {
    const correct = state.score;
    const total = state.questions.length;
    const user = this.authState?.currentUserSnapshot;
    const firstQuestion = state.questions[0];
    const category = firstQuestion?.category ?? state.lastSettings?.category;
    const difficulty =
      state.lastSettings?.difficulty ?? firstQuestion?.difficulty;

    const payload: Record<string, unknown> = {
      correct,
      total,
      score: `${correct}/${total}`,
      createdAt: serverTimestamp(),
    };

    if (user?.userId) {
      payload['userId'] = user.userId;
    }
    if (user?.email) {
      payload['email'] = user.email;
    }
    if (category !== undefined && category !== null && `${category}` !== '') {
      payload['category'] = category;
    }
    if (difficulty) {
      payload['difficulty'] = difficulty;
    }

    await addDoc(collection(db, 'history'), payload);
  }

  async getRecentResults(maxResults = 50): Promise<QuizHistoryEntry[]> {
    const historyQuery = query(
      collection(db, 'history'),
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
    const snapshot = await getDocs(historyQuery);
    return snapshot.docs.map((docSnap) =>
      this.mapEntry(docSnap.id, docSnap.data())
    );
  }

  private mapEntry(
    id: string,
    data: Record<string, unknown>
  ): QuizHistoryEntry {
    const correct = typeof data['correct'] === 'number' ? data['correct'] : undefined;
    const total = typeof data['total'] === 'number' ? data['total'] : undefined;
    let score = typeof data['score'] === 'string' ? data['score'] : '';
    if (!score && correct !== undefined && total !== undefined) {
      score = `${correct}/${total}`;
    }

    const categoryValue = data['category'];
    const category =
      typeof categoryValue === 'string' && categoryValue
        ? categoryValue
        : typeof categoryValue === 'number'
          ? String(categoryValue)
          : undefined;

    const difficultyValue = data['difficulty'];
    const difficulty =
      typeof difficultyValue === 'string' && difficultyValue
        ? difficultyValue
        : undefined;

    return {
      id,
      score,
      correct,
      total,
      createdAt: this.toDate(data['createdAt']),
      category,
      difficulty,
    };
  }

  private toDate(value: unknown): Date | null {
    if (!value) {
      return null;
    }
    if (value instanceof Date) {
      return value;
    }
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate();
    }
    return null;
  }
}
