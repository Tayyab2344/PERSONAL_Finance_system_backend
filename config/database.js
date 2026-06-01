import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

console.log("Database Mode: PostgreSQL (Neon Only)");

const getLocalDateString = (d = new Date()) => {
  const localD = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
  const year = localD.getFullYear();
  const month = (localD.getMonth() + 1).toString().padStart(2, '0');
  const day = localD.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatDateString = (date) => {
  if (!date) {
    return getLocalDateString();
  }
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return getLocalDateString();
  }
  return getLocalDateString(d);
};

const formatRowDate = (d) => {
  if (d instanceof Date) {
    const localD = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Karachi' }));
    const year = localD.getFullYear();
    const month = (localD.getMonth() + 1).toString().padStart(2, '0');
    const day = localD.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return d;
};

export const db = {
  async init() {
    // Postgres: Create tables if they do not exist
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS incomes (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          source VARCHAR(255) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          date DATE NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS expenses (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          category VARCHAR(100) NOT NULL,
          amount DECIMAL(12, 2) NOT NULL,
          description TEXT,
          date DATE NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      try {
        await client.query('ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;');
      } catch (err) {
        // Column may already exist
      }

      try {
        await client.query("ALTER TABLE incomes ADD COLUMN IF NOT EXISTS account_type VARCHAR(50) DEFAULT 'Cash';");
      } catch (err) {
        // ignore
      }

      try {
        await client.query("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS account_type VARCHAR(50) DEFAULT 'Cash';");
      } catch (err) {
        // ignore
      }

      await client.query(`
        CREATE TABLE IF NOT EXISTS saving_goals (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          goal_name VARCHAR(255) NOT NULL,
          target_amount DECIMAL(12, 2) NOT NULL,
          current_amount DECIMAL(12, 2) DEFAULT 0.00,
          target_date DATE NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS goal_contributions (
          id SERIAL PRIMARY KEY,
          goal_id INTEGER REFERENCES saving_goals(id) ON DELETE CASCADE,
          amount DECIMAL(12, 2) NOT NULL,
          contribution_date DATE NOT NULL
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          response TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS budgets (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          month VARCHAR(7) NOT NULL, -- Format: YYYY-MM
          savings_target DECIMAL(12, 2) NOT NULL,
          UNIQUE(user_id, month)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(255) NOT NULL,
          details TEXT,
          ip_address VARCHAR(45),
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("PostgreSQL database schemas verified/created successfully.");
    } catch (err) {
      console.error("Error creating database tables:", err);
    } finally {
      client.release();
    }
  },

  // USER OPERATIONS
  async addUser(name, email, passwordHash) {
    const res = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name, email, passwordHash]
    );
    return res.rows[0];
  },

  async getUserByEmail(email) {
    const res = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return res.rows[0] || null;
  },

  async getUserById(id) {
    const intId = parseInt(id, 10);
    const res = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = $1', [intId]);
    return res.rows[0] || null;
  },

  async updateUserPassword(id, passwordHash) {
    const intId = parseInt(id, 10);
    const res = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email',
      [passwordHash, intId]
    );
    return res.rows[0];
  },

  // INCOME OPERATIONS
  async addIncome(userId, source, amount, date, accountType = 'Cash') {
    const decAmount = parseFloat(amount);
    const intUserId = parseInt(userId, 10);
    const formattedDate = formatDateString(date);

    const res = await pool.query(
      'INSERT INTO incomes (user_id, source, amount, date, account_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [intUserId, source, decAmount, formattedDate, accountType]
    );
    return res.rows[0] ? { ...res.rows[0], amount: parseFloat(res.rows[0].amount), date: formatRowDate(res.rows[0].date) } : null;
  },

  async getIncomes(userId, month = null) {
    const intUserId = parseInt(userId, 10);
    let query = 'SELECT * FROM incomes WHERE user_id = $1';
    const params = [intUserId];
    if (month) {
      query += " AND TO_CHAR(date, 'YYYY-MM') = $2";
      params.push(month);
    }
    query += ' ORDER BY date DESC, id DESC';
    const res = await pool.query(query, params);
    return res.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      date: formatRowDate(r.date)
    }));
  },

  async updateIncome(userId, incomeId, source, amount, date, accountType) {
    const intUserId = parseInt(userId, 10);
    const intIncomeId = parseInt(incomeId, 10);
    const decAmount = parseFloat(amount);
    const formattedDate = formatDateString(date);

    const res = await pool.query(
      'UPDATE incomes SET source = $1, amount = $2, date = $3, account_type = $4 WHERE id = $5 AND user_id = $6 RETURNING *',
      [source, decAmount, formattedDate, accountType || 'Cash', intIncomeId, intUserId]
    );
    return res.rows[0] ? { ...res.rows[0], amount: parseFloat(res.rows[0].amount), date: formatRowDate(res.rows[0].date) } : null;
  },

  async deleteIncome(userId, incomeId) {
    const intUserId = parseInt(userId, 10);
    const intIncomeId = parseInt(incomeId, 10);
    await pool.query('DELETE FROM incomes WHERE id = $1 AND user_id = $2', [intIncomeId, intUserId]);
    return true;
  },

  // EXPENSE OPERATIONS
  async addExpense(userId, category, amount, description, date, createdAt = null, accountType = 'Cash') {
    const decAmount = parseFloat(amount);
    const intUserId = parseInt(userId, 10);
    const formattedDate = formatDateString(date);
    const finalCreatedAt = createdAt ? new Date(createdAt).toISOString() : new Date().toISOString();

    const res = await pool.query(
      'INSERT INTO expenses (user_id, category, amount, description, date, created_at, account_type) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [intUserId, category, decAmount, description || '', formattedDate, finalCreatedAt, accountType]
    );
    return res.rows[0] ? { ...res.rows[0], amount: parseFloat(res.rows[0].amount), date: formatRowDate(res.rows[0].date) } : null;
  },

  async getExpenses(userId, month = null) {
    const intUserId = parseInt(userId, 10);
    let query = 'SELECT * FROM expenses WHERE user_id = $1';
    const params = [intUserId];
    if (month) {
      query += " AND TO_CHAR(date, 'YYYY-MM') = $2";
      params.push(month);
    }
    query += ' ORDER BY date DESC, id DESC';
    const res = await pool.query(query, params);
    return res.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      date: formatRowDate(r.date)
    }));
  },

  async deleteExpense(userId, expenseId) {
    const intUserId = parseInt(userId, 10);
    const intExpenseId = parseInt(expenseId, 10);
    await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [intExpenseId, intUserId]);
    return true;
  },

  async updateExpense(userId, expenseId, category, amount, description, date, accountType) {
    const intUserId = parseInt(userId, 10);
    const intExpenseId = parseInt(expenseId, 10);
    const decAmount = parseFloat(amount);
    const formattedDate = formatDateString(date);

    const res = await pool.query(
      'UPDATE expenses SET category = $1, amount = $2, description = $3, date = $4, account_type = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
      [category, decAmount, description || '', formattedDate, accountType || 'Cash', intExpenseId, intUserId]
    );
    return res.rows[0] ? { ...res.rows[0], amount: parseFloat(res.rows[0].amount), date: formatRowDate(res.rows[0].date) } : null;
  },

  // SAVINGS GOALS OPERATIONS
  async addSavingGoal(userId, goalName, targetAmount, currentAmount = 0.00, targetDate) {
    const intUserId = parseInt(userId, 10);
    const decTarget = parseFloat(targetAmount);
    const decCurrent = parseFloat(currentAmount);
    const formattedDate = formatDateString(targetDate);

    const res = await pool.query(
      'INSERT INTO saving_goals (user_id, goal_name, target_amount, current_amount, target_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [intUserId, goalName, decTarget, decCurrent, formattedDate]
    );
    return res.rows[0] ? {
      ...res.rows[0],
      target_amount: parseFloat(res.rows[0].target_amount),
      current_amount: parseFloat(res.rows[0].current_amount),
      target_date: formatRowDate(res.rows[0].target_date)
    } : null;
  },

  async getSavingGoals(userId) {
    const intUserId = parseInt(userId, 10);
    const res = await pool.query('SELECT * FROM saving_goals WHERE user_id = $1 ORDER BY id DESC', [intUserId]);
    return res.rows.map(r => ({
      ...r,
      target_amount: parseFloat(r.target_amount),
      current_amount: parseFloat(r.current_amount),
      target_date: formatRowDate(r.target_date)
    }));
  },

  async updateSavingGoalCurrentAmount(userId, goalId, newAmount) {
    const intUserId = parseInt(userId, 10);
    const intGoalId = parseInt(goalId, 10);
    const decAmount = parseFloat(newAmount);

    const res = await pool.query(
      'UPDATE saving_goals SET current_amount = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [decAmount, intGoalId, intUserId]
    );
    return res.rows[0] ? {
      ...res.rows[0],
      target_amount: parseFloat(res.rows[0].target_amount),
      current_amount: parseFloat(res.rows[0].current_amount),
      target_date: formatRowDate(res.rows[0].target_date)
    } : null;
  },

  async addGoalContribution(userId, goalId, amount, date) {
    const intUserId = parseInt(userId, 10);
    const intGoalId = parseInt(goalId, 10);
    const decAmount = parseFloat(amount);
    const formattedDate = formatDateString(date);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Check ownership
      const goalCheck = await client.query('SELECT * FROM saving_goals WHERE id = $1 AND user_id = $2', [intGoalId, intUserId]);
      if (goalCheck.rows.length === 0) {
        throw new Error("Goal not found or access denied");
      }
      // Insert contribution
      const contribRes = await client.query(
        'INSERT INTO goal_contributions (goal_id, amount, contribution_date) VALUES ($1, $2, $3) RETURNING *',
        [intGoalId, decAmount, formattedDate]
      );
      // Update goal current amount
      const updatedGoalRes = await client.query(
        'UPDATE saving_goals SET current_amount = current_amount + $1 WHERE id = $2 RETURNING *',
        [decAmount, intGoalId]
      );
      await client.query('COMMIT');
      return {
        contribution: {
          ...contribRes.rows[0],
          amount: parseFloat(contribRes.rows[0].amount),
          contribution_date: formatRowDate(contribRes.rows[0].contribution_date)
        },
        goal: {
          ...updatedGoalRes.rows[0],
          target_amount: parseFloat(updatedGoalRes.rows[0].target_amount),
          current_amount: parseFloat(updatedGoalRes.rows[0].current_amount),
          target_date: formatRowDate(updatedGoalRes.rows[0].target_date)
        }
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getGoalContributions(userId, goalId) {
    const intUserId = parseInt(userId, 10);
    const intGoalId = parseInt(goalId, 10);
    const res = await pool.query(`
      SELECT gc.* FROM goal_contributions gc
      JOIN saving_goals sg ON gc.goal_id = sg.id
      WHERE gc.goal_id = $1 AND sg.user_id = $2
      ORDER BY gc.contribution_date DESC, gc.id DESC
    `, [intGoalId, intUserId]);
    return res.rows.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      contribution_date: formatRowDate(r.contribution_date)
    }));
  },

  // CHAT HISTORY OPERATIONS
  async getChatHistory(userId, limit = 50) {
    const intUserId = parseInt(userId, 10);
    const res = await pool.query('SELECT * FROM chat_history WHERE user_id = $1 ORDER BY timestamp ASC LIMIT $2', [intUserId, limit]);
    return res.rows;
  },

  async addChatHistory(userId, message, response) {
    const intUserId = parseInt(userId, 10);
    const res = await pool.query(
      'INSERT INTO chat_history (user_id, message, response) VALUES ($1, $2, $3) RETURNING *',
      [intUserId, message, response]
    );
    return res.rows[0];
  },

  // BUDGET OPERATIONS
  async getBudget(userId, month) {
    const intUserId = parseInt(userId, 10);
    const res = await pool.query('SELECT * FROM budgets WHERE user_id = $1 AND month = $2', [intUserId, month]);
    if (res.rows.length > 0) {
      return { ...res.rows[0], savings_target: parseFloat(res.rows[0].savings_target) };
    }
    return null;
  },

  async getBudgets(userId) {
    const intUserId = parseInt(userId, 10);
    const res = await pool.query('SELECT * FROM budgets WHERE user_id = $1 ORDER BY month DESC', [intUserId]);
    return res.rows.map(r => ({ ...r, savings_target: parseFloat(r.savings_target) }));
  },

  async clearUserData(userId) {
    const intUserId = parseInt(userId, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM goal_contributions WHERE goal_id IN (SELECT id FROM saving_goals WHERE user_id = $1)', [intUserId]);
      await client.query('DELETE FROM saving_goals WHERE user_id = $1', [intUserId]);
      await client.query('DELETE FROM expenses WHERE user_id = $1', [intUserId]);
      await client.query('DELETE FROM incomes WHERE user_id = $1', [intUserId]);
      await client.query('DELETE FROM budgets WHERE user_id = $1', [intUserId]);
      await client.query('DELETE FROM chat_history WHERE user_id = $1', [intUserId]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async upsertBudget(userId, month, savingsTarget) {
    const intUserId = parseInt(userId, 10);
    const decTarget = parseFloat(savingsTarget);

    const res = await pool.query(`
      INSERT INTO budgets (user_id, month, savings_target)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, month)
      DO UPDATE SET savings_target = EXCLUDED.savings_target
      RETURNING *
    `, [intUserId, month, decTarget]);
    return { ...res.rows[0], savings_target: parseFloat(res.rows[0].savings_target) };
  },

  async addAuditLog(userId, action, details, ipAddress = null) {
    const intUserId = userId ? parseInt(userId, 10) : null;
    try {
      await pool.query(
        'INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES ($1, $2, $3, $4)',
        [intUserId, action, details, ipAddress]
      );
    } catch (err) {
      console.error("Failed to insert audit log:", err);
    }
  }
};
