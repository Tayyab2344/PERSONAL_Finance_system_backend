import { rateLimit } from 'express-rate-limit';

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 500, // Limit each IP to 500 requests per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Too many requests from this IP, please try again after 15 minutes." }
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 15, // Limit each IP to 15 authentication attempts per 15 minutes
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: "Too many login or registration attempts. Please try again after 15 minutes." }
});
