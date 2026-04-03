// ──────────────────────────────────────────────────────────
// DATABASE.JS — Supports both SQLite (local/dev) and MySQL (production)
// ──────────────────────────────────────────────────────────
//
// HOW IT WORKS:
// If MYSQL_HOST is set in environment variables → uses MySQL
// Otherwise → falls back to SQLite (same as before)
//
// This means you can develop locally with SQLite and deploy
// to production with MySQL without changing any code.
//
// REQUIRED ENV VARS FOR MYSQL:
//   MYSQL_HOST     — e.g. "sql123.hostinger.com" or an IP
//   MYSQL_USER     — e.g. "u123456789_quizuser"
//   MYSQL_PASSWORD — the database user's password
//   MYSQL_DATABASE — e.g. "u123456789_pubquiz"
//   MYSQL_PORT     — optional, defaults to 3306
//

const USE_MYSQL = !!process.env.MYSQL_HOST;

let dbHelpers;

if (USE_MYSQL) {
  // ==========================================
  // MYSQL MODE
  // ==========================================
  const mysql = require('mysql2/promise');

  let pool;

  const initPromise = (async () => {
    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: parseInt(process.env.MYSQL_PORT || '3306'),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log('Connected to MySQL database');

    // Create tables (MySQL syntax)
    const conn = await pool.getConnection();
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          access_code VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'draft',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active TINYINT(1) DEFAULT 1
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS rounds (
          id INT AUTO_INCREMENT PRIMARY KEY,
          quiz_id INT NOT NULL,
          round_number INT NOT NULL,
          is_active TINYINT(1) DEFAULT 0,
          is_closed TINYINT(1) DEFAULT 0,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS questions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          round_id INT NOT NULL,
          question_text TEXT NOT NULL,
          question_type VARCHAR(20) DEFAULT 'multiple_choice',
          image_url TEXT,
          option_a VARCHAR(500),
          option_b VARCHAR(500),
          option_c VARCHAR(500),
          option_d VARCHAR(500),
          correct_answer VARCHAR(500) NOT NULL,
          FOREIGN KEY (round_id) REFERENCES rounds(id)
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS teams (
          id INT AUTO_INCREMENT PRIMARY KEY,
          quiz_id INT NOT NULL,
          team_name VARCHAR(255) NOT NULL,
          session_token VARCHAR(255) UNIQUE NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS answers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          team_id INT NOT NULL,
          question_id INT NOT NULL,
          selected_answer VARCHAR(10),
          answer_text TEXT,
          is_correct TINYINT(1) DEFAULT NULL,
          submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (team_id) REFERENCES teams(id),
          FOREIGN KEY (question_id) REFERENCES questions(id),
          UNIQUE KEY unique_team_question (team_id, question_id)
        )
      `);

      console.log('MySQL schema initialized');
    } finally {
      conn.release();
    }
  })();

  dbHelpers = {
    ensureInitialized: async () => {
      await initPromise;
    },

    // Run a query (INSERT, UPDATE, DELETE)
    // Returns { id, changes } to match SQLite format
    run: async (sql, params = []) => {
      await initPromise;
      const [result] = await pool.execute(sql, params);
      return { id: result.insertId, changes: result.affectedRows };
    },

    // Get a single row
    get: async (sql, params = []) => {
      await initPromise;
      const [rows] = await pool.execute(sql, params);
      return rows[0] || undefined;
    },

    // Get all rows
    all: async (sql, params = []) => {
      await initPromise;
      const [rows] = await pool.execute(sql, params);
      return rows;
    },
  };

} else {
  // ==========================================
  // SQLITE MODE (default — local development)
  // ==========================================
  const sqlite3 = require('sqlite3').verbose();
  const path = require('path');

  const DB_PATH = path.join(__dirname, '../data/quiz.db');

  let db;
  let isInitialized = false;
  const initPromise = new Promise((resolve, reject) => {
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

  function initializeDatabase(resolve, reject) {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          access_code TEXT NOT NULL,
          status TEXT DEFAULT 'draft',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active INTEGER DEFAULT 1
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS rounds (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          quiz_id INTEGER NOT NULL,
          round_number INTEGER NOT NULL,
          is_active INTEGER DEFAULT 0,
          is_closed INTEGER DEFAULT 0,
          FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
        )
      `);

      // Migration: add is_closed column if it doesn't exist
      db.run(`ALTER TABLE rounds ADD COLUMN is_closed INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('Migration error:', err);
        }
      });

      db.run(`
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          round_id INTEGER NOT NULL,
          question_text TEXT NOT NULL,
          question_type TEXT DEFAULT 'multiple_choice',
          image_url TEXT,
          option_a TEXT,
          option_b TEXT,
          option_c TEXT,
          option_d TEXT,
          correct_answer TEXT NOT NULL,
          FOREIGN KEY (round_id) REFERENCES rounds(id)
        )
      `);

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

      db.run(`
        CREATE TABLE IF NOT EXISTS answers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          team_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          selected_answer TEXT,
          answer_text TEXT,
          is_correct INTEGER DEFAULT NULL,
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

  dbHelpers = {
    ensureInitialized: async () => {
      await initPromise;
    },

    run: async (sql, params = []) => {
      await initPromise;
      return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      });
    },

    get: async (sql, params = []) => {
      await initPromise;
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      });
    },

    all: async (sql, params = []) => {
      await initPromise;
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    },
  };
}

module.exports = { dbHelpers };
