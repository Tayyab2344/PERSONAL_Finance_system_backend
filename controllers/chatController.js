import { db } from '../config/database.js';
import { aiService } from '../services/aiService.js';
import { financialEngine, normalizeAccountType } from '../services/financialEngine.js';
import { analyticsService } from '../services/analyticsService.js';

export const sendMessage = async (req, res) => {
  const userId = req.user.id;
  const { message } = req.body;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: "Message is required." });
  }

  try {
    // Audit Log for incoming query
    await db.addAuditLog(userId, 'CHAT_MESSAGE', `User sent message: "${message.substring(0, 100)}"`, req.ip);

    // 1. Extract intent and parameters via AI Service (Hybrid: Gemini/Grok/Rule-based Regex)
    const extraction = await aiService.extractIntent(message);
    const { intent, params, isAiMode } = extraction;
    let responseText = extraction.reply; // default to AI conversational response if present
    let pendingAction = null;

    // 2. Perform action based on intent (with validations and confirmations)
    if (intent === 'ADD_INCOME') {
      const { amount, source, account_type } = params;
      if (!amount || !source) {
        responseText = "I detected that you want to add income, but I couldn't extract the amount or source. Please try like this: **'Add income 50000 salary'**";
      } else {
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          responseText = "I detected you want to add income, but the amount must be a positive number. Try like: **'Add income 50000 salary'**";
        } else {
          const detectedAccount = normalizeAccountType(account_type || 'Cash');
          responseText = `I detected a request to add income:\n* **Amount:** Rs. ${parsedAmount.toLocaleString()}\n* **Source:** ${source}\n* **Account:** ${detectedAccount}\n\nPlease click **Confirm** to save this transaction.`;
          pendingAction = {
            type: 'ADD_INCOME',
            params: { amount: parsedAmount, source, account_type: detectedAccount }
          };
        }
      }
    } 
    
    else if (intent === 'ADD_EXPENSE') {
      const { amount, category, account_type } = params;
      if (!amount || !category) {
        responseText = "I detected that you want to add an expense, but I couldn't extract the amount or category. Please try like this: **'Add expense 1200 fuel'**";
      } else {
        const parsedAmount = parseFloat(amount);
        const validCategories = ['Food', 'Fuel', 'Transport', 'Education', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
          responseText = "I detected you want to add an expense, but the amount must be a positive number. Try like: **'Add expense 1200 fuel'**";
        } else if (!validCategories.includes(category)) {
          responseText = `I detected you want to add an expense, but the category **${category}** is invalid. Allowed categories are: ${validCategories.join(', ')}`;
        } else {
          const detectedAccount = normalizeAccountType(account_type || 'Cash');
          responseText = `I detected a request to log an expense:\n* **Amount:** Rs. ${parsedAmount.toLocaleString()}\n* **Category:** ${category}\n* **Paid Via:** ${detectedAccount}\n\nPlease click **Confirm** to save this transaction.`;
          pendingAction = {
            type: 'ADD_EXPENSE',
            params: { amount: parsedAmount, category, account_type: detectedAccount }
          };
        }
      }
    } 
    
    else if (intent === 'AFFORDABILITY_CHECK') {
      const { amount, item } = params;
      if (!amount || !item) {
        responseText = "I detected you want to check affordability, but I couldn't extract the cost or the item. Please try: **'Can I afford a 5000 PKR course?'**";
      } else {
        const check = await financialEngine.checkAffordability(userId, amount, item);
        responseText = `### Affordability Analysis: **${check.itemDescription}**\n\n` +
                       `* **Cost:** Rs. ${check.purchaseAmount.toLocaleString()}\n` +
                       `* **Status:** **${check.recommendation}**\n` +
                       `* **Savings Goal Impact:** ${check.savingsStatus}\n\n` +
                       `**Details:** ${check.reason}`;
      }
    } 
    
    else if (intent === 'DAILY_ALLOWANCE') {
      const summary = await financialEngine.calculateSummary(userId);
      if (summary.totalIncome === 0) {
        responseText = "You haven't recorded any income for this month yet, so your daily allowance is Rs. 0. Use **'Add income 50000 salary'** to set up your budget!";
      } else if (summary.budgetRemaining < 0) {
        responseText = `You have exceeded your available spending budget by **Rs. ${Math.abs(summary.budgetRemaining).toLocaleString()}** this month, so your daily allowance is **Rs. 0**. Try to minimize your expenses to get back on track!`;
      } else {
        responseText = `Based on your remaining spending budget of **Rs. ${summary.budgetRemaining.toLocaleString()}** and **${summary.remainingDays}** remaining days this month, your safe daily spending limit is **Rs. ${summary.dailySpendingAllowance.toLocaleString()} per day**.`;
      }
    } 
    
    else if (intent === 'SAVINGS_GOAL_STATUS') {
      const predictions = await financialEngine.getPredictions(userId);
      const summary = await financialEngine.calculateSummary(userId);
      if (summary.goalsCount === 0) {
        responseText = "You do not have any active savings goals yet. You can create a savings goal in the Savings Dashboard tab!";
      } else {
        responseText = `### Savings Goals & Target Prediction:\n\n` +
                       `* **Current Progress:** **${summary.savingsProgress}%** achieved across active goals.\n` +
                       `* **Target Status:** ${predictions.savingsStatusMessage}\n` +
                       `* **Pace:** You are saving at a rate of **${predictions.spendingSpeed}** relative to your timeline.`;
      }
    } 
    
    else if (intent === 'SHOW_EXPENSES_MONTH') {
      const summary = await financialEngine.calculateSummary(userId);
      responseText = `This month, you have spent **Rs. ${summary.totalExpenses.toLocaleString()}** out of your available spending budget of **Rs. ${summary.availableBudget.toLocaleString()}**.\n` +
                     `You have **Rs. ${summary.budgetRemaining.toLocaleString()}** remaining for the rest of the month.`;
    } 
    
    else if (intent === 'SHOW_SPENDING_CATEGORY') {
      const summary = await financialEngine.calculateSummary(userId);
      const expenses = await db.getExpenses(userId, summary.month);
      
      if (expenses.length === 0) {
        responseText = "You have no expenses recorded for this month yet!";
      } else {
        const categoryTotals = {};
        expenses.forEach(e => {
          categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
        });
 
        let breakdown = `### Spending Breakdown by Category for ${summary.month}:\n\n`;
        Object.keys(categoryTotals)
          .sort((a, b) => categoryTotals[b] - categoryTotals[a])
          .forEach(cat => {
            const amount = categoryTotals[cat];
            const pct = summary.totalExpenses > 0 ? ((amount / summary.totalExpenses) * 100).toFixed(1) : 0;
            breakdown += `* **${cat}:** Rs. ${amount.toLocaleString()} (${pct}%)\n`;
          });
        breakdown += `\n**Total Expenses:** Rs. ${summary.totalExpenses.toLocaleString()}`;
        responseText = breakdown;
      }
    } 
    
    else if (intent === 'BUDGET_SUMMARY') {
      const summary = await financialEngine.calculateSummary(userId);
      responseText = `### Budget Summary for ${summary.month}:\n\n` +
                     `* **Total Income:** Rs. ${summary.totalIncome.toLocaleString()}\n` +
                     `* **Reserved Savings Target:** Rs. ${summary.savingsTarget.toLocaleString()}\n` +
                     `* **Available Spending Budget:** Rs. ${summary.availableBudget.toLocaleString()}\n` +
                     `* **Total Expenses to Date:** Rs. ${summary.totalExpenses.toLocaleString()}\n` +
                     `* **Remaining Budget:** Rs. ${summary.budgetRemaining.toLocaleString()}\n\n` +
                     `*Daily Spending Limit: Rs. ${summary.dailySpendingAllowance.toLocaleString()} / day*`;
    }
 
    else if (intent === 'BUDGET_HEALTH') {
      const data = await analyticsService.getAnalytics(userId);
      const score = data.budgetIntelligence.healthScore;
      const deductions = data.budgetIntelligence.deductions;
      let reply = `### Budget Health Analysis:\n\n* **Overall Score:** **${score}/100**\n`;
      if (deductions.length === 0) {
        reply += `* **Status:** Excellent! You have a perfect budget health score with zero deductions. Keep it up! ✨`;
      } else {
        reply += `* **Status:** Paced. Your score has the following deductions:\n` + deductions.map(d => `  - ${d}`).join('\n') + `\n\n*Safe daily limit: Rs. ${data.budgetIntelligence.safeDailyLimit.toLocaleString()} / day.*`;
      }
      responseText = reply;
    }
 
    else if (intent === 'FINANCIAL_PERSONALITY') {
      const data = await analyticsService.getAnalytics(userId);
      const archetype = data.financialPersonality.archetype;
      const desc = data.financialPersonality.archetypeDescription;
      const breakdown = data.financialPersonality.styleBreakdown;
      responseText = `### Financial Personality Archetype:\n\n` +
                     `* **Archetype:** **${archetype}**\n` +
                     `* **Description:** ${desc}\n\n` +
                     `**Spending Style Breakdown:**\n` +
                     `* 🍔 **Needs:** ${breakdown.needs}%\n` +
                     `* 🎁 **Wants:** ${breakdown.wants}%\n` +
                     `* 📈 **Savings:** ${breakdown.savings}%\n` +
                     `* 🎓 **Education:** ${breakdown.education}%`;
    }
 
    else if (intent === 'DETECT_RECURRING') {
      const data = await analyticsService.getAnalytics(userId);
      const list = data.patternDetection.recurringSuggestions;
      if (list.length === 0) {
        responseText = "I haven't detected any recurring expenses (like monthly subscriptions) yet. Keep logging your transactions and I'll notify you if any patterns appear!";
      } else {
        let reply = `### Detected Recurring Expenses & Subscriptions:\n\n`;
        list.forEach(rec => {
          reply += `* **${rec.description}** (${rec.category}) - Rs. ${rec.averageAmount.toLocaleString()} around day **${rec.typicalDay}** of the month.\n`;
        });
        reply += `\n*Would you like to save these as monthly recurring transactions in your dashboard?*`;
        responseText = reply;
      }
    }
 
    else if (intent === 'HELP') {
      responseText = `### Supported Chat Commands:\n\n` +
                     `* **Add Income:** 'Add income 50000 salary'\n` +
                     `* **Add Expense:** 'Add expense 1200 fuel' (Categories: Food, Fuel, Transport, Education, Shopping, Bills, Entertainment, Health, Other)\n` +
                     `* **Check Affordability:** 'Can I afford a 5000 PKR course?' or 'Can I buy a 2500 PKR game?'\n` +
                     `* **Daily Allowance:** 'How much can I spend today?'\n` +
                     `* **Savings Goal Status:** 'Will I achieve my savings goal?'\n` +
                     `* **Budget Summary:** 'Show budget summary'\n` +
                     `* **Budget Health:** 'What is my budget health score?'\n` +
                     `* **Financial Personality:** 'What is my spending personality?'\n` +
                     `* **Recurring Bills:** 'Detect recurring bills'\n` +
                     `* **Expenses Log:** 'Show expenses this month'\n` +
                     `* **Category Breakdown:** 'Show spending by category'`;
    }
 
    // Default conversational responses
    if (!responseText) {
      responseText = "I'm not sure how to process that. You can type **'help'** to see a list of commands I can handle, or try adding a transaction (e.g. **'Add expense 1200 fuel'**).";
    }
 
    // 3. Save Chat History
    await db.addChatHistory(userId, message, responseText);
 
    // 4. Retrieve updated chat history (limit 20) to keep client synchronized
    const chatHistory = await db.getChatHistory(userId, 20);
 
    res.json({
      message,
      response: responseText,
      intent,
      isAiMode,
      pendingAction,
      chatHistory
    });
 
  } catch (error) {
    console.error("Chat message error:", error);
    res.status(500).json({ error: "An error occurred while processing your message." });
  }
};

export const confirmAction = async (req, res) => {
  const userId = req.user.id;
  const { type, params } = req.body;

  if (!type || !params) {
    return res.status(400).json({ error: "Action type and params are required." });
  }

  try {
    let reply = "";
    if (type === 'ADD_INCOME') {
      const { amount, source, account_type } = params;
      const parsedAmount = parseFloat(amount);
      if (!source || isNaN(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: "Invalid income source or amount." });
      }
      
      const normalizedAccount = normalizeAccountType(account_type);
      const income = await db.addIncome(userId, source, parsedAmount, null, normalizedAccount);
      reply = `✅ **Confirmed:** Added income of **Rs. ${income.amount.toLocaleString()}** from **${income.source}** into your **${income.account_type || 'Cash'}** account!`;
      await db.addAuditLog(userId, 'CONFIRM_ADD_INCOME', `Chatbot confirmed income: ${source}, amount: ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    } 
    
    else if (type === 'ADD_EXPENSE') {
      const { amount, category, account_type } = params;
      const parsedAmount = parseFloat(amount);
      const validCategories = ['Food', 'Fuel', 'Transport', 'Education', 'Shopping', 'Bills', 'Entertainment', 'Health', 'Other'];
      
      if (!category || isNaN(parsedAmount) || parsedAmount <= 0 || !validCategories.includes(category)) {
        return res.status(400).json({ error: "Invalid expense category or amount." });
      }

      const normalizedAccount = normalizeAccountType(account_type);
      const expense = await db.addExpense(userId, category, parsedAmount, `Added via chatbot with confirmation`, null, null, normalizedAccount);
      reply = `✅ **Confirmed:** Logged expense of **Rs. ${expense.amount.toLocaleString()}** under **${expense.category}** category using your **${expense.account_type || 'Cash'}** balance.`;
      await db.addAuditLog(userId, 'CONFIRM_ADD_EXPENSE', `Chatbot confirmed expense: category ${category}, amount ${parsedAmount}, account: ${normalizedAccount}`, req.ip);
    } 
    
    else {
      return res.status(400).json({ error: "Unsupported confirmation action type." });
    }

    // Save confirm response to Chat History so it stays in UI on reload
    await db.addChatHistory(userId, `[Confirmed ${type}]`, reply);

    // Retrieve updated chat history (limit 20)
    const chatHistory = await db.getChatHistory(userId, 20);

    res.json({
      success: true,
      response: reply,
      chatHistory
    });

  } catch (error) {
    console.error("Confirm action error:", error);
    res.status(500).json({ error: "Failed to confirm and execute transaction." });
  }
};
 
export const getHistory = async (req, res) => {
  const userId = req.user.id;
  try {
    const list = await db.getChatHistory(userId, 50);
    res.json(list);
  } catch (error) {
    console.error("Get chat history error:", error);
    res.status(500).json({ error: "Failed to retrieve chat history." });
  }
};
