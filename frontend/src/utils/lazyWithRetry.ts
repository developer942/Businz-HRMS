import React, { ComponentType, lazy, LazyExoticComponent } from 'react';

/**
 * Enhanced lazy loader with automatic retry and stale-chunk recovery.
 * Handles:
 * 1. Transient network dropouts (retries up to 2 times with delay).
 * 2. Deployments where old chunk hashes no longer exist on server (auto-refreshes once).
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | Record<string, any>>,
  exportName: string = 'default',
  retriesLeft = 2,
  interval = 1000
): LazyExoticComponent<T> {
  return lazy(() => {
    return new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (retries: number) => {
        factory()
          .then((module) => {
            // Reset refresh guard on success
            if (typeof window !== 'undefined' && window.sessionStorage) {
              window.sessionStorage.removeItem('vrm_chunk_reload_attempted');
            }

            const component =
              exportName === 'default'
                ? (module as any).default || module
                : (module as any)[exportName] || (module as any).default || module;

            resolve({ default: component });
          })
          .catch((error) => {
            const isChunkError =
              error?.name === 'ChunkLoadError' ||
              /loading chunk|failed to fetch dynamically imported module|unexpected token '<'/i.test(
                error?.message || ''
              );

            if (retries > 0) {
              setTimeout(() => {
                attempt(retries - 1);
              }, interval);
            } else if (isChunkError) {
              // Stale chunk from previous deployment: reload once with latest HTML
              if (typeof window !== 'undefined' && window.sessionStorage) {
                const alreadyReloaded = window.sessionStorage.getItem('vrm_chunk_reload_attempted');
                if (!alreadyReloaded) {
                  window.sessionStorage.setItem('vrm_chunk_reload_attempted', 'true');
                  window.location.reload();
                  return;
                }
              }
              reject(error);
            } else {
              reject(error);
            }
          });
      };

      attempt(retriesLeft);
    });
  });
}
