import { CommonModule } from '@angular/common';
import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { IonicModule } from '@ionic/angular/lazy';
import { vi } from 'vitest';
import { FirestoreHistoryService } from '../../core/services/firestore-history.service';
import { HistoryPage } from './history.page';

describe('HistoryPage', () => {
  let component: HistoryPage;
  let fixture: ComponentFixture<HistoryPage>;
  let mockHistoryService: {
    getRecentResults: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockHistoryService = {
      getRecentResults: vi.fn().mockResolvedValue([]),
    };

    await TestBed.configureTestingModule({
      declarations: [HistoryPage],
      imports: [IonicModule, CommonModule, RouterTestingModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: FirestoreHistoryService, useValue: mockHistoryService },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    fixture = TestBed.createComponent(HistoryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders saved quiz results with score, date, category, and difficulty', async () => {
    mockHistoryService.getRecentResults.mockResolvedValue([
      {
        id: 'h1',
        score: '5/10',
        correct: 5,
        total: 10,
        createdAt: new Date(2026, 10, 10, 17, 30),
        category: 'Ciencia',
        difficulty: 'easy',
      },
    ]);

    const el = await render();

    expect(el.textContent).toContain('Historial');
    expect(el.textContent).toContain('5/10');
    expect(el.textContent).toContain('Ciencia');
    expect(el.textContent).toContain('Fácil');
    expect(component.formatDate(new Date(2026, 10, 10, 17, 30))).toBe(
      new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(2026, 10, 10, 17, 30))
    );
    expect(el.textContent).toContain(
      component.formatDate(new Date(2026, 10, 10, 17, 30))
    );
  });

  it('shows an empty state when there are no saved games', async () => {
    mockHistoryService.getRecentResults.mockResolvedValue([]);
    const el = await render();
    expect(el.textContent).toContain('Todavía no hay partidas guardadas');
  });

  it('shows an error message when the history cannot be loaded', async () => {
    mockHistoryService.getRecentResults.mockRejectedValue(new Error('unavailable'));
    const el = await render();
    expect(el.textContent).toContain('No se pudo cargar el historial');
    expect(el.querySelector('[data-testid="history-retry-btn"]')).toBeTruthy();
  });
});
