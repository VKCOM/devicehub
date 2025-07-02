/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import { resolve } from 'node:path'

import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react({ tsDecorators: true }), tsconfigPaths(), svgr()],
  resolve: {
    alias: [{ find: /^@vkontakte\/vkui$/, replacement: '@vkontakte/vkui/dist/cssm' }],
  },
  preview: {
    port: 5173,
  },
  server: {
    proxy: {
      '/proxy-api': {
        target: 'http://localhost:7100',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/proxy-api/, ''),
      },
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
        },
      },
    },
  },
  build: {
    sourcemap: 'inline',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        authMock: resolve(__dirname, 'auth/auth-mock.html'),
        authLdap: resolve(__dirname, 'auth/auth-ldap.html'),
        authOpenid: resolve(__dirname, 'auth/auth-openid.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: ['verbose'],
    setupFiles: './vitest-setup.ts',
    globalSetup: './test-global-setup.ts',
    coverage: {
      reporter: ['html'],
      include: ['src/**/*'],
      exclude: ['**/*.stories.*'],
    },
  },
})
