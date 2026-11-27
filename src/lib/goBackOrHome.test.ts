import { beforeEach, describe, expect, it, vi } from 'vitest';

import { goBackOrHome } from './goBackOrHome';

const router = vi.hoisted(() => ({
  canDismiss: vi.fn(() => false),
  canGoBack: vi.fn(() => false),
  dismiss: vi.fn(),
  back: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('expo-router', () => ({ router }));

describe('goBackOrHome', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    router.canDismiss.mockReturnValue(false);
    router.canGoBack.mockReturnValue(false);
  });

  it('pops the stack when there is a screen under this one', () => {
    router.canDismiss.mockReturnValue(true);
    router.canGoBack.mockReturnValue(true);
    goBackOrHome('/settings');
    expect(router.dismiss).toHaveBeenCalledTimes(1);
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('goes back through the history when there is no stack to pop', () => {
    router.canGoBack.mockReturnValue(true);
    goBackOrHome('/settings');
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('opens the fallback when there is nothing to go back to (a link, a notification)', () => {
    goBackOrHome('/settings');
    expect(router.replace).toHaveBeenCalledWith('/settings');
    expect(router.dismiss).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });

  it('falls back to the Library by default', () => {
    goBackOrHome();
    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
