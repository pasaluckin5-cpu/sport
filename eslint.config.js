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
];
