import rateLimit from "express-rate-limit";

/**
 * In-memory rate limiting. Fine for a single API instance; if this service
 * ever runs with more than one replica, swap the store for a shared one
 * (e.g. `rate-limit-redis`) so limits are enforced across instances.
 */

/** Login: generous enough for real mistakes, tight enough to slow credential stuffing. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please try again later." },
});

/** Self-registration: prevent scripted mass account creation. */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again later." },
});

/** Forgot-password: prevent email/SMS bombing and account enumeration probing. */
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please try again later." },
});

/** 2FA code verification: a code is only 10^6 possibilities, so throttle guesses hard. */
export const twoFactorRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification attempts. Please try again later." },
});
