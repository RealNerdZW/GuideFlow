// ---------------------------------------------------------------------------
// useIsomorphicLayoutEffect
// useLayoutEffect on the client, useEffect on the server (where React warns
// that layout effects do nothing). @guideflow/core is imported by Next.js,
// Nuxt and SvelteKit users, so nothing here may assume a DOM.
// ---------------------------------------------------------------------------

import { useEffect, useLayoutEffect } from 'react'

export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'
    ? useLayoutEffect
    : useEffect
