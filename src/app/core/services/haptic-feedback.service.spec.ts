import { TestBed } from '@angular/core/testing';
import { ImpactStyle, NotificationType } from '@capacitor/haptics';
import { vi } from 'vitest';
import {
  HAPTICS_DRIVER,
  HapticFeedbackService,
  HapticsDriver,
} from './haptic-feedback.service';

describe('HapticFeedbackService (IFT-14)', () => {
  let mockDriver: HapticsDriver;

  beforeEach(() => {
    window.localStorage.removeItem('quizly.pref.haptics.v1');
    mockDriver = {
      impact: vi.fn().mockResolvedValue(undefined),
      notification: vi.fn().mockResolvedValue(undefined),
      selectionStart: vi.fn().mockResolvedValue(undefined),
      isSupported: vi.fn().mockReturnValue(true),
    };
  });

  function createService(): HapticFeedbackService {
    TestBed.configureTestingModule({
      providers: [
        HapticFeedbackService,
        { provide: HAPTICS_DRIVER, useValue: mockDriver },
      ],
    });
    return TestBed.inject(HapticFeedbackService);
  }

  it('triggers Medium impact on error() and Light impact on success()', async () => {
    const service = createService();

    await service.error();
    expect(mockDriver.impact).toHaveBeenCalledTimes(1);
    expect(mockDriver.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });

    await service.success();
    expect(mockDriver.impact).toHaveBeenCalledTimes(2);
    expect(mockDriver.impact).toHaveBeenLastCalledWith({
      style: ImpactStyle.Light,
    });
  });

  it('triggers Success notification on quizCompleted()', async () => {
    const service = createService();

    await service.quizCompleted();
    expect(mockDriver.notification).toHaveBeenCalledTimes(1);
    expect(mockDriver.notification).toHaveBeenCalledWith({
      type: NotificationType.Success,
    });
  });

  it('does not call the plugin when haptic preference is disabled and persists preference across instances', async () => {
    const service = createService();
    expect(service.getEnabled()).toBe(true);

    service.setEnabled(false);
    expect(service.getEnabled()).toBe(false);

    await service.error();
    await service.success();
    await service.quizCompleted();

    expect(mockDriver.impact).not.toHaveBeenCalled();
    expect(mockDriver.notification).not.toHaveBeenCalled();

    // Recreate service to verify persistence across app restarts
    TestBed.resetTestingModule();
    const restoredService = createService();
    expect(restoredService.getEnabled()).toBe(false);
  });

  it('recovers with default enabled=true when stored preference JSON is corrupted', () => {
    window.localStorage.setItem('quizly.pref.haptics.v1', '{not-valid-json');
    const service = createService();
    expect(service.getEnabled()).toBe(true);
  });

  it('swallows plugin exceptions without throwing or breaking the quiz flow', async () => {
    mockDriver.impact = vi
      .fn()
      .mockRejectedValue(new Error('Native plugin unavailable'));
    const service = createService();

    await expect(service.error()).resolves.toBeUndefined();
    await expect(service.success()).resolves.toBeUndefined();
  });

  it('reports unavailable and skips calls in desktop browsers without vibration support', async () => {
    mockDriver.isSupported = vi.fn().mockReturnValue(false);
    const service = createService();

    expect(service.isAvailable()).toBe(false);
    await service.error();
    expect(mockDriver.impact).not.toHaveBeenCalled();
  });

  it('prevents duplicate vibrations for the same question on double-tap or re-render', async () => {
    const service = createService();

    await service.notifyAnswerResult('q_1', false);
    await service.notifyAnswerResult('q_1', false);
    await service.notifyAnswerResult('q_1', true);

    expect(mockDriver.impact).toHaveBeenCalledTimes(1);
    expect(mockDriver.impact).toHaveBeenCalledWith({ style: ImpactStyle.Medium });

    // Next question vibrates once
    await service.notifyAnswerResult('q_2', true);
    expect(mockDriver.impact).toHaveBeenCalledTimes(2);
    expect(mockDriver.impact).toHaveBeenLastCalledWith({
      style: ImpactStyle.Light,
    });
  });
});
