const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

// Database file path
// Allow override via DB_PATH env for Windows I/O issues (e.g. E: drive)
// If E: drive has I/O issues, try setting DB_PATH to a local drive like C:\temp\db.sqlite
let DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'db.sqlite');

// If database is on E: drive and having I/O issues, use a local temp location
// Check if we're on E: drive and if so, use local drive instead
const originalPath = DB_PATH;
let shouldCopyDatabase = false;
if (DB_PATH.startsWith('E:\\') || DB_PATH.startsWith('E:/')) {
  const os = require('os');
  const localDbPath = path.join(os.tmpdir(), 'zyse_db.sqlite');
  console.log(`⚠️  E: drive detected. Using local database: ${localDbPath}`);
  console.log(`   Original path: ${originalPath}`);
  
  // Try to copy the old database if it exists
  if (fs.existsSync(originalPath)) {
    try {
      // Check if local database exists and get its size
      let shouldCopy = true;
      if (fs.existsSync(localDbPath)) {
        const localStats = fs.statSync(localDbPath);
        const originalStats = fs.statSync(originalPath);
        // Only copy if original is larger (has more data) or local is very small (likely empty)
        if (localStats.size >= originalStats.size && localStats.size > 10000) {
          shouldCopy = false;
          console.log(`   Using existing local database (${localStats.size} bytes).`);
        } else {
          console.log(`   Local database is smaller or empty. Copying from E: drive...`);
        }
      }
      
      if (shouldCopy) {
        console.log(`   Copying database from E: drive (${fs.statSync(originalPath).size} bytes)...`);
        fs.copyFileSync(originalPath, localDbPath);
        console.log(`   ✅ Database copied successfully!`);
        shouldCopyDatabase = true;
      }
    } catch (copyErr) {
      console.log(`   ⚠️  Could not copy database: ${copyErr.message}`);
      if (!fs.existsSync(localDbPath)) {
        console.log(`   Starting with fresh database.`);
      }
    }
  } else {
    console.log(`   Original database not found on E: drive.`);
  }
  
  console.log(`   If you need to use E: drive, fix write permissions on E:\\Project\\ZYSE`);
  DB_PATH = localDbPath;
}

// Create and initialize database
function initDB() {
  return new Promise((resolve, reject) => {
    // Check if database file exists and is accessible
    try {
      // Ensure directory exists
      const dbDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      
      // Try to remove any stale journal/WAL files that might be locking the database
      const journalPath = DB_PATH + '-journal';
      const walPath = DB_PATH + '-wal';
      const shmPath = DB_PATH + '-shm';
      
      if (fs.existsSync(journalPath)) {
        try {
          fs.unlinkSync(journalPath);
          console.log('Removed stale journal file');
        } catch (e) {
          console.log('Could not remove journal file:', e.message);
        }
      }
      if (fs.existsSync(walPath)) {
        try {
          fs.unlinkSync(walPath);
          console.log('Removed stale WAL file');
        } catch (e) {
          console.log('Could not remove WAL file:', e.message);
        }
      }
      if (fs.existsSync(shmPath)) {
        try {
          fs.unlinkSync(shmPath);
          console.log('Removed stale SHM file');
        } catch (e) {
          console.log('Could not remove SHM file:', e.message);
        }
      }
    } catch (dirErr) {
      console.error('Error preparing database directory:', dirErr.message);
    }

    // Use better error handling for Windows I/O issues
    // Try opening with explicit flags and error handling
    const openFlags = sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE;
    const db = new sqlite3.Database(DB_PATH, openFlags, (err) => {
      if (err) {
        console.error('Error opening database:', err.message);
        console.error('Database path:', DB_PATH);
        console.error('Error code:', err.code, 'Error number:', err.errno);
        
        // If it's an I/O error, try to check if the file is accessible
        if (err.code === 'SQLITE_IOERR') {
          try {
            // Try to read the file to check if it's accessible
            const stats = fs.statSync(DB_PATH);
            console.log('Database file exists, size:', stats.size, 'bytes');
            console.log('File is readable:', fs.constants.R_OK ? 'Yes' : 'No');
            console.log('File is writable:', fs.constants.W_OK ? 'Yes' : 'No');
          } catch (statErr) {
            console.error('Cannot access database file:', statErr.message);
          }
        }
        
        // Retry once after a longer delay
        setTimeout(() => {
          console.log('Retrying database connection...');
          const retryDb = new sqlite3.Database(DB_PATH, openFlags, (retryErr) => {
            if (retryErr) {
              console.error('Retry failed:', retryErr.message);
              console.error('This may indicate a disk I/O problem or file permission issue');
              console.error('Please check:');
              console.error('1. The E: drive is accessible and not full');
              console.error('2. You have write permissions to E:\\Project\\ZYSE');
              console.error('3. No antivirus is blocking database access');
              reject(retryErr);
              return;
            }
            console.log('Connected to SQLite database (retry successful)');
            // Set busy timeout to handle locks better
            retryDb.run('PRAGMA busy_timeout = 10000', () => {});
            // Don't try to set journal mode if it's causing I/O errors
            initializeTables(retryDb, resolve, reject);
          });
        }, 3000);
        return;
      }
      console.log('Connected to SQLite database');
      // Set busy timeout to handle locks better
      db.run('PRAGMA busy_timeout = 10000', () => {});
      // Skip journal mode setting if it causes I/O errors - use default
      initializeTables(db, resolve, reject);
    });
  });
}

function initializeTables(db, resolve, reject) {
    let packagesSeeded = false;
    let transactionsReady = false;

    function checkReady() {
      if (packagesSeeded && transactionsReady) {
        console.log('Database initialization complete');
        db.close((closeErr) => {
          if (closeErr) console.error('initDB close:', closeErr.message);
          resolve();
        });
      }
    }

    // Create tables
    db.serialize(() => {
      // Users table
      // Note: SQLite doesn't support modifying UNIQUE constraints easily
      // For new databases, phone will be UNIQUE and NOT NULL, email will be optional
      // For existing databases, we handle uniqueness in application logic
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        phone TEXT UNIQUE NOT NULL,
        level TEXT DEFAULT 'L1',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_admin INTEGER DEFAULT 0,
        invited_by_user_id INTEGER,
        FOREIGN KEY (invited_by_user_id) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating users table:', err.message);
        } else {
          console.log('Users table ready');
          // Add new columns if they don't exist (for existing databases)
          db.run(`ALTER TABLE users ADD COLUMN full_name TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN phone TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN level TEXT DEFAULT 'L1'`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN withdrawal_password TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN withdrawal_wallet TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN withdrawal_phone TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN profile_picture TEXT`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN last_withdrawal_date DATE`, () => {});
          db.run(`ALTER TABLE users ADD COLUMN invited_by_user_id INTEGER`, () => {});
          
          // Create unique index on phone for existing databases (if it doesn't exist)
          db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`, (err) => {
            if (err && !err.message.includes('already exists')) {
              console.log('Note: Phone unique index may already exist or table needs phone data');
            }
          });
        }
      });

      // Packages table
      db.run(`CREATE TABLE IF NOT EXISTS packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        amount INTEGER NOT NULL,
        daily_rate REAL NOT NULL,
        level TEXT UNIQUE,
        daily_income REAL NOT NULL
      )`, (err) => {
        if (err) {
          console.error('Error creating packages table:', err.message);
          reject(err);
          return;
        }
        console.log('Packages table ready');
        // Add new columns if they don't exist (for existing databases)
        // Note: SQLite doesn't support adding UNIQUE constraint via ALTER TABLE
        // So we add the columns first, then recreate the table if needed
        db.run(`ALTER TABLE packages ADD COLUMN level TEXT`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('Note: level column may already exist');
          }
        });
        db.run(`ALTER TABLE packages ADD COLUMN daily_income REAL`, (err) => {
          if (err && !err.message.includes('duplicate column')) {
            console.log('Note: daily_income column may already exist');
          }
        });
        // Seed packages
        seedPackages(db).then(() => {
          packagesSeeded = true;
          checkReady();
        }).catch((seedErr) => {
          console.error('Error seeding packages:', seedErr);
          reject(seedErr);
        });
      });

      // Investments table
      db.run(`CREATE TABLE IF NOT EXISTS investments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        package_id INTEGER NOT NULL,
        deposit_amount REAL NOT NULL,
        start_date DATE NOT NULL,
        maturity_date DATE NOT NULL,
        total_accruals REAL DEFAULT 0,
        status TEXT DEFAULT 'active',
        wallet TEXT,
        transaction_txt TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (package_id) REFERENCES packages(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating investments table:', err.message);
        } else {
          console.log('Investments table ready');
          // Add wallet and transaction_txt columns if they don't exist (for existing databases)
          db.run(`ALTER TABLE investments ADD COLUMN wallet TEXT`, () => {});
          db.run(`ALTER TABLE investments ADD COLUMN transaction_txt TEXT`, () => {});
        }
      });

      // Transactions table
      db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        investment_id INTEGER,
        deleted INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (investment_id) REFERENCES investments(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating transactions table:', err.message);
          reject(err);
        } else {
          console.log('Transactions table ready');
          // Add deleted column if it doesn't exist (for existing databases)
          // Check if column exists first by querying all columns
          db.all("PRAGMA table_info(transactions)", (pragmaErr, columns) => {
            if (pragmaErr) {
              console.error('Error checking transactions table info:', pragmaErr.message);
              // Try to add column anyway
              addDeletedColumn(db);
            } else {
              // Check if deleted column exists
              const hasDeletedColumn = columns && columns.some(col => col.name === 'deleted');
              if (!hasDeletedColumn) {
                console.log('Deleted column not found, adding it...');
                addDeletedColumn(db);
              } else {
                console.log('Deleted column already exists in transactions table');
                transactionsReady = true;
                checkReady();
              }
            }
          });
          
          function addDeletedColumn(dbInstance) {
            dbInstance.run(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`, (alterErr) => {
              if (alterErr) {
                // Column might already exist, which is fine
                if (alterErr.message && (alterErr.message.includes('duplicate column') || alterErr.message.includes('already exists'))) {
                  console.log('Deleted column already exists in transactions table');
                } else {
                  console.error('Error adding deleted column to transactions table:', alterErr.message);
                  console.error('You may need to manually add: ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0');
                }
              } else {
                console.log('✅ Successfully added deleted column to transactions table');
              }
              // Mark transactions as ready regardless of column add result
              transactionsReady = true;
              checkReady();
            });
          }
          
          // Certificates table
          db.run(`CREATE TABLE IF NOT EXISTS certificates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            file_path TEXT NOT NULL,
            description TEXT,
            uploaded_by INTEGER,
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (uploaded_by) REFERENCES users(id)
          )`, (err) => {
            if (err) {
              console.error('Error creating certificates table:', err.message);
            } else {
              console.log('Certificates table ready');
              
              // Announcements table
              db.run(`CREATE TABLE IF NOT EXISTS announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                image_path TEXT,
                created_by INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME,
                is_active INTEGER DEFAULT 1,
                priority INTEGER DEFAULT 0,
                FOREIGN KEY (created_by) REFERENCES users(id)
              )`, (err) => {
                if (err) {
                  console.error('Error creating announcements table:', err.message);
                } else {
                  console.log('Announcements table ready');
                  // Add image_path column if it doesn't exist (for existing databases)
                  db.run(`ALTER TABLE announcements ADD COLUMN image_path TEXT`, () => {});
                }
              });
              
              // Withdrawal requests table
              // First, check if table exists and needs migration
              db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='withdrawal_requests'", (tableErr, tableRow) => {
                if (tableErr) {
                  console.error('Error checking withdrawal_requests table:', tableErr.message);
                  transactionsReady = true;
                  checkReady();
                  return;
                }
                
                if (tableRow) {
                  // Table exists - check if it needs migration (investment_id NOT NULL constraint)
                  // Get all columns using db.all (PRAGMA table_info returns multiple rows)
                  db.all("PRAGMA table_info(withdrawal_requests)", (infoErr, columns) => {
                    if (infoErr) {
                      console.error('Error getting table info:', infoErr.message);
                      transactionsReady = true;
                      checkReady();
                      return;
                    }
                    
                    // Check if investment_id column exists and if we need to migrate
                    const investmentIdColumn = columns.find(col => col.name === 'investment_id');
                    const needsMigration = investmentIdColumn && investmentIdColumn.notnull === 1;
                    
                    if (needsMigration) {
                      console.log('⚠️ Migration needed: investment_id has NOT NULL constraint. Migrating table...');
                      
                      // Disable foreign keys temporarily for migration
                      db.run('PRAGMA foreign_keys = OFF', (fkErr) => {
                        if (fkErr) {
                          console.error('Error disabling foreign keys:', fkErr.message);
                          transactionsReady = true;
                          checkReady();
                          return;
                        }
                        
                        // Get existing data
                        db.all('SELECT * FROM withdrawal_requests', (selectErr, rows) => {
                          if (selectErr) {
                            console.error('Error reading existing data:', selectErr.message);
                            db.run('PRAGMA foreign_keys = ON', () => {});
                            transactionsReady = true;
                            checkReady();
                            return;
                          }
                          
                          console.log(`  Found ${rows.length} existing withdrawal requests to migrate`);
                          
                          // Drop old table
                          db.run('DROP TABLE withdrawal_requests', (dropErr) => {
                            if (dropErr) {
                              console.error('Error dropping old table:', dropErr.message);
                              db.run('PRAGMA foreign_keys = ON', () => {});
                              transactionsReady = true;
                              checkReady();
                              return;
                            }
                            
                            // Create new table with correct schema (investment_id allows NULL)
                            db.run(`CREATE TABLE withdrawal_requests (
                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                              user_id INTEGER NOT NULL,
                              investment_id INTEGER,
                              amount REAL NOT NULL,
                              gross_amount REAL NOT NULL,
                              charge REAL NOT NULL,
                              net_amount REAL NOT NULL,
                              wallet TEXT NOT NULL,
                              phone TEXT NOT NULL,
                              status TEXT DEFAULT 'pending',
                              requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                              processed_at DATETIME,
                              processed_by INTEGER,
                              admin_notes TEXT,
                              FOREIGN KEY (user_id) REFERENCES users(id),
                              FOREIGN KEY (investment_id) REFERENCES investments(id),
                              FOREIGN KEY (processed_by) REFERENCES users(id)
                            )`, (createErr) => {
                              if (createErr) {
                                console.error('Error creating new table:', createErr.message);
                                db.run('PRAGMA foreign_keys = ON', () => {});
                                transactionsReady = true;
                                checkReady();
                                return;
                              }
                              
                              console.log('  ✅ New table created with NULL-allowing investment_id');
                              
                              // Re-insert data if any
                              if (rows.length > 0) {
                                const stmt = db.prepare(`INSERT INTO withdrawal_requests 
                                  (id, user_id, investment_id, amount, gross_amount, charge, net_amount, wallet, phone, status, requested_at, processed_at, processed_by, admin_notes)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                                
                                let inserted = 0;
                                rows.forEach(row => {
                                  stmt.run([
                                    row.id, row.user_id, row.investment_id, row.amount, row.gross_amount,
                                    row.charge, row.net_amount, row.wallet, row.phone, row.status,
                                    row.requested_at, row.processed_at, row.processed_by, row.admin_notes
                                  ], (insertErr) => {
                                    if (insertErr) {
                                      console.error(`  Error inserting row ${row.id}:`, insertErr.message);
                                    } else {
                                      inserted++;
                                    }
                                  });
                                });
                                
                                stmt.finalize((finalizeErr) => {
                                  if (finalizeErr) {
                                    console.error('Error finalizing insert:', finalizeErr.message);
                                  } else {
                                    console.log(`  ✅ Re-inserted ${inserted}/${rows.length} withdrawal requests`);
                                  }
                                  
                                  // Re-enable foreign keys
                                  db.run('PRAGMA foreign_keys = ON', (fkOnErr) => {
                                    if (fkOnErr) {
                                      console.error('Error enabling foreign keys:', fkOnErr.message);
                                    }
                                    console.log('✅ Migration completed: investment_id can now be NULL');
                                    transactionsReady = true;
                                    checkReady();
                                  });
                                });
                              } else {
                                // No data to re-insert, just re-enable foreign keys
                                db.run('PRAGMA foreign_keys = ON', (fkOnErr) => {
                                  if (fkOnErr) {
                                    console.error('Error enabling foreign keys:', fkOnErr.message);
                                  }
                                  console.log('✅ Migration completed: investment_id can now be NULL');
                                  transactionsReady = true;
                                  checkReady();
                                });
                              }
                            });
                          });
                        });
                      });
                    } else {
                      // Table exists and doesn't need migration
                      console.log('Withdrawal requests table ready (investment_id allows NULL)');
                      transactionsReady = true;
                      checkReady();
                    }
                  });
                } else {
                  // Table doesn't exist - create it with correct schema
                  db.run(`CREATE TABLE withdrawal_requests (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    investment_id INTEGER,
                    amount REAL NOT NULL,
                    gross_amount REAL NOT NULL,
                    charge REAL NOT NULL,
                    net_amount REAL NOT NULL,
                    wallet TEXT NOT NULL,
                    phone TEXT NOT NULL,
                    status TEXT DEFAULT 'pending',
                    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    processed_by INTEGER,
                    admin_notes TEXT,
                    FOREIGN KEY (user_id) REFERENCES users(id),
                    FOREIGN KEY (investment_id) REFERENCES investments(id),
                    FOREIGN KEY (processed_by) REFERENCES users(id)
                  )`, (err) => {
                    if (err) {
                      console.error('Error creating withdrawal_requests table:', err.message);
                    } else {
                      console.log('Withdrawal requests table created');
                    }
                    transactionsReady = true;
                    checkReady();
                  });
                }
              });
            }
          });
        }
      });
    });
}

// Seed packages with amounts and rates (L1-L10 system)
function seedPackages(db) {
  return new Promise((resolve, reject) => {
    // New level-based packages: L1-L10
    const packages = [
      { level: 'L1', amount: 200, dailyIncome: 6 },
      { level: 'L2', amount: 350, dailyIncome: 8 },
      { level: 'L3', amount: 500, dailyIncome: 16 },
      { level: 'L4', amount: 1000, dailyIncome: 30 },
      { level: 'L5', amount: 2000, dailyIncome: 60 },
      { level: 'L6', amount: 4000, dailyIncome: 130 },
      { level: 'L7', amount: 6000, dailyIncome: 180 },
      { level: 'L8', amount: 10000, dailyIncome: 340 },
      { level: 'L9', amount: 15000, dailyIncome: 400 },
      { level: 'L10', amount: 20000, dailyIncome: 600 }
    ];

    // Clear existing packages
    db.run('DELETE FROM packages', (err) => {
      if (err) {
        console.error('Error clearing packages:', err.message);
        reject(err);
        return;
      }

      // Insert packages with calculated daily rates based on daily income
      const stmt = db.prepare('INSERT INTO packages (amount, daily_rate, level, daily_income) VALUES (?, ?, ?, ?)');
      let completed = 0;
      const total = packages.length;
      
      packages.forEach(pkg => {
        // Calculate daily rate: dailyIncome / amount
        const dailyRate = pkg.dailyIncome / pkg.amount;
        stmt.run(pkg.amount, dailyRate, pkg.level, pkg.dailyIncome, (err) => {
          if (err) {
            console.error(`Error inserting package ${pkg.level}:`, err.message);
            reject(err);
            return;
          }
          completed++;
          if (completed === total) {
            stmt.finalize((err) => {
              if (err) {
                console.error('Error finalizing packages insert:', err.message);
                reject(err);
              } else {
                console.log('Packages seeded successfully (L1-L10)');
                resolve();
              }
            });
          }
        });
      });
    });
  });
}

// Get database instance
function getDB() {
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);
  // Set busy timeout to handle locks better
  db.run('PRAGMA busy_timeout = 5000', () => {});
  return db;
}

// Database query helper (promisified)
function dbQuery(query, params = []) {
  return new Promise((resolve, reject) => {
    try {
      const db = getDB();
      db.all(query, params, (err, rows) => {
        db.close((closeErr) => {
          if (closeErr) {
            console.error('Error closing database:', closeErr);
          }
        });
        if (err) {
          console.error('Database query error:', err);
          console.error('Query:', query);
          console.error('Params:', params);
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    } catch (error) {
      console.error('Error creating database connection:', error);
      reject(error);
    }
  });
}

// Database run helper (promisified)
function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.run(query, params, function(err) {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

// Database get helper (promisified) - returns single row
function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get(query, params, (err, row) => {
      db.close();
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Database transaction helper - runs multiple queries in a single connection
function dbTransaction(queries) {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          db.close();
          return reject(err);
        }

        let completed = 0;
        const total = queries.length;
        const results = [];

        queries.forEach((queryObj, index) => {
          const { query, params = [] } = queryObj;
          db.run(query, params, function(err) {
            if (err) {
              db.run('ROLLBACK', () => {
                db.close();
                reject(err);
              });
              return;
            }
            results[index] = { lastID: this.lastID, changes: this.changes };
            completed++;
            
            if (completed === total) {
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  db.run('ROLLBACK', () => {
                    db.close();
                    reject(commitErr);
                  });
                  return;
                }
                db.close();
                resolve(results);
              });
            }
          });
        });
      });
    });
  });
}

module.exports = {
  initDB,
  getDB,
  dbQuery,
  dbRun,
  dbGet,
  dbTransaction
};

