---
"@guideflow/vue": patch
"@guideflow/core": patch
---

Fix a listener leak in `useTour()` when called outside a component.

`useTour()` registered its teardown with `onUnmounted`, which only fires for a
component instance. Called from a bare `effectScope()` — the normal shape for a
Pinia store or a shared composable — the teardown was never registered and all
five GuideFlow event listeners stayed attached for the lifetime of the page.
It now uses `onScopeDispose`, which also covers the component case because
`setup()` runs inside its own effect scope.

`@guideflow/core` additionally exports `getAbsoluteRect`, the page-coordinate
counterpart to `getViewportRect` (which is client-relative). It was referenced
in the 0.1.9 release notes but never actually exported.
