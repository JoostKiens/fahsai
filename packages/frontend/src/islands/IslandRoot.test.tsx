import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { IslandRoot } from './IslandRoot';

// React only flushes act() updates in environments that opt in.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Broken(): never {
  throw new Error('render failed');
}

function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('IslandRoot', () => {
  it('shows its fallback when a child throws, and leaves another island alone', () => {
    // React and the boundary both log the caught error; keep the test output clean.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = mount(
      <IslandRoot name="Header" fallback={<p>Header unavailable</p>}>
        <Broken />
      </IslandRoot>,
    );
    const healthy = mount(
      <IslandRoot name="Sidebar" fallback={<p>Controls unavailable</p>}>
        <p>Layers</p>
      </IslandRoot>,
    );

    expect(broken.container.textContent).toBe('Header unavailable');
    expect(healthy.container.textContent).toBe('Layers');

    broken.unmount();
    healthy.unmount();
    consoleError.mockRestore();
  });
});
