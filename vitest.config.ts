import {defineConfig} from 'vitest/config'

// Dev-only unit test harness. Scoped to pure wire-layer modules so it never
// touches ZMQ, MongoDB or the network. Does not affect the production build
// (tsconfig.node.json) in any way.
export default defineConfig({
    test: {
        include: ['test/unit/**/*.test.ts'],
        environment: 'node',
    },
})
