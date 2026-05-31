import { ruleParser } from './ruleParser.js';

export const aiService = {
  async extractIntent(message) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const grokKey = process.env.GROK_API_KEY;
    const provider = process.env.AI_PROVIDER || 'gemini';

    if (provider === 'gemini' && geminiKey) {
      try {
        return await this.callGemini(message, geminiKey);
      } catch (err) {
        console.warn("Gemini API call failed, attempting Grok fallback if available:", err.message);
        if (grokKey) {
          try {
            return await this.callGrok(message, grokKey);
          } catch (grokErr) {
            console.warn("Grok fallback also failed:", grokErr.message);
          }
        }
      }
    } else if (provider === 'grok' && grokKey) {
      try {
        return await this.callGrok(message, grokKey);
      } catch (err) {
        console.warn("Grok API call failed, attempting Gemini fallback if available:", err.message);
        if (geminiKey) {
          try {
            return await this.callGemini(message, geminiKey);
          } catch (geminiErr) {
            console.warn("Gemini fallback also failed:", geminiErr.message);
          }
        }
      }
    }

    // Default Fallback to Rule Parser
    console.log("AI service unavailable or not configured. Using Rule-Based Parser.");
    const parsed = ruleParser.parse(message);
    return {
      ...parsed,
      isAiMode: false,
      reply: parsed.matched ? null : "I didn't quite catch that. Try using standard commands like: 'Add income 50000 salary', 'Add expense 1200 fuel', or 'Can I afford a 5000 PKR dinner?'"
    };
  },

  async callGemini(message, apiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${apiKey}`;
    
    const systemInstruction = `
You are the intent extraction assistant for a Personal Finance App.
Your job is to read the user's message and extract their financial intent and parameters into a JSON object.
Do NOT perform calculations! Just extract the raw numbers and category names.
The allowed intents are:
- ADD_INCOME (requires params: { amount: number, source: string })
- ADD_EXPENSE (requires params: { amount: number, category: string } - category must be mapped to one of: Food, Fuel, Transport, Education, Shopping, Bills, Entertainment, Health, Other. Map synonyms like petrol -> Fuel, dinner -> Food, etc.)
- AFFORDABILITY_CHECK (requires params: { amount: number, item: string })
- DAILY_ALLOWANCE (no params required)
- SAVINGS_GOAL_STATUS (no params required)
- SHOW_EXPENSES_MONTH (no params required)
- SHOW_SPENDING_CATEGORY (no params required)
- BUDGET_SUMMARY (no params required)
- BUDGET_HEALTH (no params required)
- FINANCIAL_PERSONALITY (no params required)
- DETECT_RECURRING (no params required)
- CHAT (for greetings, general finance questions, or unrecognized commands. Provide a direct response in the "reply" field)

You MUST respond with a single valid JSON block containing:
{
  "intent": "INTENT_NAME",
  "params": { ... },
  "reply": "friendly message (only required for CHAT intent, or optional comment)"
}
Do not add markdown formatting outside of the JSON block (e.g. no triple backticks unless returning just json).
`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: systemInstruction },
              { text: `User message: "${message}"` }
            ]
          }
        ],
        generationConfig: {
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      throw new Error("Empty response from Gemini API");
    }

    const result = JSON.parse(responseText.trim());
    return {
      matched: result.intent !== 'CHAT' && result.intent !== 'UNKNOWN',
      intent: result.intent,
      params: result.params || {},
      reply: result.reply || null,
      isAiMode: true
    };
  },

  async callGrok(message, apiKey) {
    const url = 'https://api.x.ai/v1/chat/completions';
    
    const systemInstruction = `
You are the intent extraction assistant for a Personal Finance App.
Your job is to read the user's message and extract their financial intent and parameters into a JSON object.
Do NOT perform calculations! Just extract the raw numbers and category names.
The allowed intents are:
- ADD_INCOME (requires params: { amount: number, source: string })
- ADD_EXPENSE (requires params: { amount: number, category: string } - category must be mapped to one of: Food, Fuel, Transport, Education, Shopping, Bills, Entertainment, Health, Other)
- AFFORDABILITY_CHECK (requires params: { amount: number, item: string })
- DAILY_ALLOWANCE (no params required)
- SAVINGS_GOAL_STATUS (no params required)
- SHOW_EXPENSES_MONTH (no params required)
- SHOW_SPENDING_CATEGORY (no params required)
- BUDGET_SUMMARY (no params required)
- BUDGET_HEALTH (no params required)
- FINANCIAL_PERSONALITY (no params required)
- DETECT_RECURRING (no params required)
- CHAT (for greetings, general finance questions, or unrecognized commands. Provide a direct response in the "reply" field)

Respond in standard JSON:
{
  "intent": "INTENT_NAME",
  "params": { ... },
  "reply": "..."
}
`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'grok-beta',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: message }
        ],
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new Error(`Grok HTTP Error: ${response.status}`);
    }

    const data = await response.json();
    const responseText = data.choices?.[0]?.message?.content;
    if (!responseText) {
      throw new Error("Empty response from Grok API");
    }

    const result = JSON.parse(responseText.trim());
    return {
      matched: result.intent !== 'CHAT' && result.intent !== 'UNKNOWN',
      intent: result.intent,
      params: result.params || {},
      reply: result.reply || null,
      isAiMode: true
    };
  }
};
