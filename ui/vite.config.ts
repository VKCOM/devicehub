/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'
import react from '@vitejs/plugin-react-swc'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [react(), tsconfigPaths(), svgr()],
  resolve: {
    alias: [{ find: /^@vkontakte\/vkui$/, replacement: '@vkontakte/vkui/dist/cssm' }],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    reporters: ['verbose'],
    setupFiles: './vitest-setup.ts',
    coverage: {
      reporter: ['html'],
      include: ['src/**/*'],
      exclude: ['**/*.stories.*'],
    },
  },
})
