/**
 * Warn when a credential-holding provider is constructed in a browser.
 *
 * A key passed to OpenAIProvider/AnthropicProvider from client code ships in
 * the bundle and is readable by every visitor (AUDIT `api-keys-shipped-to-
 * browser`). The documented examples used to do exactly this, so the mistake is
 * easy to make and — until the bill arrives — completely silent.
 *
 * This does not block anything. Server-side rendering, tests and Node scripts
 * all legitimately construct these providers, and a hard failure in the browser
 * would be a breaking change. It makes the mistake visible instead, once per
 * provider per page.
 */

const warned = new Set<string>();

/** True in a browser-like environment (has a DOM document). */
function inBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.document !== 'undefined';
}

export function warnIfBrowserKey(providerName: string, apiKey: string): void {
  if (!apiKey || !inBrowser() || warned.has(providerName)) return;
  warned.add(providerName);

  console.warn(
    `[@guideflow/ai] ${providerName} was given an API key in a browser.\n` +
      'That key is in your JavaScript bundle and readable by anyone who opens devtools.\n' +
      'Use ProxyProvider and keep the key on a server you control:\n' +
      "  import { ProxyProvider } from '@guideflow/ai'\n" +
      "  createAI(new ProxyProvider({ endpoint: '/api/guideflow-ai' }), gf)\n" +
      'See https://github.com/RealNerdZW/GuideFlow/blob/master/apps/docs/guide/ai-proxy.md',
  );
}

/** Test seam — the warn-once cache is module state. */
export function resetBrowserKeyWarnings(): void {
  warned.clear();
}
