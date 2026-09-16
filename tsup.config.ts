import { defineConfig } from 'tsup'

/**
 * Dual ESM/CJS build with .d.ts. Three independent entry points so the
 * `exports` map can split the heavy optional subpaths (`/sign`, `/react`)
 * from the tree-shakeable core. No barrel files inside subpaths — each
 * entry imports only what it exports (Vercel React best practices 2.1).
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'sign/index': 'src/sign/index.ts',
    'react/index': 'src/react/index.ts',
    'two-phase': 'src/quote/two-phase.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2022',
  platform: 'neutral',
  outExtension: ({ format }) => ({ js: format === 'esm' ? '.js' : '.cjs' }),
  // Keep `react` and `@buildonspark/spark-sdk` external so consumers bundle
  // their own versions and the core stays tiny.
  external: ['react', 'react/jsx-runtime', '@tanstack/react-query', '@buildonspark/spark-sdk'],
  // Node built-ins (crypto) are resolved by the runtime, not bundled.
  noExternal: [],
})
