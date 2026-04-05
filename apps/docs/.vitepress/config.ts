import { defineConfig } from 'vitepress';

export default defineConfig({
  lang: 'en-US',
  title: 'GuideFlow.js',
  description: 'AI-powered product tours. Guide users like you know them.',
  base: '/GuideFlow/',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'og:title', content: 'GuideFlow.js' }],
    ['meta', { name: 'og:description', content: 'AI-powered product tours. Guide users like you know them.' }],
  ],

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
