import type { Preview } from '@storybook/react';
import '@guideflow/core/styles';

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    backgrounds: {
      default: 'light',
      values: [
        { name: 'light', value: '#ffffff' },
        { name: 'dark', value: '#1e1e2e' },
      ],
    },
  },
};

export default preview;
