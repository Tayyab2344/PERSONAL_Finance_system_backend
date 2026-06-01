import express from 'express';
import * as authController from './controllers/authController.js';
import * as financeController from './controllers/financeController.js';
import * as chatController from './controllers/chatController.js';
import * as analyticsController from './controllers/analyticsController.js';
import { authMiddleware } from './middleware/auth.js';
import { generalLimiter, authLimiter } from './middleware/rateLimiter.js';

const router = express.Router();

// Apply general rate limiting to all API routes
router.use(generalLimiter);

// Health Check
router.get('/health', (req, res) => res.json({ status: "OK", timestamp: new Date() }));

// Authentication Routes
router.post('/auth/register', authLimiter, authController.register);
router.post('/auth/login', authLimiter, authController.login);
router.get('/auth/me', authMiddleware, authController.getMe);
router.post('/auth/change-password', authMiddleware, authLimiter, authController.changePassword);

// Finance Routes
router.get('/finance/summary', authMiddleware, financeController.getDashboardSummary);
router.post('/finance/income', authMiddleware, financeController.addIncome);
router.get('/finance/income', authMiddleware, financeController.getIncomes);
router.post('/finance/expense', authMiddleware, financeController.addExpense);
router.get('/finance/expense', authMiddleware, financeController.getExpenses);
router.delete('/finance/expense/:id', authMiddleware, financeController.deleteExpense);
router.get('/finance/goals', authMiddleware, financeController.getSavingGoals);
router.post('/finance/goals', authMiddleware, financeController.addSavingGoal);
router.post('/finance/goals/contribution', authMiddleware, financeController.addGoalContribution);
router.get('/finance/goals/:goalId/contributions', authMiddleware, financeController.getGoalContributions);
router.get('/finance/predictions', authMiddleware, financeController.getPredictions);
router.get('/finance/insights', authMiddleware, financeController.getInsights);
router.post('/finance/budget', authMiddleware, financeController.upsertBudget);
router.post('/finance/reset', authMiddleware, financeController.resetData);
router.get('/finance/analytics/dashboard', authMiddleware, analyticsController.getAnalyticsDashboard);
router.post('/finance/analytics/seed', authMiddleware, analyticsController.seedMockData);

// Chat Routes
router.post('/chat/message', authMiddleware, chatController.sendMessage);
router.post('/chat/confirm', authMiddleware, chatController.confirmAction);
router.get('/chat/history', authMiddleware, chatController.getHistory);

export default router;
