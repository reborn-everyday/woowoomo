import globals from 'globals'
import importPlugin from 'eslint-plugin-import'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'out/**',
      'release/**',
      'node_modules/**',
      'competition/**',
      '.opencode-competition/**',
      '.tmp-smoke-*/**'
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: [
      'electron.vite.config.ts',
      'vitest.workspace.ts',
      'src/**/*.ts',
      'src/**/*.tsx'
    ],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {}
  }
)
