import * as Sentry from '@sentry/node'

const DSN = process.env.SENTRY_DSN
const SAMPLE_RATE = Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0
const ENVIRONMENT = process.env.SENTRY_ENVIRONMENT || 'unset'

Sentry.init({
    dsn: DSN,
    environment: ENVIRONMENT,
    // Tracing
    // Add Tracing by setting tracesSampleRate
    // We recommend adjusting this value in production
    tracesSampleRate: SAMPLE_RATE,
    integrations: [
        Sentry.mongoIntegration({
            enhancedDatabaseReporting: true
        })
    ]
})
console.log(`Initialized sentry for environment: ${ENVIRONMENT}`)
if (SAMPLE_RATE === 0) {
    console.warn('Warning: Sentry sample_rate is 0')
}
