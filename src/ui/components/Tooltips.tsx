import { createContext, use, type ReactNode } from 'react';
import * as Tooltip from '@radix-ui/react-tooltip';

const HasProvider = createContext(false);

/** Wrap the app once so adjacent tooltips open instantly after the first one. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <HasProvider value={true}>
      <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
        {children}
      </Tooltip.Provider>
    </HasProvider>
  );
}

/** Used by IconButton: reuses the app provider, or supplies its own in isolation. */
export function EnsureTooltipProvider({ children }: { children: ReactNode }) {
  const has = use(HasProvider);
  if (has) return <>{children}</>;
  return <Tooltip.Provider delayDuration={400}>{children}</Tooltip.Provider>;
}
