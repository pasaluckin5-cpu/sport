// https://docs.expo.dev/guides/using-eslint/
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    // Plain Node/CommonJS scripts (e.g. scripts/generate-icons.js) run outside the
    // app bundle, so they need Node globals rather than the app's browser/RN ones.
    files: ['scripts/**/*.js'],
    languageOptions: {
      globals: {
        require: 'readonly',
        module: 'writable',
        __dirname: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
      },
    },
  },
  {
    // '@/bluetooth/ble-engine' only exists as ble-engine.native.ts / ble-engine.web.ts —
    // Metro (bundling) and tsc (via tsconfig's moduleSuffixes) both resolve the platform
    // variant correctly, but eslint-plugin-import's resolver doesn't know about RN's
    // platform-suffix convention and flags the bare specifier as unresolved.
    files: ['src/state/heart-rate-context.tsx'],
    rules: {
      'import/no-unresolved': 'off',
    },
  },
];
