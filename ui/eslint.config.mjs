import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import fp from 'eslint-plugin-fp'
import noElse from 'eslint-plugin-no-else'
import i18next from 'eslint-plugin-i18next'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import reactPlugin from 'eslint-plugin-react'
import importPlugin from 'eslint-plugin-import'
import stylistic from '@stylistic/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import pluginQuery from '@tanstack/eslint-plugin-query'
import { fixupPluginRules } from '@eslint/compat'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'public',
      'coverage',
      'node_modules',
      'src/generated',
      'eslint.config.js',
      'vite.config.ts',
      'vitest-setup.ts',
      'orval.config.ts',
    ],
  },
  {
    extends: [
      js.configs.recommended,
      importPlugin.flatConfigs.recommended,
      reactPlugin.configs.flat.recommended,
      jsxA11y.flatConfigs.recommended,
      i18next.configs['flat/recommended'],
      ...pluginQuery.configs['flat/recommended'],
      ...tseslint.configs.recommended,
    ],
    files: ['**/*.{js,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.app.json',
        ecmaFeatures: {
          jsx: true,
          arrowFunctions: true,
        },
      },
    },
    settings: {
      typescript: true,
      node: true,
      react: {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.app.json',
        },
        node: {
          extensions: ['.js', '.ts', '.tsx'],
          paths: ['./src'],
        },
      },
      'import/extensions': ['.js', '.ts', '.tsx'],
      'import/ignore': ['node_modules'],
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      '@stylistic': stylistic,
      'no-else': fixupPluginRules(noElse),
      fp,
    },
    rules: {
      /* react */
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/destructuring-assignment': ['error', 'always', { destructureInSignature: 'always' }],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/require-default-props': 'off',
      'react/no-array-index-key': 'warn',
      'react/jsx-curly-newline': 'error',
      'react/jsx-props-no-spreading': [
        'error',
        {
          html: 'ignore',
          custom: 'enforce',
          exceptions: [],
        },
      ],
      'react/jsx-filename-extension': [
        'error',
        {
          extensions: ['.tsx'],
        },
      ],
      'react/jsx-uses-vars': 'error',
      'react/self-closing-comp': [
        'error',
        {
          component: true,
          html: true,
        },
      ],
      'react/display-name': 'off',
      'react/prop-types': 'error',
      'react/button-has-type': 'error',
      /* react-hooks */
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'off',
      /* @typescript */
      '@typescript-eslint/no-use-before-define': 'error',
      '@typescript-eslint/no-empty-interface': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
          filter: {
            regex: '^(_)$',
            match: false,
          },
        },
        {
          selector: 'import',
          format: ['camelCase', 'PascalCase'],
        },
        {
          selector: 'function',
          format: ['PascalCase', 'camelCase'],
        },
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'UPPER_CASE'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'typeParameter',
          format: ['PascalCase'],
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'class',
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'enum',
          format: ['PascalCase'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
          leadingUnderscore: 'forbid',
        },
        {
          selector: 'property',
          format: ['camelCase'],
          leadingUnderscore: 'forbid',
          filter: {
            regex: '^(_)$',
            match: false,
          },
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      /* imports */
      'import/prefer-default-export': 'off',
      'import/no-named-default': 'error',
      'import/no-duplicates': 'error',
      'import/no-unresolved': 'error',
      'import/no-cycle': 'warn',
      'import/extensions': [
        'error',
        'ignorePackages',
        {
          js: 'never',
          jsx: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['**/*.test.{ts,tsx}', 'src/__mocks__/**'],
        },
      ],
      'import/order': [
        'error',
        {
          'newlines-between': 'always',
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [
            {
              pattern: '@/components/**',
              group: 'internal',
              position: 'before',
            },
            {
              pattern: '*.svg?react',
              group: 'internal',
              patternOptions: {
                matchBase: true,
              },
              position: 'after',
            },
            {
              pattern: '{@/{lib,store,config,types/enums,__mocks__}/**,{@,.,..}/**/*client}',
              group: 'internal',
              patternOptions: {
                dot: true,
                nocomment: true,
              },
              position: 'after',
            },
            {
              pattern: '{@/constants/**,{.,..}/**/constants,**/routes,{.,..}/**/*route-paths}',
              group: 'internal',
              patternOptions: {
                dot: true,
                nocomment: true,
              },
              position: 'after',
            },
            {
              pattern: '*.{png,svg}',
              group: 'index',
              patternOptions: {
                matchBase: true,
              },
              position: 'after',
            },
            {
              pattern: '*.css',
              group: 'index',
              patternOptions: {
                matchBase: true,
              },
              position: 'after',
            },
          ],
          distinctGroup: true,
          pathGroupsExcludedImportTypes: ['builtin', 'external', 'object', 'type'],
        },
      ],
      /* stylistic */
      '@stylistic/quotes': ['error', 'single'],
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: 'type', next: 'export' },
        { blankLine: 'always', prev: 'block-like', next: '*' },
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'switch', 'try'] },
      ],
      '@stylistic/jsx-sort-props': [
        'error',
        {
          callbacksLast: true,
          shorthandLast: true,
          ignoreCase: true,
          multiline: 'last',
          reservedFirst: true,
        },
      ],
      /* misc */
      'func-names': 'error',
      'no-console': ['error', { allow: ['error', 'info', 'warn'] }],
      'consistent-return': 'error',
      'no-alert': 'error',
      'no-param-reassign': [
        'error',
        {
          props: true,
          ignorePropertyModificationsFor: ['config'],
        },
      ],
      'object-shorthand': 'error',
      'no-else-return': ['error', { allowElseIf: false }],
      'no-else/no-else': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportDefaultDeclaration',
          message: 'Prefer named exports',
        },
      ],
      'arrow-body-style': ['error', 'as-needed'],
      'max-params': ['error', { max: 3 }],
      'sort-imports': 'off',
      'fp/no-delete': 'error',
      'no-var': 'error',
      'no-underscore-dangle': 'off',
      'no-await-in-loop': 'error',
      'no-shadow': 'off',
      'no-continue': 'off',
      'i18next/no-literal-string': ['error', { words: { exclude: ['%', 'Stub'] } }],
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  {
    files: ['**/*.stories.*', '.storybook/**/*', '**/config/i18n/i18n.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
  {
    files: ['src/main.tsx'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['src/__mocks__/**', 'src/constants/keyboard-keys-map.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
  {
    files: ['src/__mocks__/**'],
    rules: {
      'consistent-return': 'off',
    },
  },
  {
    files: ['src/components/ui/device-table/helpers.tsx'],
    rules: {
      'max-params': 'off',
    },
  },
  {
    files: ['src/lib/utils/debounce.util.ts', 'src/lib/hooks/use-callback-with-error-handling.hook.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    files: ['src/services/touch-service/touch-service.ts'],
    rules: {
      'fp/no-delete': 'off',
    },
  },
  {
    files: ['src/services/scaling-service/scaling-service.ts'],
    rules: {
      'no-else/no-else': 'off',
    },
  }
)
