import nx from '@nx/eslint-plugin';
import prettierConfig from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

// Utility to restrict configs to specific files
const mapConfigsToFiles = (configs, files) => {
  return configs.map((config) => ({
    ...config,
    files,
  }));
};

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist'],
  },

  // TypeScript configs restricted to ts/tsx files
  ...mapConfigsToFiles(
    [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    ['**/*.ts', '**/*.tsx']
  ),

  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.json',
          './apps/gateway/tsconfig.json',
          './apps/gateway/tsconfig.spec.json',
          './packages/database/tsconfig.json',
          './packages/types/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',

      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
    },
  },

  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  // Nx module boundary enforcement
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },

  // General project-wide rules
  {
    rules: {
      'no-console': 'warn',
    },
  },

  // Prettier config must be last to override other formatting rules
  prettierConfig,
];
