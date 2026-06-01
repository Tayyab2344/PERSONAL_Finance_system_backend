import { db } from '../config/database.js';
import { financialEngine, normalizeAccountType } from '../services/financialEngine.js';

export const getDashboardSummary = async (req, res) => {
  const userId = req.user.id;
  const { month } = req.query; // YYYY-MM
  try {
    const summary = await financialEngine.calculateSummary(userId, month);
    res.json(summary);
  } catch (error) {
    console.error("Dashboard summary error:", error);
    res.status(500).json({ error: "Failed to retrieve dashboard summary." });
  }
};

export const addIncome = async (req, res) => {
  const userId = req.user.id;
  const { source, amount, date, account_type } = req.body;
  
  if (!source || amount === undefined) {
    return res.status(400).json({ error: "Source and amount are required." });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Income amount must be a positive number." });
  }

  try {
    const normalizedAccount = normalizeAccountType(account_type);
    const income = await db.addIncome(userId, source, parsedAmount, date, normalizedAccount);
    await db.addAuditLog(userId, 'ADD_INCOME', `Added income: ${source}, amount: ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    res.status(201).json(income);
  } catch (error) {
    console.error("Add income error:", error);
    res.status(500).json({ error: "Failed to add income." });
  }
};

export const getIncomes = async (req, res) => {
  const userId = req.user.id;
  const { month } = req.query; // YYYY-MM
  try {
    const list = await db.getIncomes(userId, month);
    res.json(list);
  } catch (error) {
    console.error("Get incomes error:", error);
    res.status(500).json({ error: "Failed to retrieve incomes." });
  }
};

export const addExpense = async (req, res) => {
  const userId = req.user.id;
  const { category, amount, description, date, account_type } = req.body;

  if (!category || amount === undefined) {
    return res.status(400).json({ error: "Category and amount are required." });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Expense amount must be a positive number." });
  }

  const validCategories = ['Food', 'Fuel', 'Transport', 'Education', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
  }

  try {
    const normalizedAccount = normalizeAccountType(account_type);
    const expense = await db.addExpense(userId, category, parsedAmount, description, date, null, normalizedAccount);
    await db.addAuditLog(userId, 'ADD_EXPENSE', `Added expense under ${category}: amount ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    res.status(201).json(expense);
  } catch (error) {
    console.error("Add expense error:", error);
    res.status(500).json({ error: "Failed to add expense." });
  }
};

export const getExpenses = async (req, res) => {
  const userId = req.user.id;
  const { month } = req.query; // YYYY-MM
  try {
    const list = await db.getExpenses(userId, month);
    res.json(list);
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to retrieve expenses." });
  }
};

export const deleteExpense = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const deleted = await db.deleteExpense(userId, id);
    if (!deleted) {
      return res.status(404).json({ error: "Expense not found or access denied." });
    }
    await db.addAuditLog(userId, 'DELETE_EXPENSE', `Deleted expense ID ${id}`, req.ip);
    res.json({ message: "Expense deleted successfully." });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: "Failed to delete expense." });
  }
};

export const updateExpense = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { category, amount, description, date, account_type } = req.body;

  if (!category || amount === undefined) {
    return res.status(400).json({ error: "Category and amount are required." });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Expense amount must be a positive number." });
  }

  const validCategories = ['Food', 'Fuel', 'Transport', 'Education', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
  if (!validCategories.includes(category)) {
    return res.status(400).json({ error: `Invalid category. Must be one of: ${validCategories.join(', ')}` });
  }

  try {
    const normalizedAccount = normalizeAccountType(account_type);
    const expense = await db.updateExpense(userId, id, category, parsedAmount, description, date, normalizedAccount);
    if (!expense) {
      return res.status(404).json({ error: "Expense not found or access denied." });
    }
    await db.addAuditLog(userId, 'UPDATE_EXPENSE', `Updated expense ID ${id} under ${category}: amount ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    res.json(expense);
  } catch (error) {
    console.error("Update expense error:", error);
    res.status(500).json({ error: "Failed to update expense." });
  }
};

export const updateIncome = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  const { source, amount, date, account_type } = req.body;

  if (!source || amount === undefined) {
    return res.status(400).json({ error: "Source and amount are required." });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Income amount must be a positive number." });
  }

  try {
    const normalizedAccount = normalizeAccountType(account_type);
    const income = await db.updateIncome(userId, id, source, parsedAmount, date, normalizedAccount);
    if (!income) {
      return res.status(404).json({ error: "Income not found or access denied." });
    }
    await db.addAuditLog(userId, 'UPDATE_INCOME', `Updated income ID ${id}: ${source}, amount: ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    res.json(income);
  } catch (error) {
    console.error("Update income error:", error);
    res.status(500).json({ error: "Failed to update income." });
  }
};

export const deleteIncome = async (req, res) => {
  const userId = req.user.id;
  const { id } = req.params;
  try {
    const deleted = await db.deleteIncome(userId, id);
    if (!deleted) {
      return res.status(404).json({ error: "Income not found or access denied." });
    }
    await db.addAuditLog(userId, 'DELETE_INCOME', `Deleted income ID ${id}`, req.ip);
    res.json({ message: "Income deleted successfully." });
  } catch (error) {
    console.error("Delete income error:", error);
    res.status(500).json({ error: "Failed to delete income." });
  }
};

export const getSavingGoals = async (req, res) => {
  const userId = req.user.id;
  try {
    const list = await db.getSavingGoals(userId);
    res.json(list);
  } catch (error) {
    console.error("Get saving goals error:", error);
    res.status(500).json({ error: "Failed to retrieve saving goals." });
  }
};

export const addSavingGoal = async (req, res) => {
  const userId = req.user.id;
  const { goal_name, target_amount, current_amount, target_date } = req.body;

  if (!goal_name || !target_amount || !target_date) {
    return res.status(400).json({ error: "Goal name, target amount, and target date are required." });
  }

  const parsedTarget = parseFloat(target_amount);
  if (isNaN(parsedTarget) || parsedTarget <= 0) {
    return res.status(400).json({ error: "Target amount must be a positive number." });
  }

  const parsedCurrent = parseFloat(current_amount || 0);
  if (isNaN(parsedCurrent) || parsedCurrent < 0) {
    return res.status(400).json({ error: "Current saved amount cannot be negative." });
  }

  try {
    const goal = await db.addSavingGoal(userId, goal_name, parsedTarget, parsedCurrent, target_date);
    await db.addAuditLog(userId, 'ADD_SAVINGS_GOAL', `Created goal: ${goal_name}, target: ${parsedTarget}`, req.ip);
    res.status(201).json(goal);
  } catch (error) {
    console.error("Add saving goal error:", error);
    res.status(500).json({ error: "Failed to add saving goal." });
  }
};

export const addGoalContribution = async (req, res) => {
  const userId = req.user.id;
  const { goal_id, amount, date } = req.body;

  if (!goal_id || amount === undefined) {
    return res.status(400).json({ error: "Goal ID and contribution amount are required." });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Contribution amount must be a positive number." });
  }

  try {
    const result = await db.addGoalContribution(userId, goal_id, parsedAmount, date);
    await db.addAuditLog(userId, 'ADD_GOAL_CONTRIBUTION', `Contributed ${parsedAmount} to goal ID ${goal_id}`, req.ip);
    res.status(201).json(result);
  } catch (error) {
    console.error("Add goal contribution error:", error);
    res.status(500).json({ error: error.message || "Failed to add goal contribution." });
  }
};

export const getGoalContributions = async (req, res) => {
  const userId = req.user.id;
  const { goalId } = req.params;
  try {
    const list = await db.getGoalContributions(userId, goalId);
    res.json(list);
  } catch (error) {
    console.error("Get contributions error:", error);
    res.status(500).json({ error: "Failed to retrieve goal contributions." });
  }
};

export const getPredictions = async (req, res) => {
  const userId = req.user.id;
  try {
    const predictions = await financialEngine.getPredictions(userId);
    res.json(predictions);
  } catch (error) {
    console.error("Get predictions error:", error);
    res.status(500).json({ error: "Failed to generate financial predictions." });
  }
};

export const getInsights = async (req, res) => {
  const userId = req.user.id;
  try {
    const insights = await financialEngine.getInsights(userId);
    res.json(insights);
  } catch (error) {
    console.error("Get insights error:", error);
    res.status(500).json({ error: "Failed to generate financial insights." });
  }
};

export const upsertBudget = async (req, res) => {
  const userId = req.user.id;
  const { month, savings_target } = req.body;

  if (!month || savings_target === undefined) {
    return res.status(400).json({ error: "Month (YYYY-MM) and savings target are required." });
  }

  const parsedTarget = parseFloat(savings_target);
  if (isNaN(parsedTarget) || parsedTarget < 0) {
    return res.status(400).json({ error: "Savings target must be zero or a positive number." });
  }

  try {
    const budget = await db.upsertBudget(userId, month, parsedTarget);
    await db.addAuditLog(userId, 'SET_SAVINGS_TARGET', `Set savings target for ${month}: ${parsedTarget}`, req.ip);
    res.json(budget);
  } catch (error) {
    console.error("Upsert budget error:", error);
    res.status(500).json({ error: "Failed to set savings target." });
  }
};

export const resetData = async (req, res) => {
  const userId = req.user.id;
  try {
    await db.clearUserData(userId);
    await db.addAuditLog(userId, 'RESET_USER_DATA', `Cleared all personal financial data`, req.ip);
    res.json({ message: "All financial data has been reset to Rs. 0." });
  } catch (error) {
    console.error("Reset data error:", error);
    res.status(500).json({ error: "Failed to reset user financial data." });
  }
};
