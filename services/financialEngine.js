import { db } from '../config/database.js';

export const normalizeAccountType = (type) => {
  if (!type) return 'Cash';
  const clean = type.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (clean.includes('easypaisa') || clean.includes('easy')) return 'EasyPaisa';
  if (clean.includes('jazzcash') || clean.includes('jazz') || clean.includes('jc')) return 'JazzCash';
  if (clean.includes('bank') || clean.includes('card') || clean.includes('hbl') || clean.includes('account')) return 'Bank';
  return 'Cash';
};

export const financialEngine = {
  // Get days helper
  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  },

  getDateDetails(dateString = null) {
    let date = dateString ? new Date(dateString) : new Date();
    if (!dateString) {
      date = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    }
    const year = date.getFullYear();
    const monthInt = date.getMonth() + 1; // 1-12
    const monthStr = monthInt.toString().padStart(2, '0');
    const monthKey = `${year}-${monthStr}`; // YYYY-MM
    const currentDay = date.getDate();
    const totalDays = this.getDaysInMonth(year, monthInt);
    
    return {
      year,
      monthInt,
      monthKey,
      currentDay,
      totalDays
    };
  },

  async calculateSummary(userId, month = null) {
    const { monthKey, currentDay, totalDays } = this.getDateDetails(month ? `${month}-01` : null);
    
    // Get incomes, expenses, budgets, saving goals
    const incomes = await db.getIncomes(userId, monthKey);
    const expenses = await db.getExpenses(userId, monthKey);
    const budgetObj = await db.getBudget(userId, monthKey);
    const goals = await db.getSavingGoals(userId);

    const totalIncome = incomes.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);
    const savingsTarget = budgetObj ? budgetObj.savings_target : 0;
    
    // Available budget after savings target is reserved
    // Spec: "Monthly Income: 50,000 PKR, Savings Target: 20,000 PKR, Available Spending Budget: 30,000 PKR"
    const availableBudget = Math.max(0, totalIncome - savingsTarget);
    
    // Remaining Spending budget after current expenses
    const budgetRemaining = Math.max(0, availableBudget - totalExpenses);

    // Daily Spending Allowance
    // Available Spending Budget remaining / Remaining days
    // If calculating for past month, remaining days is 1. If today is end of month, remaining days is 1.
    const isCurrentMonth = monthKey === this.getDateDetails().monthKey;
    let remainingDays = 1;
    if (isCurrentMonth) {
      remainingDays = Math.max(1, totalDays - this.getDateDetails().currentDay + 1);
    } else {
      // For future months
      const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
      const targetMonthStart = new Date(`${monthKey}-01`);
      if (targetMonthStart > today) {
        remainingDays = totalDays;
      }
    }
    
    const dailySpendingAllowance = remainingDays > 0 ? Math.max(0, budgetRemaining / remainingDays) : 0;

    // Total Savings (Current Goal progress)
    const currentSavings = goals.reduce((sum, g) => sum + g.current_amount, 0);
    const targetSavings = goals.reduce((sum, g) => sum + g.target_amount, 0);
    const savingsProgress = targetSavings > 0 ? Math.min(100, Math.round((currentSavings / targetSavings) * 100)) : 0;

    // Fetch all-time records for wallet balances
    const allIncomes = await db.getIncomes(userId);
    const allExpenses = await db.getExpenses(userId);
    const allTransfers = await db.getTransfers(userId);

    const accountBalances = {
      Cash: 0,
      EasyPaisa: 0,
      JazzCash: 0,
      Bank: 0
    };

    allIncomes.forEach(item => {
      const type = normalizeAccountType(item.account_type);
      if (accountBalances[type] !== undefined) {
        accountBalances[type] += item.amount;
      }
    });

    allExpenses.forEach(item => {
      const type = normalizeAccountType(item.account_type);
      if (accountBalances[type] !== undefined) {
        accountBalances[type] -= item.amount;
      }
    });

    allTransfers.forEach(item => {
      const fromType = normalizeAccountType(item.from_account);
      const toType = normalizeAccountType(item.to_account);
      if (accountBalances[fromType] !== undefined) {
        accountBalances[fromType] -= item.amount;
      }
      if (accountBalances[toType] !== undefined) {
        accountBalances[toType] += item.amount;
      }
    });

    // Make sure we round these to 2 decimal places to avoid float issues
    Object.keys(accountBalances).forEach(key => {
      accountBalances[key] = parseFloat(accountBalances[key].toFixed(2));
    });

    const totalBalance = parseFloat(Object.values(accountBalances).reduce((sum, val) => sum + val, 0).toFixed(2));

    return {
      month: monthKey,
      totalIncome,
      totalExpenses,
      savingsTarget,
      availableBudget,
      budgetRemaining,
      remainingDays,
      dailySpendingAllowance: parseFloat(dailySpendingAllowance.toFixed(2)),
      currentSavings,
      targetSavings,
      savingsProgress,
      goalsCount: goals.length,
      totalBalance,
      accountBalances
    };
  },

  async checkAffordability(userId, amount, itemDescription) {
    const purchaseAmount = parseFloat(amount);
    const summary = await this.calculateSummary(userId);
    
    const remainingBudget = summary.budgetRemaining;
    const totalIncome = summary.totalIncome;
    const totalExpenses = summary.totalExpenses;
    const savingsTarget = summary.savingsTarget;
    
    let recommendation = "Purchase Approved";
    let savingsStatus = "Safe";
    let status = "success"; // success, warning, danger
    let reason = `Your remaining budget is Rs. ${remainingBudget.toLocaleString()}. This purchase fits easily within your allowed spending.`;

    if (remainingBudget >= purchaseAmount) {
      recommendation = "Purchase Approved";
      savingsStatus = "Safe";
      status = "success";
    } else if (totalIncome - totalExpenses - purchaseAmount >= 0) {
      // Fits in total income but cuts into the savings target
      const impact = purchaseAmount - remainingBudget;
      recommendation = "Purchase Warning (Reduces Savings Target)";
      savingsStatus = "At Risk";
      status = "warning";
      reason = `This purchase exceeds your remaining spending budget of Rs. ${remainingBudget.toLocaleString()} by Rs. ${impact.toLocaleString()}. Buying this will reduce your monthly savings target of Rs. ${savingsTarget.toLocaleString()} to Rs. ${(savingsTarget - impact).toLocaleString()}.`;
    } else {
      // Exceeds total monthly income (deficit)
      const deficit = purchaseAmount - (totalIncome - totalExpenses);
      recommendation = "Purchase Denied";
      savingsStatus = "Critically At Risk";
      status = "danger";
      reason = `This purchase will exceed your total income for the month and create a deficit of Rs. ${deficit.toLocaleString()}. It is highly recommended to defer this purchase.`;
    }

    return {
      purchaseAmount,
      itemDescription,
      budgetRemaining: remainingBudget,
      savingsTarget,
      recommendation,
      savingsStatus,
      status,
      reason
    };
  },

  async getPredictions(userId) {
    const { monthKey, currentDay, totalDays } = this.getDateDetails();
    const summary = await this.calculateSummary(userId);
    
    const totalExpenses = summary.totalExpenses;
    const availableBudget = summary.availableBudget;
    const totalIncome = summary.totalIncome;
    const savingsTarget = summary.savingsTarget;

    // Avoid division by zero
    const daysElapsed = Math.max(1, currentDay);
    
    // Average daily spending
    const avgDailySpend = totalExpenses / daysElapsed;
    
    // Forecasted expenses for the end of the month
    const forecastedExpenses = avgDailySpend * totalDays;
    
    // Budget risk assessment
    let riskLevel = "Low";
    let riskStatus = "success";
    let warning = "You are on track to stay within your planned budget.";
    
    if (forecastedExpenses > availableBudget) {
      const overspend = forecastedExpenses - availableBudget;
      riskLevel = "High";
      riskStatus = "danger";
      warning = `Warning: You are projected to exceed your planned budget of Rs. ${availableBudget.toLocaleString()} by Rs. ${Math.round(overspend).toLocaleString()} at your current spending rate.`;
    } else if (forecastedExpenses > availableBudget * 0.85) {
      riskLevel = "Medium";
      riskStatus = "warning";
      warning = "Caution: You are close to your spending limit. Any unplanned expenses could cause you to exceed your budget.";
    }

    // Savings target prediction
    const predictedSavings = Math.max(0, totalIncome - forecastedExpenses);
    let savingsTargetMet = true;
    let savingsStatusMessage = "On track to achieve your savings target.";
    
    if (predictedSavings < savingsTarget) {
      savingsTargetMet = false;
      const shortfall = savingsTarget - predictedSavings;
      savingsStatusMessage = `At your current spending rate, you are likely to save Rs. ${Math.round(predictedSavings).toLocaleString()}, falling Rs. ${Math.round(shortfall).toLocaleString()} short of your Rs. ${savingsTarget.toLocaleString()} target.`;
    }

    // Spending trend analysis
    const budgetUsedPct = availableBudget > 0 ? (totalExpenses / availableBudget) * 100 : 0;
    const monthElapsedPct = (daysElapsed / totalDays) * 100;
    const spendingSpeed = budgetUsedPct > monthElapsedPct + 10 ? "Faster than planned" : (budgetUsedPct < monthElapsedPct - 10 ? "Slower than planned" : "On schedule");

    return {
      avgDailySpend: parseFloat(avgDailySpend.toFixed(2)),
      forecastedExpenses: Math.round(forecastedExpenses),
      availableBudget,
      riskLevel,
      riskStatus,
      warning,
      predictedSavings: Math.round(predictedSavings),
      savingsTarget,
      savingsTargetMet,
      savingsStatusMessage,
      spendingSpeed,
      budgetUsedPct: parseFloat(budgetUsedPct.toFixed(1)),
      monthElapsedPct: parseFloat(monthElapsedPct.toFixed(1))
    };
  },

  async getInsights(userId) {
    const summary = await this.calculateSummary(userId);
    const expenses = await db.getExpenses(userId);
    const goals = await db.getSavingGoals(userId);

    const insights = [];

    // 1. Food Category Check
    const monthExpenses = expenses.filter(e => e.date.substring(0, 7) === summary.month);
    const categoryTotals = {};
    monthExpenses.forEach(e => {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
    });

    const total = summary.totalExpenses;
    if (total > 0) {
      Object.keys(categoryTotals).forEach(cat => {
        const pct = (categoryTotals[cat] / total) * 100;
        if (pct > 30) {
          insights.push({
            type: "warning",
            title: `High ${cat} Spending`,
            message: `${cat} represents ${Math.round(pct)}% (Rs. ${categoryTotals[cat].toLocaleString()}) of your total expenses this month. Consider setting a category limit.`
          });
        }
      });
    }

    // 2. Spending Pace
    const predictions = await this.getPredictions(userId);
    if (predictions.spendingSpeed === "Faster than planned") {
      insights.push({
        type: "danger",
        title: "Fast Spending Rate",
        message: `You are spending faster than planned! You have used ${predictions.budgetUsedPct}% of your budget, but only ${predictions.monthElapsedPct}% of the month has passed.`
      });
    }

    // 3. Savings Goal Suggestions
    if (goals.length === 0) {
      insights.push({
        type: "info",
        title: "No Active Savings Goals",
        message: "You don't have any savings goals yet. Setting a goal (like a laptop or vacation) helps you stay motivated to save."
      });
    } else {
      // Find goals near completion
      goals.forEach(g => {
        const pct = g.target_amount > 0 ? (g.current_amount / g.target_amount) * 100 : 0;
        if (pct >= 80 && pct < 100) {
          const remaining = g.target_amount - g.current_amount;
          insights.push({
            type: "success",
            title: `Goal Near Completion: ${g.goal_name}`,
            message: `You are ${Math.round(pct)}% of the way to your goal! You only need Rs. ${remaining.toLocaleString()} more. Keep it up!`
          });
        }
      });
    }

    // 4. General saving advice based on budget remaining
    if (summary.budgetRemaining > 0) {
      const extraSavings = Math.round(summary.budgetRemaining * 0.5);
      insights.push({
        type: "success",
        title: "Extra Savings Opportunity",
        message: `You have Rs. ${summary.budgetRemaining.toLocaleString()} remaining in your spending budget. Stashing Rs. ${extraSavings.toLocaleString()} into your savings goal today will put you ahead of schedule!`
      });
    } else if (summary.totalIncome > 0 && summary.budgetRemaining <= 0) {
      insights.push({
        type: "danger",
        title: "Budget Exhausted",
        message: "You have spent your entire available spending budget for this month. Avoid any non-essential purchases."
      });
    }

    // If no insights generated, add a generic positive insight
    if (insights.length === 0) {
      insights.push({
        type: "info",
        title: "Financial Position Stable",
        message: "Your expenses are well distributed, and you are on track with your budget. Keep up the good work!"
      });
    }

    return insights;
  }
};
