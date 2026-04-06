import { defineConfig, type PageData } from 'vitepress';

const SITE_URL = 'https://realnerdZW.github.io/GuideFlow';
const SITE_TITLE = 'GuideFlow.js';
const SITE_DESCRIPTION = 'AI-powered product tours. Guide users like you know them. Open-source tour library for React, Vue, Svelte & Vanilla JS.';
const OG_IMAGE = `${SITE_URL}/hero.svg`;

function canonicalUrl(relativePath: string): string {
  // relativePath e.g. "guide/installation.md" → "https://.../GuideFlow/guide/installation"
  const clean = relativePath
    .replace(/\.md$/, '')
    .replace(/(^|\/)index$/, '$1');
  const path = clean ? `/${clean}` : '';
  return `${SITE_URL}${path}`;
}

export default defineConfig({
  lang: 'en-US',
  title: SITE_TITLE,
  titleTemplate: ':title — GuideFlow.js',
  description: SITE_DESCRIPTION,
  base: '/GuideFlow/',
  cleanUrls: true,
  lastUpdated: true,

  sitemap: {
    hostname: `${SITE_URL}/`,
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    // Open Graph — global defaults (overridden per-page via transformPageData)
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:site_name', content: SITE_TITLE }],
    ['meta', { property: 'og:title', content: SITE_TITLE }],
    ['meta', { property: 'og:description', content: SITE_DESCRIPTION }],
    ['meta', { property: 'og:image', content: OG_IMAGE }],
    ['meta', { property: 'og:image:alt', content: 'GuideFlow.js — AI-Powered Product Tour Library' }],
    ['meta', { property: 'og:image:type', content: 'image/svg+xml' }],
    // Twitter / X Card
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: SITE_TITLE }],
    ['meta', { name: 'twitter:description', content: SITE_DESCRIPTION }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE }],
    // Global keyword signals
    ['meta', { name: 'keywords', content: 'product tour, user onboarding, AI tour, guided tour library, React tour, Vue tour, Svelte tour, Driver.js alternative, Intro.js alternative, TypeScript tour library' }],
  ],

  transformPageData(pageData: PageData) {
    const canonical = canonicalUrl(pageData.relativePath);
    const pageTitle = pageData.frontmatter?.title
      ? `${pageData.frontmatter.title} — ${SITE_TITLE}`
      : pageData.title
        ? `${pageData.title} — ${SITE_TITLE}`
        : SITE_TITLE;
    const pageDesc: string = pageData.frontmatter?.description || SITE_DESCRIPTION;

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: pageTitle }],
      ['meta', { property: 'og:description', content: pageDesc }],
      ['meta', { name: 'twitter:title', content: pageTitle }],
      ['meta', { name: 'twitter:description', content: pageDesc }],
    );

    // JSON-LD structured data
    const isHome = pageData.relativePath === 'index.md';
    if (isHome) {
      pageData.frontmatter.head.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'WebSite',
              '@id': `${SITE_URL}/#website`,
              url: `${SITE_URL}/`,
              name: SITE_TITLE,
              description: SITE_DESCRIPTION,
              inLanguage: 'en-US',
            },
            {
              '@type': 'SoftwareApplication',
              '@id': `${SITE_URL}/#software`,
              name: SITE_TITLE,
              url: `${SITE_URL}/`,
              description: SITE_DESCRIPTION,
              applicationCategory: 'DeveloperApplication',
              operatingSystem: 'Any',
              programmingLanguage: ['TypeScript', 'JavaScript'],
              codeRepository: 'https://github.com/RealNerdZW/GuideFlow',
              license: 'https://opensource.org/licenses/MIT',
              keywords: 'product tour, user onboarding, AI tour library, React, Vue, Svelte',
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
          ],
        }),
      ]);
    } else {
      // BreadcrumbList for all non-home pages
      const segments = pageData.relativePath
        .replace(/\.md$/, '')
        .replace(/\/index$/, '')
        .split('/')
        .filter(Boolean);
      const breadcrumbs = [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
        ...segments.map((seg, i) => ({
          '@type': 'ListItem',
          position: i + 2,
          name: seg
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase()),
          item: `${SITE_URL}/${segments.slice(0, i + 1).join('/')}/`,
        })),
      ];
      pageData.frontmatter.head.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: breadcrumbs,
        }),
      ]);
    }
  },

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'GuideFlow',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'API', link: '/api/' },
      { text: 'Themes', link: '/themes/' },
      {
        text: 'Packages',
        items: [
          { text: '@guideflow/core', link: '/packages/core' },
          { text: '@guideflow/react', link: '/packages/react' },
          { text: '@guideflow/vue', link: '/packages/vue' },
          { text: '@guideflow/svelte', link: '/packages/svelte' },
          { text: '@guideflow/ai', link: '/packages/ai' },
          { text: '@guideflow/analytics', link: '/packages/analytics' },
          { text: '@guideflow/cli', link: '/packages/cli' },
          { text: '@guideflow/devtools', link: '/packages/devtools' },
        ],
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quick Start', link: '/guide/quick-start' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Flows & Steps', link: '/guide/flows-and-steps' },
            { text: 'State Machine', link: '/guide/state-machine' },
            { text: 'Spotlight & Popover', link: '/guide/spotlight-popover' },
            { text: 'Persistence', link: '/guide/persistence' },
            { text: 'i18n', link: '/guide/i18n' },
          ],
        },
        {
          text: 'Frameworks',
          items: [
            { text: 'React', link: '/guide/react' },
            { text: 'Vue', link: '/guide/vue' },
            { text: 'Svelte', link: '/guide/svelte' },
            { text: 'Vanilla JS', link: '/guide/vanilla' },
          ],
        },
        {
          text: 'AI Features',
          items: [
            { text: 'Overview', link: '/guide/ai' },
            { text: 'Auto-generate tours', link: '/guide/ai-generate' },
            { text: 'Intent detection', link: '/guide/ai-intent' },
            { text: 'Conversational help', link: '/guide/ai-chat' },
          ],
        },
        {
          text: 'Analytics & A/B',
          items: [
            { text: 'Analytics', link: '/guide/analytics' },
            { text: 'A/B Testing', link: '/guide/ab-testing' },
          ],
        },
        {
          text: 'Migration',
          items: [
            { text: 'From Driver.js', link: '/guide/migrate-driver' },
            { text: 'From Intro.js', link: '/guide/migrate-intro' },
          ],
        },
      ],

      '/api/': [
        {
          text: 'Core API',
          items: [
            { text: 'createGuideFlow()', link: '/api/create-guide-flow' },
            { text: 'FlowDefinition', link: '/api/flow-definition' },
            { text: 'Step', link: '/api/step' },
            { text: 'TourEngine', link: '/api/tour-engine' },
            { text: 'FlowMachine', link: '/api/flow-machine' },
            { text: 'ProgressStore', link: '/api/progress-store' },
          ],
        },
        {
          text: 'React API',
          items: [
            { text: 'TourProvider', link: '/api/react/tour-provider' },
            { text: 'useTour()', link: '/api/react/use-tour' },
            { text: 'TourStep', link: '/api/react/tour-step' },
            { text: 'GuidePopover', link: '/api/react/guide-popover' },
          ],
        },
      ],

      '/themes/': [
        {
          text: 'Themes',
          items: [
            { text: 'Overview', link: '/themes/' },
            { text: 'Minimal', link: '/themes/minimal' },
            { text: 'Bold', link: '/themes/bold' },
            { text: 'Glass', link: '/themes/glass' },
            { text: 'Brutalist', link: '/themes/brutalist' },
            { text: 'Enterprise', link: '/themes/enterprise' },
            { text: 'Custom Tokens', link: '/themes/custom' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/RealNerdZW/GuideFlow' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024 GuideFlow Contributors',
    },

    search: { provider: 'local' },
  },
});
