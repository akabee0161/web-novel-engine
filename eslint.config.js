import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** エンジン全体に共通の禁止 import */
const engineCommon = [
  { group: ['**/novels/**'], message: 'エンジンは特定の作品に依存してはならない' },
  { group: ['**/tools/**'], message: '依存の向きは tools → engine の一方向' },
]

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: engineCommon }],
    },
  },
  // 後の設定オブジェクトが同じルールを上書きするため、共通分を再掲してマージする
  {
    files: ['src/engine/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          ...engineCommon,
          { group: ['**/ui/**'], message: 'core は ui に依存してはならない' },
          {
            group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
            message: 'core は React 非依存でなければならない',
          },
        ],
      }],
    },
  },
  {
    files: ['novels/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['**/src/engine/**'], message: '作品は @engine 以外から import してはならない' },
        ],
      }],
    },
  },
)
