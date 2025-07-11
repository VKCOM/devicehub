import {rateLimit} from 'express-rate-limit'
let rateLimitConfig = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 140 * 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req, res) => {
        return req.headers['X-Real-IP'] ? req.headers['X-Real-IP'] : 'localhost'
    }
})
export default rateLimitConfig
