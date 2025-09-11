// eslint.config.js
import {defineConfig} from 'eslint/config'
import tseslint from 'typescript-eslint';



export default tseslint.config(
    {
        files: ['**/*.{js,jsx,ts,tsx,cjs,mjs}'],
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            ascii: {
                rules: {
                'no-non-ascii': {
                    meta: {
                    type: 'problem',
                    docs: { description: 'Disallow any non-ASCII character anywhere in the file' },
                    schema: [],
                    messages: {
                        nonAscii: 'Non-ASCII character U+{{code}} found.',
                    },
                    },
                    create(context) {
                    // ESLint 9 exposes SourceCode at context.sourceCode
                    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
                    return {
                        Program() {
                        const text = sourceCode.text ?? sourceCode.getText();
                        for (let i = 0; i < text.length; i++) {
                            const cp = text.codePointAt(i);
                            if (cp > 0x7f) {
                            const loc = sourceCode.getLocFromIndex(i);
                            context.report({
                                loc: { start: loc, end: { line: loc.line, column: loc.column + 1 } },
                                messageId: 'nonAscii',
                                data: { code: cp.toString(16).toUpperCase().padStart(4, '0') },
                            });
                            // Skip the second half of a surrogate pair
                            if (cp > 0xffff) i++;
                            }
                        }
                        },
                    };
                    },
                },
                },
            },
        },
        rules: {
            'ascii/no-non-ascii': 'error',
        },
    },
    {
        ignores: ['dist'],
        languageOptions: {
            ecmaVersion: 2025,
            sourceType: 'module',
            globals: {
                $window: 'readonly',
            },
            parserOptions: {
                ecmaVersion: 2025,
                sourceType: 'module',
            },
        },
        linterOptions: {
            reportUnusedDisableDirectives: true,
        },
        rules: {
            // Possible errors
            'no-cond-assign': 2,
            'no-extra-parens': 0,
            'no-unexpected-multiline': 2,
            'valid-jsdoc': 0,
            'valid-typeof': 2,

            // Best practices
            'no-prototype-builtins': 0,
            'no-useless-catch': 0,
            'accessor-pairs': 2,
            'block-scoped-var': 2,
            complexity: 0,
            'consistent-return': 0,
            curly: 2,
            'dot-location': [2, 'property'],
            'dot-notation': 2,
            eqeqeq: [2, 'smart'],
            'guard-for-in': 0,
            'no-alert': 1,
            'no-caller': 2,
            'no-div-regex': 2,
            'no-else-return': 0,
            'no-empty-pattern': 2,
            'no-eq-null': 2,
            'no-eval': 2,
            'no-extend-native': 2,
            'no-extra-bind': 2,
            'no-fallthrough': 1,
            'no-floating-decimal': 1,
            'no-implicit-coercion': [2, {boolean: false, number: true, string: false}],
            'no-implied-eval': 2,
            'no-invalid-this': 1,
            'no-iterator': 2,
            'no-labels': 2,
            'no-lone-blocks': 2,
            'no-loop-func': 2,
            'no-magic-numbers': 0,
            'no-multi-spaces': 2,
            'no-multi-str': 2,
            'no-native-reassign': 2,
            'no-new-func': 2,
            'no-new-wrappers': 2,
            'no-new': 0,
            'no-octal-escape': 2,
            'no-octal': 1,
            'no-param-reassign': 0,
            'no-process-env': 0,
            'no-proto': 2,
            'no-redeclare': [2, {builtinGlobals: true}],
            'no-script-url': 2,
            'no-self-compare': 2,
            'no-sequences': 2,
            'no-throw-literal': 0,
            'no-unused-expressions': 2,
            'no-useless-call': 2,
            'no-useless-concat': 2,
            'no-void': 2,
            'no-warning-comments': [1, {terms: ['todo', 'fixme', '@todo', '@fixme']}],
            'no-with': 2,
            radix: 1,
            'vars-on-top': 0,
            'wrap-iife': [2, 'inside'],
            yoda: 2,

            // Strict
            strict: [0, 'function'],

            // Variables
            'init-declarations': [0, 'always'],
            'no-delete-var': 2,
            'no-label-var': 2,
            'no-shadow-restricted-names': 2,
            'no-shadow': 0,
            'no-undefined': 1,
            'no-unused-vars': [1, {varsIgnorePattern: '^_'}],
            'no-use-before-define': 0,

            // Style
            'array-bracket-spacing': [2, 'never'],
            'block-spacing': [2, 'always'],
            'brace-style': [2, 'stroustrup', {allowSingleLine: false}],
            camelcase: [2, {properties: 'never'}],
            'comma-spacing': [2, {before: false, after: true}],
            'comma-style': [2, 'last'],
            'computed-property-spacing': [2, 'never'],
            'consistent-this': [2, 'that'],
            'eol-last': 2,
            'func-names': 0,
            'func-style': 0,
            'id-length': 0,
            'id-match': 0,
            indent: [2, 4, {SwitchCase: 0, VariableDeclarator: 2}],
            'jsx-quotes': [2, 'prefer-single'],
            'key-spacing': [2, {beforeColon: false, afterColon: true, mode: 'strict'}],
            'lines-around-comment': 2,
            'linebreak-style': 0,
            'max-nested-callbacks': [1, 5],
            'new-cap': 2,
            'new-parens': 2,
            'newline-after-var': [0, 'always'],
            'no-array-constructor': 2,
            'no-bitwise': 0,
            'no-continue': 0,
            'no-inline-comments': 0,
            'no-lonely-if': 0,
            'no-mixed-spaces-and-tabs': 2,
            'no-multiple-empty-lines': [1, {max: 2}],
            'no-negated-condition': 0,
            'no-nested-ternary': 2,
            'no-new-object': 2,
            'no-plusplus': 0,
            'no-restricted-syntax': 0,
            'no-spaced-func': 2,
            'no-ternary': 0,
            'no-trailing-spaces': [2, {skipBlankLines: true}],
            'no-underscore-dangle': 0,
            'no-unneeded-ternary': [2, {defaultAssignment: false}],
            'object-curly-spacing': [2, 'never'],
            'operator-assignment': [2, 'always'],
            'operator-linebreak': [2, 'after'],
            'quote-props': [2, 'as-needed', {numbers: true}],
            quotes: [2, 'single', 'avoid-escape'],
            'require-jsdoc': 0,
            'semi-spacing': [2, {before: false, after: true}],
            semi: [2, 'never'],
            'sort-vars': 0,
            'space-before-blocks': [2, 'always'],
            'space-before-function-paren': [2, 'never'],
            'space-in-parens': [2, 'never'],
            'space-infix-ops': 2,
            'space-unary-ops': [2, {words: true, nonwords: false}],
            'spaced-comment': [1, 'always', {exceptions: ['/']}],
            'wrap-regex': 0,

            // Node.js / Common.js
            'callback-return': 1,
            'global-require': 0,
            'handle-callback-err': 1,
            'no-mixed-requires': [0, {grouping: true}],
            'no-new-require': 2,
            'no-path-concat': 2,
            'no-process-exit': 0,
            'no-restricted-modules': 0,
            'no-sync': 0,
            'no-async-promise-executor': 0,
        },
    },
    {
    languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
    },
)
