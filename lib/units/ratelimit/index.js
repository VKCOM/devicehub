import {rateLimit} from 'express-rate-limit'
import {clientKey} from './client-key.js'
let rateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 140 * 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: clientKey,
    // The key does not come from X-Forwarded-For, whatever the proxy sends
    validate: {xForwardedForHeader: false}
})
export default rateLimitConfig
