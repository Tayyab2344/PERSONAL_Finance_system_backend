import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { db } from './config/database.js';
import router from './routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // Allow all origins for dev
  credentials: true
}));
app.use(express.json());

// Bind API routes
app.use('/api', router);

// Default Route
app.get('/', (req, res) => {
  res.send('AI-Powered Personal Finance Assistant API is running.');
});


// Start Server
db.init()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error("Server startup failed - Database initialization error:", err);
  });
