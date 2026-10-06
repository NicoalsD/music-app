import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { sonnerNotifier } from '../../../app/sonnerNotifier';
import { StoreProvider } from '../../../state';
import { createHarness } from '../../../state/test-utils/harness';
import type { Harness } from '../../../state/test-utils/harness';
import { Toaster } from '../../components/Toaster';
import { TooltipProvider } from '../../components/Tooltips';

export interface Rendered extends RenderResult {
  readonly h: Harness;
}

/** Renders UI against a store built over fakes. Pass `realToasts` to wire the sonner notifier. */
export function renderWithStore(
  ui: ReactNode,
  options: { realToasts?: boolean; harness?: Harness } = {},
): Rendered {
  const h =
    options.harness ??
    createHarness(options.realToasts === true ? { notifier: sonnerNotifier } : {});
  const result = render(
    <StoreProvider store={h.store}>
      <TooltipProvider>
        {ui}
        <Toaster />
      </TooltipProvider>
    </StoreProvider>,
  );
  return Object.assign(result, { h });
}
