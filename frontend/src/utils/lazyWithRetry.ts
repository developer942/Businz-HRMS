import React, { ComponentType, lazy, LazyExoticComponent } from 'react';

/**
 * Enhanced lazy loader with exponential backoff retries.
 * NEVER triggers automatic window.location.reload() — prevents unexpected full-page
 * reloads and form data loss on transient mobile network dropouts or deployments.
 * If all retries fail, rejects cleanly so ErrorBoundary displays a user-controlled
 * "Retry" / "Reload" recovery view.
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | Record<string, any>>,
  exportName: string = 'default',
  retriesLeft = 3,
  interval = 700
): LazyExoticComponent<T> {
  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (retries: number, delayMs: number) => {
        factory()
          .then((module) => {
            if (typeof window !== 'undefined' && window.sessionStorage) {
              try {
                window.sessionStorage.removeItem('vrm_chunk_reload_attempted');
              } catch {}
            }

            const component =
              exportName === 'default'
                ? (module as any).default || module
                : (module as any)[exportName] || (module as any).default || module;

            resolve({ default: component });
          })
          .catch((error) => {
            if (retries > 0) {
              setTimeout(() => {
                attempt(retries - 1, Math.min(delayMs * 2, 3000));
              }, delayMs);
            } else {
              reject(error);
            }
          });
      };

      attempt(retriesLeft, interval);
    });
  });
}

