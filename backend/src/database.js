const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const DB_PATH = path.join(__dirname, '../data/quiz.db');

let db;
let isInitialized = false;
const initPromise = new Promise((resolve, reject) => {
  // Create and initialize database
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
      console.error('Error opening database:', err);
      reject(err);
    } else {
      console.log('Connected to SQLite database');
      initializeDatabase(resolve, reject);
    }
  });
});

// Initialize database schema
function initializeDatabase(resolve, reject) {
  db.serialize(() => {
    // Quizzes table
    db.run(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_active INTEGER DEFAULT 1
      )
    `);

    // Rounds table
    db.run(`
      CREATE TABLE IF NOT EXISTS rounds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        round_number INTEGER NOT NULL,
        is_active INTEGER DEFAULT 0,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
      )
    `);

    // Questions table
    db.run(`
      CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        round_id INTEGER NOT NULL,
        question_text TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_answer TEXT NOT NULL,
        FOREIGN KEY (round_id) REFERENCES rounds(id)
      )
    `);

    // Teams table
    db.run(`
      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quiz_id INTEGER NOT NULL,
        team_name TEXT NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
      )
    `);

    // Answers table
    db.run(`
      CREATE TABLE IF NOT EXISTS answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        team_id INTEGER NOT NULL,
        question_id INTEGER NOT NULL,
        selected_answer TEXT NOT NULL,
        is_correct INTEGER DEFAULT 0,
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (team_id) REFERENCES teams(id),
        FOREIGN KEY (question_id) REFERENCES questions(id),
        UNIQUE(team_id, question_id)
      )
    `, (err) => {
      if (err) {
        console.error('Error creating tables:', err);
        reject(err);
      } else {
        console.log('Database schema initialized');
        isInitialized = true;
        resolve();
      }
    });
  });
}

// Database helper functions
const dbHelpers = {
  // Wait for database to be ready
  ensureInitialized: async () => {
    await initPromise;
  },

  // Run a query (INSERT, UPDATE, DELETE)
  run: async (sql, params = []) => {
    await initPromise;
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  // Get a single row
  get: async (sql, params = []) => {
    await initPromise;
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Get all rows
  all: async (sql, params = []) => {
    await initPromise;
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

module.exports = { db, dbHelpers };