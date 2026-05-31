import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db } from '../config/database.js';

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn("WARNING: JWT_SECRET environment variable is not defined. Generating a secure random secret key for this session.");
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
}

export const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: "All fields (name, email, password) are required." });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format." });
  }

  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters long." });
  }

  try {
    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      await db.addAuditLog(null, 'USER_REGISTER_FAIL', `Attempted registration with existing email: ${email}`, req.ip);
      return res.status(400).json({ error: "User with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser = await db.addUser(name, email, passwordHash);
    
    // Generate JWT token
    const token = jwt.sign({ id: newUser.id, name: newUser.name, email: newUser.email }, JWT_SECRET, { expiresIn: '7d' });

    // Audit Log
    await db.addAuditLog(newUser.id, 'USER_REGISTER', `User registered successfully: ${email}`, req.ip);

    res.status(201).json({
      message: "Registration successful",
      token,
      user: newUser
    });
  } catch (error) {
    console.error("Register Error:", error);
    res.status(500).json({ error: "Internal server error during registration." });
  }
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    const user = await db.getUserByEmail(email);
    if (!user) {
      await db.addAuditLog(null, 'USER_LOGIN_FAIL', `Failed login attempt (email not found): ${email}`, req.ip);
      return res.status(400).json({ error: "Invalid email or password." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await db.addAuditLog(user.id, 'USER_LOGIN_FAIL', `Failed login attempt (incorrect password) for: ${email}`, req.ip);
      return res.status(400).json({ error: "Invalid email or password." });
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    // Audit Log
    await db.addAuditLog(user.id, 'USER_LOGIN', `User logged in successfully: ${email}`, req.ip);

    const { password: _, ...userWithoutPassword } = user;
    res.json({
      message: "Login successful",
      token,
      user: userWithoutPassword
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error during login." });
  }
};

export const getMe = async (req, res) => {
  try {
    const user = await db.getUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    res.json(user);
  } catch (error) {
    console.error("GetMe Error:", error);
    res.status(500).json({ error: "Internal server error retrieving user profile." });
  }
};
