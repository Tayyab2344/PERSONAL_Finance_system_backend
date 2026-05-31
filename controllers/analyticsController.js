import { db } from '../config/database.js';
import { analyticsService } from '../services/analyticsService.js';

export const getAnalyticsDashboard = async (req, res) => {
  const userId = req.user.id;
  try {
    const data = await analyticsService.getAnalytics(userId);
    res.json(data);
  } catch (error) {
    console.error("Get analytics dashboard error:", error);
    res.status(500).json({ error: "Failed to retrieve analytics dashboard." });
  }
};

export const seedMockData = async (req, res) => {
  const userId = req.user.id;
  try {
    // 1. Clear previous data for this user
    await db.clearUserData(userId);

    // Helper to format YYYY-MM and YYYY-MM-DD
    const getMonthKey = (offsetMonths) => {
      const d = new Date();
      d.setMonth(d.getMonth() - offsetMonths);
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      return `${y}-${m}`;
    };

    const getDateStr = (offsetMonths, day) => {
      const key = getMonthKey(offsetMonths);
      return `${key}-${day.toString().padStart(2, '0')}`;
    };

    const getTimestampStr = (offsetMonths, day, hour) => {
      const datePart = getDateStr(offsetMonths, day);
      return `${datePart}T${hour.toString().padStart(2, '0')}:00:00.000Z`;
    };

    const m0 = 0; // current month
    const m1 = 1; // last month
    const m2 = 2; // 2 months ago

    // 2. Add Incomes
    // Month 2 (2 months ago)
    await db.addIncome(userId, "Salary", 75000, getDateStr(m2, 1));
    await db.addIncome(userId, "Freelancing", 15000, getDateStr(m2, 15));

    // Month 1 (1 month ago)
    await db.addIncome(userId, "Salary", 75000, getDateStr(m1, 1));
    await db.addIncome(userId, "Freelancing", 20000, getDateStr(m1, 12));

    // Month 0 (current month)
    await db.addIncome(userId, "Salary", 75000, getDateStr(m0, 1));
    await db.addIncome(userId, "Freelancing", 18000, getDateStr(m0, 14));

    // 3. Add Budgets (savings targets)
    await db.upsertBudget(userId, getMonthKey(m2), 25000);
    await db.upsertBudget(userId, getMonthKey(m1), 25000);
    await db.upsertBudget(userId, getMonthKey(m0), 30000);

    // 4. Add Goals
    const laptopGoal = await db.addSavingGoal(userId, "Gaming Laptop", 150000, 60000, getDateStr(-6, 30)); // target 6 months out
    const vacationGoal = await db.addSavingGoal(userId, "Winter Vacation", 50000, 40000, getDateStr(-2, 15)); // target 2 months out

    // 5. Add Goal Contributions
    await db.addGoalContribution(userId, laptopGoal.id, 15000, getDateStr(m2, 5));
    await db.addGoalContribution(userId, vacationGoal.id, 10000, getDateStr(m2, 6));

    await db.addGoalContribution(userId, laptopGoal.id, 15000, getDateStr(m1, 5));
    await db.addGoalContribution(userId, vacationGoal.id, 15000, getDateStr(m1, 8));

    await db.addGoalContribution(userId, laptopGoal.id, 15000, getDateStr(m0, 5));
    await db.addGoalContribution(userId, vacationGoal.id, 15000, getDateStr(m0, 8));

    // 6. Add Expenses
    // Rent & Utility Bills (Bills category) - occurs monthly
    for (const offset of [m2, m1, m0]) {
      await db.addExpense(userId, "Bills", 25000, "Monthly House Rent", getDateStr(offset, 2), getTimestampStr(offset, 2, 10));
      await db.addExpense(userId, "Bills", 4500, "Electricity Bill", getDateStr(offset, 4), getTimestampStr(offset, 4, 11));
      await db.addExpense(userId, "Bills", 2500, "StormFiber Internet", getDateStr(offset, 10), getTimestampStr(offset, 10, 15)); // Recurring Candidate!
      await db.addExpense(userId, "Other", 1500, "Netflix subscription", getDateStr(offset, 3), getTimestampStr(offset, 3, 9));   // Recurring Candidate!
    }

    // Groceries (Food category)
    for (const offset of [m2, m1, m0]) {
      await db.addExpense(userId, "Food", 8000, "Monthly Grocery Store", getDateStr(offset, 4), getTimestampStr(offset, 4, 12));
      await db.addExpense(userId, "Food", 1200, "Dinner with family", getDateStr(offset, 15), getTimestampStr(offset, 15, 20));
      await db.addExpense(userId, "Food", 600, "Lunch cafe", getDateStr(offset, 22), getTimestampStr(offset, 22, 13));
    }

    // Fuel (Fuel category)
    for (const offset of [m2, m1, m0]) {
      await db.addExpense(userId, "Fuel", 3000, "Car Fuel Refill", getDateStr(offset, 7), getTimestampStr(offset, 7, 18));
      await db.addExpense(userId, "Fuel", 3000, "Car Fuel Refill", getDateStr(offset, 14), getTimestampStr(offset, 14, 17));
      await db.addExpense(userId, "Fuel", 3000, "Car Fuel Refill", getDateStr(offset, 21), getTimestampStr(offset, 21, 18));
    }

    // Education (Education category)
    for (const offset of [m2, m1, m0]) {
      await db.addExpense(userId, "Education", 2500, "Online course subscription", getDateStr(offset, 5), getTimestampStr(offset, 5, 14));
    }

    // Shopping (Shopping category)
    // Month 2 Shopping
    await db.addExpense(userId, "Shopping", 6000, "Clothes shopping", getDateStr(m2, 10), getTimestampStr(m2, 10, 16));
    // Month 1 Shopping
    await db.addExpense(userId, "Shopping", 5000, "Winter Shoes", getDateStr(m1, 11), getTimestampStr(m1, 11, 15));
    // Month 0 Shopping (spree to trigger impulse spike!)
    await db.addExpense(userId, "Shopping", 18500, "New Smartphone & Accessories", getDateStr(m0, 12), getTimestampStr(m0, 12, 19)); // Impulse buy!

    // Entertainment (Entertainment category) - weekend patterns (occurring Friday / Saturday evenings)
    // Month 2
    await db.addExpense(userId, "Entertainment", 2000, "Weekend Cinema", getDateStr(m2, 6), getTimestampStr(m2, 6, 20)); // Evening (8 PM)
    await db.addExpense(userId, "Entertainment", 1500, "Board games cafe", getDateStr(m2, 13), getTimestampStr(m2, 13, 21)); // Evening (9 PM)
    // Month 1
    await db.addExpense(userId, "Entertainment", 2000, "Weekend Cinema", getDateStr(m1, 5), getTimestampStr(m1, 5, 20)); // Evening (8 PM)
    await db.addExpense(userId, "Entertainment", 1800, "Amusement park", getDateStr(m1, 19), getTimestampStr(m1, 19, 19)); // Evening (7 PM)
    // Month 0
    await db.addExpense(userId, "Entertainment", 2000, "Weekend Cinema", getDateStr(m0, 5), getTimestampStr(m0, 5, 20)); // Evening (8 PM)
    await db.addExpense(userId, "Entertainment", 1500, "Bowling alley", getDateStr(m0, 19), getTimestampStr(m0, 19, 21)); // Evening (9 PM)

    res.json({ message: "Mock financial vault seeded successfully with 3 months of data." });
  } catch (error) {
    console.error("Seed mock data error:", error);
    res.status(500).json({ error: "Failed to seed mock financial data: " + error.message });
  }
};
