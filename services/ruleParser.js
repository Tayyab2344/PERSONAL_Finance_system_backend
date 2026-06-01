export const ruleParser = {
  parse(message) {
    const text = message.trim().replace(/\s+/g, ' ');

    // 1. Add Income
    // e.g. "add income 50000 salary", "add income 2000 freelancing"
    const addIncomeRegex = /^\s*add\s+income\s+(\d+(?:\.\d+)?)\s*(?:pkr|rs|rupees)?\s+(.+)$/i;
    let match = text.match(addIncomeRegex);
    if (match) {
      const { accountType, cleanedStr } = this.extractAccountType(match[2]);
      return {
        matched: true,
        intent: 'ADD_INCOME',
        params: {
          amount: parseFloat(match[1]),
          source: cleanedStr,
          account_type: accountType
        }
      };
    }

    // 2. Add Expense
    // e.g. "add expense 1200 fuel", "add expense 500 food"
    const addExpenseRegex = /^\s*add\s+expense\s+(\d+(?:\.\d+)?)\s*(?:pkr|rs|rupees)?\s+(.+)$/i;
    match = text.match(addExpenseRegex);
    if (match) {
      const { accountType, cleanedStr } = this.extractAccountType(match[2]);
      return {
        matched: true,
        intent: 'ADD_EXPENSE',
        params: {
          amount: parseFloat(match[1]),
          category: this.normalizeCategory(cleanedStr),
          account_type: accountType
        }
      };
    }

    // 3. Affordability Check
    // e.g. "can i afford a 5000 PKR course?", "can i buy a laptop for 150000", "can i purchase a 1500 PKR game"
    const affordRegex1 = /can\s+i\s+(?:afford|buy|purchase)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*(?:pkr|rs|rupees)?\s+(.+)/i;
    const affordRegex2 = /can\s+i\s+(?:afford|buy|purchase)\s+(?:a\s+)?(.+)\s+for\s+(\d+(?:\.\d+)?)/i;
    
    match = text.match(affordRegex1);
    if (match) {
      return {
        matched: true,
        intent: 'AFFORDABILITY_CHECK',
        params: {
          amount: parseFloat(match[1]),
          item: match[2].trim().replace(/\?$/, '')
        }
      };
    }

    match = text.match(affordRegex2);
    if (match) {
      return {
        matched: true,
        intent: 'AFFORDABILITY_CHECK',
        params: {
          amount: parseFloat(match[2]),
          item: match[1].trim().replace(/\?$/, '')
        }
      };
    }

    // 4. Daily Spending Allowance
    // e.g. "how much can i spend today?", "how much spend today"
    const dailyAllowanceRegex = /^\s*how\s+much\s+(?:can\s+)?i\s+spend\s+today\s*\??$/i;
    if (dailyAllowanceRegex.test(text)) {
      return {
        matched: true,
        intent: 'DAILY_ALLOWANCE',
        params: {}
      };
    }

    // 5. Savings Goal Status
    // e.g. "will i achieve my savings goal?"
    const savingsRegex = /^\s*(?:will\s+)?i\s+achieve\s+(?:my\s+)?savings?\s+goals?\s*\??$/i;
    if (savingsRegex.test(text)) {
      return {
        matched: true,
        intent: 'SAVINGS_GOAL_STATUS',
        params: {}
      };
    }

    // 6. Show Expenses Month
    // e.g. "show expenses this month", "show expenses month"
    const showExpensesRegex = /^\s*show\s+expenses(?:\s+this)?\s+month\s*$/i;
    if (showExpensesRegex.test(text)) {
      return {
        matched: true,
        intent: 'SHOW_EXPENSES_MONTH',
        params: {}
      };
    }

    // 7. Show Spending Category
    // e.g. "show spending by category"
    const showCategoryRegex = /^\s*show\s+spending\s+by\s+category\s*$/i;
    if (showCategoryRegex.test(text)) {
      return {
        matched: true,
        intent: 'SHOW_SPENDING_CATEGORY',
        params: {}
      };
    }

    // 8. Show Budget Summary
    // e.g. "show budget summary", "budget summary"
    const budgetSummaryRegex = /^\s*(?:show\s+)?budget\s+summary\s*$/i;
    if (budgetSummaryRegex.test(text)) {
      return {
        matched: true,
        intent: 'BUDGET_SUMMARY',
        params: {}
      };
    }

    // Budget Health Score
    const budgetHealthRegex = /^\s*(?:what\s+is\s+my\s+)?budget\s+health\s*(?:score)?\s*\??$/i;
    if (budgetHealthRegex.test(text)) {
      return {
        matched: true,
        intent: 'BUDGET_HEALTH',
        params: {}
      };
    }

    // Financial Personality Archetype
    const personalityRegex = /^\s*(?:what\s+is\s+my\s+)?(?:financial\s+)?personality\s*(?:profile|type)?\s*\??$/i;
    if (personalityRegex.test(text)) {
      return {
        matched: true,
        intent: 'FINANCIAL_PERSONALITY',
        params: {}
      };
    }

    // Recurring Expenses
    const recurringRegex = /^\s*(?:what\s+are\s+my\s+|detect\s+)?recurring\s+(?:expenses|bills|subscriptions)\s*\??$/i;
    if (recurringRegex.test(text)) {
      return {
        matched: true,
        intent: 'DETECT_RECURRING',
        params: {}
      };
    }

    // 9. Help Command
    const helpRegex = /^\s*(?:help|commands|menu)\s*$/i;
    if (helpRegex.test(text)) {
      return {
        matched: true,
        intent: 'HELP',
        params: {}
      };
    }

    // Keyword Heuristic Semantic Fallback (extremely smart natural phrasing mapping)
    const lowerText = text.toLowerCase();

    // Greetings
    if (['hello', 'hi', 'hey', 'greetings', 'yo', 'assalamu'].some(w => lowerText.startsWith(w) || lowerText === w)) {
      return {
        matched: true,
        intent: 'CHAT',
        params: {},
        reply: "Hello Tayyab Atiq! How can I assist you with your financial intelligence today? You can ask me about your budget, daily allowance, savings goals, or add transactions."
      };
    }

    // Help
    if (lowerText.includes('help') || lowerText.includes('command') || lowerText.includes('menu')) {
      return { matched: true, intent: 'HELP', params: {} };
    }

    // Daily Allowance
    if (lowerText.includes('allowance') || lowerText.includes('limit') || (lowerText.includes('spend') && lowerText.includes('today')) || lowerText.includes('daily')) {
      return { matched: true, intent: 'DAILY_ALLOWANCE', params: {} };
    }

    // Savings Goals
    if (lowerText.includes('save') || lowerText.includes('saving') || lowerText.includes('goal')) {
      return { matched: true, intent: 'SAVINGS_GOAL_STATUS', params: {} };
    }

    // Budget Health
    if (lowerText.includes('health') || lowerText.includes('score')) {
      return { matched: true, intent: 'BUDGET_HEALTH', params: {} };
    }

    // Financial Personality
    if (lowerText.includes('personality') || lowerText.includes('style') || lowerText.includes('profile')) {
      return { matched: true, intent: 'FINANCIAL_PERSONALITY', params: {} };
    }

    // Recurring Bills
    if (lowerText.includes('recurring') || lowerText.includes('bill') || lowerText.includes('subscription')) {
      return { matched: true, intent: 'DETECT_RECURRING', params: {} };
    }

    // Budget Summary
    if (lowerText.includes('budget') || lowerText.includes('summary') || lowerText.includes('status') || lowerText.includes('balance') || lowerText.includes('income')) {
      return { matched: true, intent: 'BUDGET_SUMMARY', params: {} };
    }

    // Category Breakdown
    if (lowerText.includes('category') || lowerText.includes('breakdown') || lowerText.includes('division')) {
      return { matched: true, intent: 'SHOW_SPENDING_CATEGORY', params: {} };
    }

    // Expenses Month
    if (lowerText.includes('expense') || lowerText.includes('spending') || lowerText.includes('spent')) {
      return { matched: true, intent: 'SHOW_EXPENSES_MONTH', params: {} };
    }

    return {
      matched: false,
      intent: 'UNKNOWN',
      params: {}
    };
  },

  extractAccountType(paramStr) {
    const lower = paramStr.toLowerCase();
    let accountType = 'Cash';
    let cleanedStr = paramStr;

    const mappings = [
      { regex: /\b(?:from|in|via|through|using|to)?\s*easy\s*paisa\b/gi, type: 'EasyPaisa' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*easypaisa\b/gi, type: 'EasyPaisa' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*jazz\s*cash\b/gi, type: 'JazzCash' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*jazzcash\b/gi, type: 'JazzCash' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*jazz\s*cahs\b/gi, type: 'JazzCash' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*bank\b/gi, type: 'Bank' },
      { regex: /\b(?:from|in|via|through|using|to)?\s*cash\b/gi, type: 'Cash' }
    ];

    for (const map of mappings) {
      if (map.regex.test(cleanedStr)) {
        accountType = map.type;
        cleanedStr = cleanedStr.replace(map.regex, '').replace(/\s+/g, ' ').trim();
        break;
      }
    }
    return { accountType, cleanedStr };
  },

  normalizeCategory(cat) {
    const validCategories = [
      'Food', 'Fuel', 'Transport', 'Education', 'Shopping',
      'Bills', 'Entertainment', 'Health', 'Other'
    ];
    const cleanCat = cat.trim().toLowerCase();
    
    // Find matching category
    const found = validCategories.find(c => c.toLowerCase() === cleanCat);
    if (found) return found;

    // Handle mapping/synonyms
    if (['dining', 'restaurant', 'groceries', 'eat', 'coffee'].includes(cleanCat)) return 'Food';
    if (['petrol', 'diesel', 'gas'].includes(cleanCat)) return 'Fuel';
    if (['taxi', 'bus', 'uber', 'metro', 'fare', 'ride'].includes(cleanCat)) return 'Transport';
    if (['school', 'college', 'course', 'book', 'fees', 'university'].includes(cleanCat)) return 'Education';
    if (['clothes', 'shoes', 'purchased', 'buy', 'dress'].includes(cleanCat)) return 'Shopping';
    if (['electricity', 'water', 'gas bill', 'internet', 'rent', 'utility'].includes(cleanCat)) return 'Bills';
    if (['movie', 'fun', 'game', 'club', 'trip', 'play'].includes(cleanCat)) return 'Entertainment';
    if (['medicine', 'doctor', 'clinic', 'hospital', 'gym', 'fitness'].includes(cleanCat)) return 'Health';

    return 'Other';
  }
};
