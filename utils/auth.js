const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { dbGet, dbQuery, dbRun } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';
const JWT_EXPIRY = '24h';

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      phone: user.phone,
      email: user.email || null, // Keep email for backward compatibility but it's optional
      isAdmin: Number(user.is_admin) === 1 || isConfiguredAdminUser(user)
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Hash password
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

// Compare password
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  refreshAdminFromDatabase(decoded)
    .then((adminState) => {
      if (adminState) {
        req.user.isAdmin = !!adminState.isAdmin;
        if (adminState.phone) req.user.phone = adminState.phone;
      }
      next();
    })
    .catch((err) => {
      console.error('refreshAdminFromDatabase:', err);
      next();
    });
}

async function refreshAdminFromDatabase(decoded) {
  const dbUser = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.userId]);
  const phone = (dbUser && dbUser.phone) || decoded.phone;
  const email = (dbUser && dbUser.email) || decoded.email;
  const fromDb = dbUser ? Number(dbUser.is_admin) === 1 : false;
  const isAdmin = fromDb || isConfiguredAdminUser(dbUser || { phone, email }) || isConfiguredAdminUser({ phone, email });

  if (dbUser && isAdmin && Number(dbUser.is_admin) !== 1) {
    await dbRun('UPDATE users SET is_admin = 1 WHERE id = ?', [dbUser.id]);
  }

  return { isAdmin, phone };
}

// Admin middleware
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Get user by email (for backward compatibility)
async function getUserByEmail(email) {
  return await dbGet('SELECT * FROM users WHERE email = ?', [email]);
}

// Normalize Zambian phone number to a standard format for comparison
// Handles: +260978891454, 0978891454, 978891454, 260978891454
function normalizeZambianPhone(phone) {
  if (!phone) return null;
  
  // Remove all non-digits
  let digits = phone.toString().trim().replace(/[^\d]/g, '');
  
  // Handle Zambian phone numbers
  // If starts with 260 (country code), remove it
  if (digits.startsWith('260')) {
    digits = digits.substring(3);
  }
  
  // If starts with 0, remove it (local format like 0978891454)
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  
  // Return last 9 digits (Zambian mobile numbers are 9 digits)
  // This handles cases like 0978891454 -> 978891454
  return digits.length >= 9 ? digits.substring(digits.length - 9) : digits;
}

// Get user by phone number (flexible matching - handles various formats)
async function getUserByPhone(phone) {
  if (!phone) return null;
  
  try {
    // Normalize the input phone number
    const normalizedInput = normalizeZambianPhone(phone);
    if (!normalizedInput) {
      console.log(`getUserByPhone: Invalid phone number format: "${phone}"`);
      return null;
    }
    
    // Get all users with phone numbers and compare normalized versions
    const allUsers = await dbQuery('SELECT * FROM users WHERE phone IS NOT NULL AND phone != ""', []);
    
    for (const u of allUsers) {
      if (u.phone) {
        const dbPhoneNormalized = normalizeZambianPhone(u.phone);
        
        if (dbPhoneNormalized === normalizedInput) {
          console.log(`getUserByPhone: ✅ Match found! Input="${phone}" (normalized: ${normalizedInput}) = DB phone="${u.phone}" (normalized: ${dbPhoneNormalized}) -> User ID: ${u.id}`);
          return u;
        }
      }
    }
    
    console.log(`getUserByPhone: ❌ No match found. Input="${phone}" (normalized: ${normalizedInput})`);
    return null;
  } catch (error) {
    console.error('getUserByPhone error:', error);
    console.error('getUserByPhone error stack:', error.stack);
    throw error; // Re-throw to be caught by the login route
  }
}

// Get user by ID
async function getUserById(id) {
  return await dbGet('SELECT id, email, phone, created_at, is_admin FROM users WHERE id = ?', [id]);
}

function isConfiguredAdminUser(user) {
  if (!user) return false;

  if (process.env.ADMIN_PHONE) {
    const adminNorm = normalizeZambianPhone(process.env.ADMIN_PHONE);
    const userNorm = normalizeZambianPhone(user.phone);
    if (adminNorm && userNorm && adminNorm === userNorm) return true;
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const userEmail = user.email ? String(user.email).trim().toLowerCase() : '';
  if (adminEmail && userEmail && userEmail === adminEmail) return true;

  return false;
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  requireAdmin,
  getUserByEmail,
  getUserByPhone,
  getUserById,
  normalizeZambianPhone,
  isConfiguredAdminUser,
  JWT_SECRET
};

