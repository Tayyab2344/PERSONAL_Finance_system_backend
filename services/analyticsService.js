import { db } from '../config/database.js';

export const analyticsService = {
  // Helper to get days in a month
  getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
  },

  // Helper to parse dates and return details
  getDateDetails(dateStr = null) {
    const date = dateStr ? new Date(dateStr) : new Date();
    const year = date.getFullYear();
    const monthInt = date.getMonth() + 1;
    const monthStr = monthInt.toString().padStart(2, '0');
    const monthKey = `${year}-${monthStr}`;
    const day = date.getDate();
    const totalDays = this.getDaysInMonth(year, monthInt);
    
    // Day of week name
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[date.getDay()];

    return {
      year,
      monthInt,
      monthStr,
      monthKey,
      day,
      totalDays,
      dayOfWeek
    };
  },

  // Core analytics engine
  async getAnalytics(userId) {
    const systemDetails = this.getDateDetails();
    const currentMonth = systemDetails.monthKey;
    const currentYear = systemDetails.year;
    const currentDay = systemDetails.day;
    const totalDaysInMonth = systemDetails.totalDays;

    // Fetch all user records
    const allExpenses = await db.getExpenses(userId);
    const allIncomes = await db.getIncomes(userId);
    const goals = await db.getSavingGoals(userId);
    const budgets = await db.getBudgets ? await db.getBudgets(userId) : [];

    // 1. FILTER FOR CURRENT MONTH
    const thisMonthExpenses = allExpenses.filter(e => e.date.substring(0, 7) === currentMonth);
    const thisMonthIncomes = allIncomes.filter(i => i.date.substring(0, 7) === currentMonth);
    const currentBudgetObj = budgets.find(b => b.month === currentMonth);
    const savingsTarget = currentBudgetObj ? parseFloat(currentBudgetObj.savings_target) : 0;

    const totalIncome = thisMonthIncomes.reduce((sum, i) => sum + parseFloat(i.amount), 0);
    const totalExpenses = thisMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    // Net savings this month (Income - Expenses)
    const netSavings = Math.max(0, totalIncome - totalExpenses);
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0;

    // Available spending budget = Income - Savings Target
    const availableBudget = Math.max(0, totalIncome - savingsTarget);
    const budgetRemaining = availableBudget - totalExpenses;

    // Daily spending stats
    const todayStr = new Date().toISOString().split('T')[0];
    const todayExpenses = thisMonthExpenses.filter(e => e.date === todayStr);
    const todaySpending = todayExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);

    const daysElapsed = Math.max(1, currentDay);
    const dailyAverage = totalExpenses / daysElapsed;

    // Group expenses by day to find Highest/Lowest spending days
    const dailyExpensesMap = {};
    thisMonthExpenses.forEach(e => {
      dailyExpensesMap[e.date] = (dailyExpensesMap[e.date] || 0) + parseFloat(e.amount);
    });

    let highestSpendingDay = { date: 'N/A', amount: 0 };
    let lowestSpendingDay = { date: 'N/A', amount: 999999999 };

    const dailyExpenseKeys = Object.keys(dailyExpensesMap);
    if (dailyExpenseKeys.length > 0) {
      dailyExpenseKeys.forEach(date => {
        const amt = dailyExpensesMap[date];
        if (amt > highestSpendingDay.amount) {
          highestSpendingDay = { date, amount: amt };
        }
        if (amt < lowestSpendingDay.amount) {
          lowestSpendingDay = { date, amount: amt };
        }
      });
    } else {
      lowestSpendingDay.amount = 0;
    }

    // Daily spending trend chart data for current month (last 15 days)
    const last15DaysData = [];
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const amt = dailyExpensesMap[dStr] || 0;
      last15DaysData.push({ date: label, amount: amt });
    }

    // 2. CATEGORY ANALYTICS WITH PREVIOUS MONTH COMPARISON
    const prevMonthDate = new Date();
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthKey = prevMonthDate.toISOString().substring(0, 7);
    const prevMonthExpenses = allExpenses.filter(e => e.date.substring(0, 7) === prevMonthKey);

    const categories = ['Food', 'Fuel', 'Transport', 'Education', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
    const categoryAnalytics = categories.map(cat => {
      const currentAmt = thisMonthExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const prevAmt = prevMonthExpenses.filter(e => e.category === cat).reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const pctOfTotal = totalExpenses > 0 ? (currentAmt / totalExpenses) * 100 : 0;
      
      let trendPct = 0;
      let trendDirection = 'stable';
      
      if (prevAmt > 0) {
        trendPct = ((currentAmt - prevAmt) / prevAmt) * 100;
        trendDirection = trendPct > 2 ? 'up' : (trendPct < -2 ? 'down' : 'stable');
      } else if (currentAmt > 0) {
        trendPct = 100;
        trendDirection = 'up';
      }

      return {
        category: cat,
        amount: currentAmt,
        percentage: parseFloat(pctOfTotal.toFixed(1)),
        trendPct: parseFloat(trendPct.toFixed(1)),
        trendDirection
      };
    });

    // 3. TIME-BASED ANALYTICS
    // Weekly Analysis (current month)
    const weeklySpending = [0, 0, 0, 0]; // Weeks 1, 2, 3, 4
    thisMonthExpenses.forEach(e => {
      const dateVal = new Date(e.date).getDate();
      if (dateVal <= 7) weeklySpending[0] += parseFloat(e.amount);
      else if (dateVal <= 14) weeklySpending[1] += parseFloat(e.amount);
      else if (dateVal <= 21) weeklySpending[2] += parseFloat(e.amount);
      else weeklySpending[3] += parseFloat(e.amount);
    });

    let highestSpendingWeek = 1;
    let lowestSpendingWeek = 1;
    let maxWeekAmt = -1;
    let minWeekAmt = 999999999;
    
    weeklySpending.forEach((amt, index) => {
      if (amt > maxWeekAmt) {
        maxWeekAmt = amt;
        highestSpendingWeek = index + 1;
      }
      if (amt < minWeekAmt) {
        minWeekAmt = amt;
        lowestSpendingWeek = index + 1;
      }
    });
    if (maxWeekAmt === 0) {
      lowestSpendingWeek = 0;
      highestSpendingWeek = 0;
      minWeekAmt = 0;
    }

    const elapsedWeeks = Math.max(1, Math.min(4, Math.ceil(currentDay / 7)));
    const weeklyAverage = totalExpenses / elapsedWeeks;

    // Monthly Analysis (last 4 months)
    const last4Months = [];
    for (let i = 3; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mKey = d.toISOString().substring(0, 7);
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      const mExpenses = allExpenses.filter(e => e.date.substring(0, 7) === mKey).reduce((sum, e) => sum + parseFloat(e.amount), 0);
      const mIncomes = allIncomes.filter(i => i.date.substring(0, 7) === mKey).reduce((sum, i) => sum + parseFloat(i.amount), 0);
      const mSavings = Math.max(0, mIncomes - mExpenses);
      
      last4Months.push({ monthKey: mKey, label, expenses: mExpenses, income: mIncomes, savings: mSavings });
    }

    // Compute growth rates for current month vs previous month
    let spendingGrowth = 0;
    let savingsGrowth = 0;
    let incomeGrowth = 0;
    if (last4Months[2].expenses > 0) spendingGrowth = ((last4Months[3].expenses - last4Months[2].expenses) / last4Months[2].expenses) * 100;
    else if (last4Months[3].expenses > 0) spendingGrowth = 100;

    if (last4Months[2].savings > 0) savingsGrowth = ((last4Months[3].savings - last4Months[2].savings) / last4Months[2].savings) * 100;
    else if (last4Months[3].savings > 0) savingsGrowth = 100;

    if (last4Months[2].income > 0) incomeGrowth = ((last4Months[3].income - last4Months[2].income) / last4Months[2].income) * 100;
    else if (last4Months[3].income > 0) incomeGrowth = 100;

    // Yearly Analysis
    const yearsGrouped = {};
    allExpenses.forEach(e => {
      const yr = e.date.substring(0, 4);
      if (!yearsGrouped[yr]) yearsGrouped[yr] = { year: yr, income: 0, expenses: 0, savings: 0, monthlyNet: {} };
      yearsGrouped[yr].expenses += parseFloat(e.amount);
    });
    allIncomes.forEach(i => {
      const yr = i.date.substring(0, 4);
      if (!yearsGrouped[yr]) yearsGrouped[yr] = { year: yr, income: 0, expenses: 0, savings: 0, monthlyNet: {} };
      yearsGrouped[yr].income += parseFloat(i.amount);
    });

    Object.keys(yearsGrouped).forEach(yr => {
      yearsGrouped[yr].savings = Math.max(0, yearsGrouped[yr].income - yearsGrouped[yr].expenses);
      
      // Calculate best/worst months for the year
      const yrExpenses = allExpenses.filter(e => e.date.substring(0, 4) === yr);
      const yrIncomes = allIncomes.filter(i => i.date.substring(0, 4) === yr);
      
      const months = Array.from({ length: 12 }, (_, index) => (index + 1).toString().padStart(2, '0'));
      let bestMonth = { name: 'N/A', net: -99999999 };
      let worstMonth = { name: 'N/A', net: 99999999 };
      
      months.forEach(m => {
        const mKey = `${yr}-${m}`;
        const label = new Date(`${mKey}-02`).toLocaleDateString('en-US', { month: 'long' });
        const mExp = yrExpenses.filter(e => e.date.substring(0, 7) === mKey).reduce((sum, e) => sum + parseFloat(e.amount), 0);
        const mInc = yrIncomes.filter(i => i.date.substring(0, 7) === mKey).reduce((sum, i) => sum + parseFloat(i.amount), 0);
        const net = mInc - mExp;

        // Only evaluate if there was some financial activity
        if (mExp > 0 || mInc > 0) {
          if (net > bestMonth.net) bestMonth = { name: label, net };
          if (net < worstMonth.net) worstMonth = { name: label, net };
        }
      });
      
      yearsGrouped[yr].bestMonth = bestMonth.name;
      yearsGrouped[yr].worstMonth = worstMonth.name;
    });

    const yearlyData = Object.values(yearsGrouped).sort((a, b) => b.year.localeCompare(a.year));

    // 4. BUDGET INTELLIGENCE
    // Budget Burn Rate
    const monthProgressPct = parseFloat(((currentDay / totalDaysInMonth) * 100).toFixed(1));
    const budgetUsedPct = availableBudget > 0 ? parseFloat(((totalExpenses / availableBudget) * 100).toFixed(1)) : 0;
    
    let burnRateWarning = "You are spending at a sustainable pace.";
    let burnRateStatus = "success";
    if (budgetUsedPct > monthProgressPct + 15) {
      burnRateWarning = "Warning: You are consuming your budget too quickly.";
      burnRateStatus = "danger";
    } else if (budgetUsedPct > monthProgressPct + 5) {
      burnRateWarning = "Caution: You are spending slightly faster than planned.";
      burnRateStatus = "warning";
    }

    // Safe Spending Limit
    const remainingDays = Math.max(1, totalDaysInMonth - currentDay + 1);
    const safeDailyLimit = Math.max(0, budgetRemaining) / remainingDays;

    // Budget Health Score Calculation
    let healthScore = 100;
    const deductions = [];

    // Factor A: Savings target shortfall (Max 30 pts)
    if (savingsTarget > 0) {
      const activeSavings = totalIncome - totalExpenses;
      if (activeSavings < savingsTarget) {
        const shortfall = savingsTarget - activeSavings;
        const shortfallPct = shortfall / savingsTarget;
        const pts = Math.min(30, Math.round(shortfallPct * 30));
        healthScore -= pts;
        deductions.push(`Savings Target Shortfall: -${pts} pts`);
      }
    }

    // Factor B: Expense growth vs previous month (Max 20 pts)
    const prevMonthTotalExpenses = prevMonthExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
    if (prevMonthTotalExpenses > 0 && totalExpenses > prevMonthTotalExpenses) {
      const expGrowthPct = (totalExpenses - prevMonthTotalExpenses) / prevMonthTotalExpenses;
      const pts = Math.min(20, Math.round(expGrowthPct * 20));
      healthScore -= pts;
      deductions.push(`Expense Inflation: -${pts} pts`);
    }

    // Factor C: Budget Discipline (Deficits) (Max 30 pts)
    if (budgetRemaining < 0) {
      healthScore -= 30;
      deductions.push(`Overspent Available Budget: -30 pts`);
    }

    // Factor D: Spending Volatility (Mean Daily Variance) (Max 20 pts)
    if (thisMonthExpenses.length > 2) {
      // Calculate standard deviation of daily spending amounts
      const dailySpendingValues = Object.values(dailyExpensesMap);
      const mean = dailySpendingValues.reduce((sum, val) => sum + val, 0) / dailySpendingValues.length;
      const variance = dailySpendingValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / dailySpendingValues.length;
      const stdDev = Math.sqrt(variance);
      const coefOfVariation = mean > 0 ? stdDev / mean : 0;
      
      // Volatility penalty if CV > 1.2 (highly erratic shopping spikes)
      if (coefOfVariation > 1.2) {
        const pts = Math.min(20, Math.round((coefOfVariation - 1.2) * 15));
        healthScore -= pts;
        deductions.push(`High Spending Volatility: -${pts} pts`);
      }
    }

    healthScore = Math.max(0, healthScore);

    // 5. PATTERN DETECTION
    // Day Pattern (Weekend vs Weekday average)
    let dayPatternMessage = "Your spending is evenly distributed throughout the week.";
    const weekdaySpendingMap = { Monday: [], Tuesday: [], Wednesday: [], Thursday: [], Friday: [], Saturday: [], Sunday: [] };
    
    // Group all historical expenses by day name
    allExpenses.forEach(e => {
      const dayName = new Date(e.date).toLocaleDateString('en-US', { weekday: 'long' });
      if (weekdaySpendingMap[dayName]) {
        weekdaySpendingMap[dayName].push(parseFloat(e.amount));
      }
    });

    const dayAverages = {};
    let highestDayName = 'Monday';
    let highestDayAvg = 0;

    Object.keys(weekdaySpendingMap).forEach(day => {
      const list = weekdaySpendingMap[day];
      const sum = list.reduce((s, val) => s + val, 0);
      const avg = list.length > 0 ? sum / list.length : 0;
      dayAverages[day] = avg;
      
      if (avg > highestDayAvg) {
        highestDayAvg = avg;
        highestDayName = day;
      }
    });

    const weekendAvg = ((dayAverages['Friday'] || 0) + (dayAverages['Saturday'] || 0) + (dayAverages['Sunday'] || 0)) / 3;
    const weekdayAvg = ((dayAverages['Monday'] || 0) + (dayAverages['Tuesday'] || 0) + (dayAverages['Wednesday'] || 0) + (dayAverages['Thursday'] || 0)) / 4;

    if (weekendAvg > weekdayAvg * 1.35 && weekendAvg > 0) {
      dayPatternMessage = `Weekend spending habit detected. You spend ${Math.round((weekendAvg/Math.max(1, weekdayAvg) - 1) * 100)}% more on weekends compared to weekdays.`;
    } else if (highestDayAvg > 0) {
      dayPatternMessage = `Most spending occurs on ${highestDayName}. Watch out for weekly routines on this day.`;
    }

    // Time Pattern (Morning vs Afternoon vs Evening vs Night)
    let timePatternMessage = "No distinct time-of-day spending pattern detected.";
    const timeBlocks = {
      'Morning (6 AM - 12 PM)': 0,
      'Afternoon (12 PM - 6 PM)': 0,
      'Evening (6 PM - 10 PM)': 0,
      'Night (10 PM - 6 AM)': 0
    };

    allExpenses.forEach(e => {
      if (e.created_at) {
        const hr = new Date(e.created_at).getHours();
        if (hr >= 6 && hr < 12) timeBlocks['Morning (6 AM - 12 PM)'] += parseFloat(e.amount);
        else if (hr >= 12 && hr < 18) timeBlocks['Afternoon (12 PM - 6 PM)'] += parseFloat(e.amount);
        else if (hr >= 18 && hr < 22) timeBlocks['Evening (6 PM - 10 PM)'] += parseFloat(e.amount);
        else timeBlocks['Night (10 PM - 6 AM)'] += parseFloat(e.amount);
      }
    });

    let peakTimeBlock = '';
    let peakTimeAmt = -1;
    Object.keys(timeBlocks).forEach(block => {
      if (timeBlocks[block] > peakTimeAmt) {
        peakTimeAmt = timeBlocks[block];
        peakTimeBlock = block;
      }
    });

    if (peakTimeAmt > 0) {
      if (peakTimeBlock.includes('Evening')) {
        timePatternMessage = `Most expenses occur during the Evening (6 PM - 10 PM). This often correlates with impulse shopping and dining out after work.`;
      } else if (peakTimeBlock.includes('Night')) {
        timePatternMessage = `Most spending occurs late at Night (10 PM - 6 AM). Be mindful of online late-night impulse shopping.`;
      } else {
        timePatternMessage = `Peak spending activity occurs during the ${peakTimeBlock}.`;
      }
    }

    // Category Pattern (spikes on weekends)
    const categoryPatternList = [];
    categories.forEach(cat => {
      const catExpenses = thisMonthExpenses.filter(e => e.category === cat);
      if (catExpenses.length >= 2) {
        const weekendCatAmt = catExpenses.filter(e => {
          const dayIdx = new Date(e.date).getDay();
          return dayIdx === 0 || dayIdx === 5 || dayIdx === 6; // Fri, Sat, Sun
        }).reduce((sum, e) => sum + parseFloat(e.amount), 0);
        
        const totalCatAmt = catExpenses.reduce((sum, e) => sum + parseFloat(e.amount), 0);
        if (totalCatAmt > 0 && (weekendCatAmt / totalCatAmt) > 0.65) {
          categoryPatternList.push(`${cat} spending spikes every weekend (${Math.round((weekendCatAmt / totalCatAmt) * 100)}% on weekends).`);
        }
      }
    });

    // Recurring Expense Detection
    // Criteria: items in the same category/description occurring around the same calendar day (+-3 days) in consecutive months
    const recurringSuggestions = [];
    const expenseGroupsByDesc = {};
    
    allExpenses.forEach(e => {
      if (!e.description) return;
      const cleanDesc = e.description.toLowerCase().trim();
      // Skip generic entries
      if (cleanDesc.length < 3 || ['added via chatbot', 'test', 'expense'].some(w => cleanDesc.includes(w))) return;
      if (!expenseGroupsByDesc[cleanDesc]) expenseGroupsByDesc[cleanDesc] = [];
      expenseGroupsByDesc[cleanDesc].push(e);
    });

    Object.keys(expenseGroupsByDesc).forEach(desc => {
      const list = expenseGroupsByDesc[desc];
      if (list.length >= 2) {
        // Sort by date
        list.sort((a, b) => a.date.localeCompare(b.date));
        
        // Check calendar day difference
        let isRecurringCandidate = true;
        let dayOfMonths = [];
        let monthsTracked = new Set();
        
        for (let idx = 0; idx < list.length; idx++) {
          const dt = new Date(list[idx].date);
          dayOfMonths.push(dt.getDate());
          monthsTracked.add(list[idx].date.substring(0, 7));
        }

        // Check if entries occur across different months
        if (monthsTracked.size >= 2) {
          const maxDay = Math.max(...dayOfMonths);
          const minDay = Math.min(...dayOfMonths);
          if (maxDay - minDay <= 5) {
            // Check average amount consistency (within 20% variance)
            const amounts = list.map(item => parseFloat(item.amount));
            const avgAmt = amounts.reduce((s, a) => s + a, 0) / amounts.length;
            const deviation = amounts.every(amt => Math.abs(amt - avgAmt) / avgAmt < 0.20);
            
            if (deviation) {
              recurringSuggestions.push({
                description: list[0].description,
                category: list[0].category,
                averageAmount: Math.round(avgAmt),
                typicalDay: Math.round(dayOfMonths.reduce((s, d) => s + d, 0) / dayOfMonths.length)
              });
            }
          }
        }
      }
    });

    // 6. BEHAVIORAL ANALYTICS
    // Impulse Spending Detection
    const impulseAlerts = [];
    const shoppingExpenses = thisMonthExpenses.filter(e => e.category === 'Shopping' || e.category === 'Entertainment');
    
    // Get historical average expense amount in Shopping/Entertainment
    const historicalWants = allExpenses.filter(e => (e.category === 'Shopping' || e.category === 'Entertainment') && e.date.substring(0, 7) !== currentMonth);
    const historicalWantsAvg = historicalWants.length > 0 
      ? historicalWants.reduce((sum, e) => sum + parseFloat(e.amount), 0) / historicalWants.length 
      : 0;

    shoppingExpenses.forEach(e => {
      const amt = parseFloat(e.amount);
      if (historicalWantsAvg > 0 && amt > historicalWantsAvg * 2.5) {
        impulseAlerts.push({
          date: e.date,
          item: e.description || e.category,
          amount: amt,
          increasePct: Math.round(((amt - historicalWantsAvg) / historicalWantsAvg) * 100),
          message: `Impulse Spending Alert: Your ${e.category} transaction "${e.description || e.category}" of Rs. ${e.amount.toLocaleString()} is ${Math.round(amt / historicalWantsAvg)}x higher than your historical average.`
        });
      }
    });

    // Lifestyle Creep Detection
    let lifestyleCreepWarning = null;
    if (last4Months[2].income > 0 && last4Months[3].income > 0) {
      const incomeGrowthPct = (last4Months[3].income - last4Months[2].income) / last4Months[2].income;
      const expenseGrowthPct = prevMonthTotalExpenses > 0 ? (totalExpenses - prevMonthTotalExpenses) / prevMonthTotalExpenses : 0;
      
      if (incomeGrowthPct > 0.05 && expenseGrowthPct > incomeGrowthPct * 1.2) {
        lifestyleCreepWarning = {
          incomeGrowth: Math.round(incomeGrowthPct * 100),
          expenseGrowth: Math.round(expenseGrowthPct * 100),
          message: `Lifestyle inflation detected. Your monthly income increased by ${Math.round(incomeGrowthPct * 100)}%, but your monthly expenses shot up by ${Math.round(expenseGrowthPct * 100)}%! Avoid scaling up non-essential costs too quickly.`
        };
      }
    }

    // Saving Behavior Analysis
    let savingBehaviorSummary = "Balanced savings pace.";
    if (weeklySpending[0] + weeklySpending[1] > 0 && weeklySpending[3] > (weeklySpending[0] + weeklySpending[1] + weeklySpending[2]) * 0.8) {
      savingBehaviorSummary = "End-of-month splurge. You manage to save and spend lightly during the first 2-3 weeks but spend heavily in the last week, draining your potential surplus.";
    } else if (savingsRate >= 35) {
      savingBehaviorSummary = "Consistent Wealth Builder. You consistently direct a healthy portion of your monthly income straight into savings.";
    } else if (totalIncome > 0 && savingsRate < 10) {
      savingBehaviorSummary = "High-velocity spender. Most of your funds are spent almost immediately after being logged. Try automating savings early in the month.";
    }

    // 7. PREDICTIVE ANALYTICS
    // End-of-Month Forecast
    const expectedExpenses = Math.round(dailyAverage * totalDaysInMonth);
    const expectedSavings = Math.max(0, totalIncome - expectedExpenses);
    const expectedBudgetLeft = Math.max(0, availableBudget - expectedExpenses);

    // Goal Completion Prediction
    // Monthly savings velocity based on last 30 days goal contributions or actual savings rate
    const recentGoalContributions = goals.reduce((sum, g) => sum + parseFloat(g.current_amount), 0);
    const monthlySavingVelocity = netSavings > 0 ? netSavings : 0;

    const goalCompletionPredictions = goals.map(g => {
      const remaining = Math.max(0, parseFloat(g.target_amount) - parseFloat(g.current_amount));
      const monthsToComplete = monthlySavingVelocity > 0 ? remaining / monthlySavingVelocity : 0;
      
      // Calculate projected date
      const targetDate = new Date();
      if (monthsToComplete > 0) {
        targetDate.setMonth(targetDate.getMonth() + Math.ceil(monthsToComplete));
      }
      const completionLabel = remaining === 0 
        ? "Completed" 
        : (monthlySavingVelocity > 0 ? `${Math.ceil(monthsToComplete)} months` : "Never (No Savings)");

      return {
        goalId: g.id,
        goalName: g.goal_name,
        targetAmount: g.target_amount,
        currentAmount: g.current_amount,
        remainingAmount: remaining,
        completionLabel,
        estimatedCompletionMonths: Math.ceil(monthsToComplete),
        projectedDate: targetDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    });

    // Overspending Risk Assessment
    let overspendingRisk = 'Low';
    let overspendingProbability = 5;
    if (expectedExpenses > availableBudget) {
      overspendingRisk = 'High';
      overspendingProbability = Math.min(99, Math.round(((expectedExpenses - availableBudget) / Math.max(1, availableBudget)) * 100) + 70);
    } else if (expectedExpenses > availableBudget * 0.85) {
      overspendingRisk = 'Medium';
      overspendingProbability = Math.round(((expectedExpenses - (availableBudget * 0.85)) / (availableBudget * 0.15)) * 40) + 20;
    }

    // 8. COMPARATIVE ANALYTICS
    // Month-over-Month comparison
    const momChangeAmt = totalExpenses - prevMonthTotalExpenses;
    const momChangePct = prevMonthTotalExpenses > 0 ? (momChangeAmt / prevMonthTotalExpenses) * 100 : 0;

    // Week-over-Week comparison (current week vs previous week)
    const currentWeekIdx = Math.max(1, Math.min(4, Math.ceil(currentDay / 7)));
    const currentWeekSpend = weeklySpending[currentWeekIdx - 1] || 0;
    const prevWeekSpend = currentWeekIdx > 1 ? (weeklySpending[currentWeekIdx - 2] || 0) : 0;
    let wowChangePct = 0;
    if (prevWeekSpend > 0) {
      wowChangePct = ((currentWeekSpend - prevWeekSpend) / prevWeekSpend) * 100;
    }

    // 9. FINANCIAL PERSONALITY ARCHETYPE & STYLE BREAKDOWN
    // Archetype matching
    let archetype = 'Balanced';
    let archetypeDescription = 'You maintain a steady equilibrium between spending for immediate needs and saving for the future.';

    if (savingsRate >= 40) {
      archetype = 'Super Saver';
      archetypeDescription = 'You prioritize future financial security, saving a significant portion of your income.';
    } else if (goals.length > 0 && netSavings > savingsTarget) {
      archetype = 'Goal Focused';
      archetypeDescription = 'Your spending habits are closely driven by your concrete targets, directing extra funds to active goals.';
    } else if (impulseAlerts.length >= 2 || (categoryAnalytics.find(c => c.category === 'Shopping')?.percentage || 0) > 30) {
      archetype = 'Impulse Buyer';
      archetypeDescription = 'You tend to make spontaneous purchases, especially under shopping categories. Consider setting limits.';
    } else if (savingsRate < 12 && budgetRemaining < 0) {
      archetype = 'Aggressive Spender';
      archetypeDescription = 'You spend your available funds quickly, leaving very little room for savings. Try building an emergency buffer.';
    }

    // Style Breakdown (Needs vs Wants vs Savings vs Education)
    // Needs: Food, Bills, Transport, Health
    // Wants: Shopping, Entertainment, Other
    // Education: Education
    const needsAmt = thisMonthExpenses.filter(e => ['Food', 'Bills', 'Transport', 'Health'].includes(e.category)).reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const wantsAmt = thisMonthExpenses.filter(e => ['Shopping', 'Entertainment', 'Other'].includes(e.category)).reduce((sum, e) => sum + parseFloat(e.amount), 0);
    const eduAmt = thisMonthExpenses.filter(e => e.category === 'Education').reduce((sum, e) => sum + parseFloat(e.amount), 0);
    
    // Savings represented by savings target or net savings
    const activeSavingsAmt = Math.max(0, totalIncome - totalExpenses);
    
    const styleTotal = needsAmt + wantsAmt + eduAmt + activeSavingsAmt;
    const styleBreakdown = {
      needs: styleTotal > 0 ? parseFloat(((needsAmt / styleTotal) * 100).toFixed(1)) : 0,
      wants: styleTotal > 0 ? parseFloat(((wantsAmt / styleTotal) * 100).toFixed(1)) : 0,
      savings: styleTotal > 0 ? parseFloat(((activeSavingsAmt / styleTotal) * 100).toFixed(1)) : 0,
      education: styleTotal > 0 ? parseFloat(((eduAmt / styleTotal) * 100).toFixed(1)) : 0
    };

    // 10. AI INSIGHTS
    const dynamicInsights = [];
    if (dayPatternMessage.includes('Weekend')) {
      dynamicInsights.push(dayPatternMessage);
    }
    if (totalExpenses > 0) {
      const topCat = [...categoryAnalytics].sort((a,b) => b.amount - a.amount)[0];
      if (topCat && topCat.amount > 0) {
        dynamicInsights.push(`${topCat.category} is your largest expense category, accounting for ${topCat.percentage}% of your spending this month.`);
      }
    }
    if (overspendingRisk === 'High') {
      dynamicInsights.push(`At your current spending velocity, you are likely to overshoot your budget limit by Rs. ${Math.round(expectedExpenses - availableBudget).toLocaleString()} PKR.`);
    }
    if (savingsTarget > 0 && expectedSavings < savingsTarget) {
      dynamicInsights.push(`You are projected to miss your savings goal by Rs. ${Math.round(savingsTarget - expectedSavings).toLocaleString()} PKR.`);
    }
    if (highestSpendingDay.amount > 0) {
      const dName = new Date(highestSpendingDay.date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
      dynamicInsights.push(`${dName} was your most expensive day, with Rs. ${highestSpendingDay.amount.toLocaleString()} logged.`);
    }
    if (weeklySpending[3] > weeklySpending[0] * 1.5 && weeklySpending[0] > 0) {
      dynamicInsights.push("Your spending increased by over 50% in the final week of the month, highlighting a late-month splurge habit.");
    }
    if (categoryPatternList.length > 0) {
      dynamicInsights.push(categoryPatternList[0]);
    }
    if (dynamicInsights.length === 0) {
      dynamicInsights.push("Your expenses are stable and well-balanced. You are managing your personal finances perfectly!");
    }

    return {
      currentMonth,
      systemDetails,
      basicAnalytics: {
        totalIncome,
        totalExpenses,
        netSavings,
        savingsRate: parseFloat(savingsRate.toFixed(1)),
        budgetRemaining,
        availableBudget,
        savingsTarget,
        todaySpending,
        dailyAverage: parseFloat(dailyAverage.toFixed(2)),
        highestSpendingDay,
        lowestSpendingDay,
        last15DaysData
      },
      categoryAnalytics,
      timeBasedAnalytics: {
        weeklySpending,
        weeklyAverage: parseFloat(weeklyAverage.toFixed(2)),
        highestSpendingWeek,
        lowestSpendingWeek,
        last4Months,
        growthRates: {
          spendingGrowth: parseFloat(spendingGrowth.toFixed(1)),
          savingsGrowth: parseFloat(savingsGrowth.toFixed(1)),
          incomeGrowth: parseFloat(incomeGrowth.toFixed(1))
        },
        yearlyData
      },
      budgetIntelligence: {
        monthProgressPct,
        budgetUsedPct,
        burnRateWarning,
        burnRateStatus,
        safeDailyLimit: parseFloat(safeDailyLimit.toFixed(2)),
        healthScore,
        deductions
      },
      patternDetection: {
        dayPatternMessage,
        timePatternMessage,
        categoryPatternList,
        recurringSuggestions
      },
      behavioralAnalytics: {
        impulseAlerts,
        lifestyleCreepWarning,
        savingBehaviorSummary
      },
      predictiveAnalytics: {
        expectedExpenses,
        expectedSavings,
        expectedBudgetLeft,
        goalCompletionPredictions,
        overspendingRisk,
        overspendingProbability
      },
      comparativeAnalytics: {
        momChangeAmt,
        momChangePct: parseFloat(momChangePct.toFixed(1)),
        wowChangePct: parseFloat(wowChangePct.toFixed(1)),
        currentWeekSpend,
        prevWeekSpend
      },
      financialPersonality: {
        archetype,
        archetypeDescription,
        styleBreakdown
      },
      aiInsights: dynamicInsights
    };
  }
};
