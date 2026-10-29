import '@/i18n';
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { LayerGroups } from './LayerGroups';

// React only flushes act() updates in environments that opt in.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function switchNames(): string[] {
  return [...document.querySelectorAll('[role="switch"]')].map((el) => {
    const labelId = el.getAttribute('aria-labelledby') ?? '';
    return document.getElementById(labelId)?.textContent ?? '';
  });
}

describe('LayerGroups', () => {
  it('names every layer switch by its visible label', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<LayerGroups />));

    expect(switchNames()).toEqual(['Station readings', 'Ambient', 'Fires', 'Wind', 'Power Plants']);

    act(() => root.unmount());
    container.remove();
  });
});
