require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const cron = require('node-cron');
const { initDB, dbQuery, dbRun, dbGet, dbTransaction } = require('./utils/db');
const { authenticateToken, requireAdmin, getUserByEmail, getUserByPhone, getUserById, hashPassword, comparePassword, generateToken, normalizeZambianPhone } = require('./utils/auth');
const { initializePayment, verifyPayment, generateReference } = require('./utils/payments');
const nodemailer = require('nodemailer');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'public', 'uploads', 'profiles');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create certificates directory
const certificatesDir = path.join(__dirname, 'public', 'uploads', 'certificates');
if (!fs.existsSync(certificatesDir)) {
  fs.mkdirSync(certificatesDir, { recursive: true });
}

// Create announcements directory
const announcementsDir = path.join(__dirname, 'public', 'uploads', 'announcements');
if (!fs.existsSync(announcementsDir)) {
  fs.mkdirSync(announcementsDir, { recursive: true });
}

// Configure multer for profile picture uploads
const profileStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: userId-timestamp.extension
    const userId = req.user?.userId || 'unknown';
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `profile-${userId}-${timestamp}${ext}`);
  }
});

// Configure multer for certificate uploads
const certificateStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, certificatesDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: certificate-timestamp.extension
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `certificate-${timestamp}-${sanitizedName}`);
  }
});

const upload = multer({
  storage: profileStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      // Store error in request for later handling
      req.fileValidationError = `File type not allowed. Only image files (JPG, PNG, GIF, WEBP) are allowed. Got: ${file.mimetype}`;
      cb(new Error(req.fileValidationError));
    }
  }
});

const uploadCertificate = multer({
  storage: certificateStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit for certificates
  },
  fileFilter: function (req, file, cb) {
    // Accept image and PDF files
    const allowedTypes = /jpeg|jpg|png|gif|webp|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype === 'application/pdf';
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      // Store error in request for later handling
      req.fileValidationError = `File type not allowed. Only image files (JPG, PNG, GIF, WEBP) and PDF files are allowed. Got: ${file.mimetype}`;
      cb(new Error(req.fileValidationError));
    }
  }
});

// Configure multer for announcement images
const announcementStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, announcementsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename: announcement-timestamp.extension
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    cb(null, `announcement-${timestamp}${ext}`);
  }
});

const uploadAnnouncement = multer({
  storage: announcementStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept only image files
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      // Store error in request for later handling
      req.fileValidationError = `File type not allowed. Only image files (JPG, PNG, GIF, WEBP) are allowed. Got: ${file.mimetype}`;
      cb(new Error(req.fileValidationError));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Email transporter (using Gmail SMTP)
// Only create transporter if credentials are provided
let emailTransporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  emailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
} else {
  console.warn('Email credentials not configured. Email notifications will be disabled.');
}

// Send email helper
async function sendEmail(to, subject, text, html) {
  if (!emailTransporter) {
    console.log(`[Email disabled] Would send to ${to}: ${subject}`);
    return;
  }
  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to,
      subject,
      text,
      html
    });
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error('Email error:', error);
  }
}

// Health check - verify DB is reachable (for debugging login/500 issues)
app.get('/api/health', async (req, res) => {
  try {
    await dbGet('SELECT 1 as ok');
    res.json({ ok: true, db: 'ok' });
  } catch (e) {
    console.error('Health check failed:', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ==================== AUTH ROUTES ====================

// Register
app.post('/api/register', [
  body('phone').trim().notEmpty().withMessage('Phone number is required').matches(/^[0-9]{9,10}$/).withMessage('Phone number must be 9-10 digits'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('full_name').optional().trim(),
  body('email').optional(),
  body('referral_code').optional().trim()
], async (req, res) => {
  try {
    console.log('Registration attempt:', { phone: req.body.phone, hasEmail: !!req.body.email, hasFullName: !!req.body.full_name });
    
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('Validation errors:', errors.array());
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { phone, password, full_name, email, referral_code } = req.body;
    
    // Email is completely optional - only process if actually provided and not empty
    let normalizedEmail = null;
    if (email && typeof email === 'string' && email.trim().length > 0) {
      const emailTrimmed = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailTrimmed)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }
      normalizedEmail = emailTrimmed;
    }

    // Normalize phone number (use Zambian phone normalization)
    // This handles +260, 0, and direct 9-digit formats
    console.log('Step 1: Normalizing phone number:', phone);
    let normalizedPhone;
    try {
      normalizedPhone = normalizeZambianPhone(phone);
      console.log('Step 1a: Normalized phone (raw):', normalizedPhone);
      
      // If normalization returns the last 9 digits, store in format: 0 + 9 digits (e.g., 0978891454)
      // This is the standard local format for Zambian numbers
      if (normalizedPhone && normalizedPhone.length === 9) {
        normalizedPhone = '0' + normalizedPhone; // Store as 0978891454 format
      } else if (normalizedPhone) {
        normalizedPhone = normalizedPhone; // Use as-is if not 9 digits
      } else {
        normalizedPhone = phone.trim().replace(/\s+/g, ''); // Fallback to basic normalization
      }
      console.log('Step 1b: Normalized phone (final):', normalizedPhone);
    } catch (normalizeError) {
      console.error('Phone normalization error:', normalizeError);
      normalizedPhone = phone.trim().replace(/\s+/g, ''); // Fallback to basic normalization
    }
    
    if (!normalizedPhone || normalizedPhone.length < 9) {
      console.log('Step 1c: Invalid phone format:', normalizedPhone);
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Check if user exists by phone number (using normalized comparison)
    // This prevents duplicate accounts with the same phone number in different formats
    console.log('Step 2: Checking if user exists:', normalizedPhone);
    const existingUser = await getUserByPhone(normalizedPhone);
    if (existingUser) {
      console.log(`Registration blocked: Phone "${phone}" (normalized: "${normalizedPhone}") already exists (User ID: ${existingUser.id})`);
      return res.status(400).json({ 
        error: 'Phone number already registered',
        message: 'This phone number is already registered. Please use a different phone number or login with your existing account.'
      });
    }
    
    // Double-check with direct database query to ensure uniqueness
    // Also check all possible phone formats to prevent duplicates
    const directCheck = await dbGet('SELECT id, phone FROM users WHERE phone = ?', [normalizedPhone]);
    if (directCheck) {
      console.log(`Registration blocked: Direct database check found duplicate phone "${normalizedPhone}" (User ID: ${directCheck.id})`);
      return res.status(400).json({ 
        error: 'Phone number already registered',
        message: 'This phone number is already registered. Please use a different phone number or login with your existing account.'
      });
    }
    
    // Note: getUserByPhone() already does comprehensive normalization checking
    // The direct database check above provides an additional safety layer
    // Both checks ensure no duplicate phone numbers can be registered

    // Look up inviter by referral code (phone number)
    let invitedByUserId = null;
    if (referral_code && referral_code.trim()) {
      const referralPhone = referral_code.trim().replace(/\s+/g, '');
      // Try to find user by phone number
      const inviter = await dbGet('SELECT id FROM users WHERE phone = ?', [referralPhone]);
      if (inviter) {
        invitedByUserId = inviter.id;
        console.log(`Referral code matched phone number: ${referralPhone}`);
      }
      // If referral code doesn't match any user, we still proceed with registration
      // (referral code is optional and doesn't block registration)
    }

    // Hash password
    console.log('Step 3: Hashing password');
    const passwordHash = await hashPassword(password);
    console.log('Step 3a: Password hashed successfully');

    // Check if admin phone (optional - can set ADMIN_PHONE in .env)
    // Normalize ADMIN_PHONE to ensure it matches regardless of format
    let adminPhoneNormalized = null;
    if (process.env.ADMIN_PHONE) {
      try {
        adminPhoneNormalized = normalizeZambianPhone(process.env.ADMIN_PHONE);
        if (adminPhoneNormalized && adminPhoneNormalized.length === 9) {
          adminPhoneNormalized = '0' + adminPhoneNormalized;
        }
      } catch (e) {
        adminPhoneNormalized = process.env.ADMIN_PHONE.trim().replace(/\s+/g, '');
      }
    }
    const isAdmin = (adminPhoneNormalized && normalizedPhone === adminPhoneNormalized) || 
                    (normalizedEmail && normalizedEmail === process.env.ADMIN_EMAIL);
    console.log('Step 4: Admin check:', {
      isAdmin,
      normalizedPhone,
      adminPhoneNormalized,
      adminPhoneEnv: process.env.ADMIN_PHONE,
      match: normalizedPhone === adminPhoneNormalized
    });

    // Because the existing database schema has email marked as NOT NULL,
    // we must always store SOME email value. For users who don't provide
    // an email (they log in with phone only), we generate a safe placeholder
    // email based on their phone number. This keeps the DB happy but we
    // never use this placeholder for login.
    const sanitizedPhoneForEmail = (normalizedPhone || '').replace(/[^0-9]/g, '') || 'user';
    const emailForInsert = normalizedEmail || `${sanitizedPhoneForEmail}@noemail.local`;

    // Create user (phone is required, email is effectively required by DB,
    // but may be a placeholder if the user didn't provide one).
    // New users start with L0 level until they invest.
    console.log('Step 5: Inserting user into database');
    console.log('Step 5a: Insert params:', {
      phone: normalizedPhone,
      hasPasswordHash: !!passwordHash,
      full_name: full_name || null,
      email: emailForInsert,
      isAdmin: isAdmin ? 1 : 0,
      invitedByUserId,
      level: 'L0'
    });
    
    let result;
    try {
      // Ensure invitedByUserId is null if not set (to avoid foreign key issues)
      const finalInvitedByUserId = invitedByUserId || null;
      
      console.log('Step 5c: Final insert values:', {
        phone: normalizedPhone,
        hasPasswordHash: !!passwordHash,
        full_name: full_name || null,
        email: emailForInsert,
        isAdmin: isAdmin ? 1 : 0,
        invitedByUserId: finalInvitedByUserId,
        level: 'L0'
      });
      
      result = await dbRun(
        'INSERT INTO users (phone, password_hash, full_name, email, is_admin, invited_by_user_id, level) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [normalizedPhone, passwordHash, full_name || null, emailForInsert, isAdmin ? 1 : 0, finalInvitedByUserId, 'L0']
      );
      console.log('Step 5b: User inserted successfully, ID:', result.lastID);
    } catch (dbError) {
      console.error('Step 5 ERROR: Database insert failed:', dbError);
      console.error('Step 5 ERROR details:', {
        message: dbError.message,
        code: dbError.code,
        errno: dbError.errno,
        stack: dbError.stack
      });
      throw dbError; // Re-throw to be caught by outer catch
    }

    // No email sent - user will login with phone number

    res.json({ message: 'Registration successful', userId: result.lastID });
  } catch (error) {
    console.error('Registration error:', error);
    console.error('Registration error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      stack: error.stack
    });
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Phone number already registered' });
    }
    // Always include the error message in development, and a generic message in production
    const errorMessage = process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during registration';
    res.status(500).json({ 
      error: errorMessage,
      message: errorMessage
    });
  }
});

// Login
app.post('/api/login', [
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { phone, password } = req.body;

    console.log(`Login attempt: Phone input="${phone}", Password length=${password.length}`);

    // Get user by phone number (getUserByPhone handles Zambian phone normalization internally)
    // It will handle: +260978891454, 0978891454, 978891454, 260978891454
    let user;
    try {
      user = await getUserByPhone(phone);
    } catch (getUserError) {
      console.error('Error in getUserByPhone:', getUserError);
      console.error('getUserByPhone error stack:', getUserError.stack);
      return res.status(500).json({ 
        error: getUserError.message || 'Database error. Please try again later.'
      });
    }
    if (!user) {
      try {
        const normalizedPhone = normalizeZambianPhone(phone);
        console.log(`❌ Login failed: Phone "${phone}" (normalized: "${normalizedPhone}") not found in database`);
        const allUsersWithPhone = await dbQuery(
          'SELECT id, phone, email FROM users WHERE phone IS NOT NULL AND phone != "" LIMIT 10',
          []
        );
        console.log('📱 Users with phone numbers in database:');
        allUsersWithPhone.forEach(u => {
          console.log(`  - User ID ${u.id}: Phone="${u.phone}", Email="${u.email || 'N/A'}"`);
        });
        return res.status(401).json({ 
          error: 'Invalid phone number or password',
          hint: `Phone number "${normalizedPhone}" not found. Please check the phone number and try again.`
        });
      } catch (e) {
        console.error('Error in !user block (normalize or dbQuery):', e);
        return res.status(500).json({ error: e.message || 'Database error' });
      }
    }

    console.log(`✓ User found: ID=${user.id}, Phone="${user.phone}", Email="${user.email || 'N/A'}"`);

    // Check if user has a password hash
    if (!user.password_hash || typeof user.password_hash !== 'string') {
      console.error(`❌ Login failed: User ID ${user.id} has no password hash`);
      return res.status(500).json({ error: 'User account error. Please contact support.' });
    }
    // bcrypt hashes start with $2a$, $2b$, or $2y$; if not, comparePassword can throw
    if (!/^\$2[aby]\$/.test(user.password_hash)) {
      console.error(`❌ Login failed: User ID ${user.id} has invalid password hash format`);
      return res.status(500).json({ error: 'User account error. Please contact support or reset password.' });
    }

    // Verify password
    let isValid = false;
    try {
      isValid = await comparePassword(password, user.password_hash);
    } catch (compareError) {
      console.error('Password comparison error:', compareError);
      console.error('Password comparison error stack:', compareError.stack);
      return res.status(500).json({ 
        error: compareError.message || 'Login failed. Please try again.' 
      });
    }
    
    if (!isValid) {
      console.log(`❌ Login failed: Invalid password for user ID ${user.id} (Phone: "${user.phone}")`);
      return res.status(401).json({ error: 'Invalid phone number or password' });
    }
    
    console.log(`✅ Login successful: User ID ${user.id}, Phone: ${user.phone}`);

    // Generate token
    let token;
    try {
      token = generateToken(user);
    } catch (tokenError) {
      console.error('generateToken error:', tokenError);
      return res.status(500).json({ 
        error: tokenError.message || 'Failed to create session.' 
      });
    }

    // Don't return admin email for non-admin users
    // If user is not admin and email is admin email, return null instead
    let userEmail = user.email || null;
    if (user.is_admin !== 1 && userEmail === process.env.ADMIN_EMAIL) {
      userEmail = null; // Don't expose admin email to normal users
    }
    
    res.json({
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: userEmail,
        isAdmin: user.is_admin === 1
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    console.error('Login error stack:', error.stack);
    var errMsg = (error && (error.message || String(error))) || 'Login failed';
    res.status(500).json({ error: errMsg });
  }
});

// ==================== PACKAGE ROUTES ====================

// Get all packages
app.get('/api/packages', async (req, res) => {
  try {
    const packages = await dbQuery('SELECT * FROM packages ORDER BY amount ASC');
    res.json(packages);
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ error: 'Failed to fetch packages' });
  }
});

// Get payment wallet numbers
app.get('/api/wallets', async (req, res) => {
  try {
    res.json({
      airtel: {
        name: 'AIRTEL MONEY',
        number: process.env.AIRTEL_MONEY_NUMBER || '0977123456'
      },
      mtn: {
        name: 'MTN MOBILE MONEY',
        number: process.env.MTN_MONEY_NUMBER || '0966123456'
      }
    });
  } catch (error) {
    console.error('Get wallets error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet numbers' });
  }
});

// ==================== INVESTMENT ROUTES ====================

// Create investment (after payment)
app.post('/api/invest', authenticateToken, [
  body('packageId').isInt(),
  body('amount').isFloat({ min: 1 }),
  body('paymentReference').notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { packageId, amount, paymentReference } = req.body;
    const userId = req.user.userId;

    // Allow mock payments for development (payment reference starts with "MOCK_")
    const isMockPayment = paymentReference.startsWith('MOCK_');
    
    if (!isMockPayment) {
      // Verify payment for real payments
      const payment = await verifyPayment(paymentReference);
      if (!payment.success) {
        return res.status(400).json({ error: 'Payment verification failed' });
      }
    }

    // Get package
    const packageData = await dbGet('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!packageData) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Validate amount matches package
    if (Math.abs(amount - packageData.amount) > 0.01) {
      return res.status(400).json({ error: 'Amount does not match package' });
    }

    // Calculate dates
    const startDate = new Date().toISOString().split('T')[0];
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + 26);
    const maturityDateStr = maturityDate.toISOString().split('T')[0];

    // Create investment (for mock payments, wallet and transaction_txt can be null)
    const wallet = paymentReference.startsWith('MOCK_') ? 'mock' : null;
    const transactionTxt = paymentReference.startsWith('MOCK_') ? paymentReference : null;
    
    const investResult = await dbRun(
      `INSERT INTO investments (user_id, package_id, deposit_amount, start_date, maturity_date, status, wallet, transaction_txt)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [userId, packageId, amount, startDate, maturityDateStr, wallet, transactionTxt]
    );

    // Create deposit transaction
    await dbRun(
      'INSERT INTO transactions (user_id, type, amount, investment_id) VALUES (?, ?, ?, ?)',
      [userId, 'deposit', amount, investResult.lastID]
    );

    // Get user email
    const user = await getUserById(userId);

    // Send confirmation email
    await sendEmail(
      user.email,
      'Investment Confirmed',
      `Your investment of K${amount} has been confirmed. Maturity date: ${maturityDateStr}`,
      `<h1>Investment Confirmed</h1><p>Your investment of K${amount} has been confirmed.</p><p>Maturity date: ${maturityDateStr}</p>`
    );

    res.json({
      message: 'Investment created successfully',
      investmentId: investResult.lastID
    });
  } catch (error) {
    console.error('Investment creation error:', error);
    res.status(500).json({ error: 'Investment creation failed' });
  }
});

// Invest directly from balance (deduct from account and assign level)
app.post('/api/invest-from-balance', authenticateToken, [
  body('packageId').isInt().withMessage('Package ID must be an integer'),
  body('amount').isFloat({ min: 1 }).withMessage('Amount must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { packageId, amount } = req.body;
    const userId = req.user.userId;

    // Get package
    const packageData = await dbGet('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!packageData) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Validate amount matches package
    if (Math.abs(amount - packageData.amount) > 0.01) {
      return res.status(400).json({ error: 'Amount does not match package amount' });
    }

    // Get user's current level
    const userData = await getUserById(userId);
    const userCurrentLevel = userData.level || 'L0';
    const userLevelNumber = parseInt(userCurrentLevel.replace('L', '') || '0');
    const targetLevelNumber = parseInt(packageData.level.replace('L', '') || '0');

    // Check if user already has an active investment in ANY level
    // User can only be on ONE level at a time - switching levels terminates the old investment
    const existingActiveInvestment = await dbGet(
      `SELECT i.id, i.package_id, p.level, i.deposit_amount
       FROM investments i 
       JOIN packages p ON i.package_id = p.id 
       WHERE i.user_id = ? AND i.status = 'active'`,
      [userId]
    );

    // If user is trying to invest in the SAME level they're already on, reject it
    if (existingActiveInvestment && existingActiveInvestment.level === packageData.level) {
      return res.status(400).json({ 
        error: 'Invalid investment',
        message: `You are already invested in ${packageData.level}. Choose a different level to switch.`
      });
    }

    // Note: User can invest in ANY level (no sequential restriction)
    // If they have an existing investment, it will be terminated when they switch

    // Get user current balance - include ALL transactions (including deleted ones for balance calculation)
    const transactions = await dbQuery(
      `SELECT type, amount, investment_id, deleted FROM transactions WHERE user_id = ?`,
      [userId]
    );
    const investments = await dbQuery(
      `SELECT id, deposit_amount, total_accruals FROM investments WHERE user_id = ? AND status = 'active'`,
      [userId]
    );
    
    // Calculate balance: deposits + accruals + bonuses - withdrawals - investments from balance
    // IMPORTANT: Include ALL transactions (including deleted ones) for accurate balance calculation
    // Deleted transactions are marked as deleted=1 but still count toward balance
    const totalDeposits = transactions
      .filter(t => t && t.type === 'deposit' && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    const totalWithdrawn = transactions
      .filter(t => t && t.type === 'withdrawal')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Include ALL accrual and bonus transactions (regardless of investment_id or deleted status)
    // This ensures all daily income, bonuses, and any other income is included in balance
    const allAccrualsAndBonuses = transactions
      .filter(t => t && (t.type === 'accrual' || t.type === 'bonus'))
      .reduce((sum, t) => sum + t.amount, 0);
    
    const investmentsFromBalance = transactions
      .filter(t => t && t.type === 'investment')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0); // Sum absolute values since they're negative
    
    const availableBalance = totalDeposits + allAccrualsAndBonuses - totalWithdrawn - investmentsFromBalance;

    // Check if user has sufficient balance
    if (availableBalance < amount) {
      return res.status(400).json({ 
        error: 'Insufficient balance',
        message: `Insufficient balance. Your current balance is K${availableBalance.toFixed(2)}. Please deposit to get this level.`,
        currentBalance: availableBalance,
        requiredAmount: amount
      });
    }

    // If user has an existing active investment, terminate it before creating the new one
    // This ensures user can only be on ONE level at a time
    let previousLevel = null;
    if (existingActiveInvestment) {
      previousLevel = existingActiveInvestment.level;
      
      // Terminate the existing investment
      await dbRun(
        `UPDATE investments SET status = 'terminated', maturity_date = date('now') WHERE id = ?`,
        [existingActiveInvestment.id]
      );
      
      console.log(`Terminated previous investment: User ${userId}, Previous Level ${previousLevel}, New Level ${packageData.level}`);
    }

    // Start transaction - deduct amount and create investment
    const startDate = new Date().toISOString().split('T')[0];

    // Create investment (maturity date set to far future since schema requires NOT NULL)
    // In production, you may want to alter the schema to allow NULL
    const investResult = await dbRun(
      `INSERT INTO investments (user_id, package_id, deposit_amount, start_date, maturity_date, status, wallet, transaction_txt)
       VALUES (?, ?, ?, ?, '9999-12-31', 'active', 'balance', 'BALANCE_INVESTMENT')`,
      [userId, packageId, amount, startDate]
    );

    // Create investment transaction to deduct from balance
    // This transaction type will be excluded from balance calculation
    await dbRun(
      'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
      [userId, 'investment', -amount, investResult.lastID] // Negative amount to deduct from balance
    );

    // Update user level to the package level
    await dbRun(
      'UPDATE users SET level = ? WHERE id = ?',
      [packageData.level, userId]
    );

    // Get user for email
    const user = await getUserById(userId);

    // Send confirmation email (non-blocking)
    const switchMessage = previousLevel 
      ? `You have switched from ${previousLevel} to ${packageData.level}.` 
      : '';
    
    if (user && user.email) {
      sendEmail(
        user.email,
        'Investment Confirmed',
        `Your investment of K${amount} in ${packageData.level} has been confirmed. ${switchMessage} The amount has been deducted from your account balance.`,
        `<h1>Investment Confirmed</h1>
         <p>Your investment of K${amount} in ${packageData.level} has been confirmed.</p>
         ${previousLevel ? `<p><strong>Note:</strong> Your previous investment in ${previousLevel} has been terminated.</p>` : ''}
         <p>The amount has been deducted from your account balance.</p>
         <p>Your new level: ${packageData.level}</p>`
      ).catch(emailError => {
        console.error('Failed to send investment confirmation email (non-critical):', emailError);
      });
    }

    console.log(`Investment created from balance: User ${userId}, Package ${packageId}, Amount K${amount}, Level ${packageData.level}${previousLevel ? `, Previous Level ${previousLevel} terminated` : ''}`);

    res.json({
      message: previousLevel 
        ? `Level switched successfully! Your ${previousLevel} investment has been terminated and you are now on ${packageData.level}.`
        : 'Investment created successfully. Amount deducted from your balance.',
      investmentId: investResult.lastID,
      level: packageData.level,
      previousLevel: previousLevel,
      amount: amount,
      newBalance: availableBalance - amount
    });
  } catch (error) {
    console.error('Investment from balance error:', error);
    res.status(500).json({ error: 'Failed to create investment', details: error.message });
  }
});

// Verify transaction TXT and create investment
app.post('/api/verify-transaction', authenticateToken, [
  body('packageId').isInt(),
  body('amount').isFloat({ min: 1 }),
  body('wallet').isIn(['airtel', 'mtn']),
  body('transactionTxt').notEmpty().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { packageId, amount, wallet, transactionTxt } = req.body;
    const userId = req.user.userId;

    // Get package
    const packageData = await dbGet('SELECT * FROM packages WHERE id = ?', [packageId]);
    if (!packageData) {
      return res.status(404).json({ error: 'Package not found' });
    }

    // Validate amount matches package
    if (Math.abs(amount - packageData.amount) > 0.01) {
      return res.status(400).json({ error: 'Amount does not match package' });
    }

    // Check if transaction TXT already exists (prevent duplicates)
    const existingTransaction = await dbGet(
      'SELECT id FROM investments WHERE transaction_txt = ? AND user_id = ?',
      [transactionTxt, userId]
    );

    if (existingTransaction) {
      return res.status(400).json({ error: 'This transaction has already been used' });
    }

    // Verify transaction TXT (in production, integrate with mobile money API)
    // For now, we'll do basic validation and accept valid format
    const isValidTransaction = await verifyTransactionTxt(transactionTxt, wallet, amount);
    
    if (!isValidTransaction) {
      return res.status(400).json({ error: 'Invalid transaction. Please check your transaction TXT number and try again.' });
    }

    // Calculate dates
    const startDate = new Date().toISOString().split('T')[0];
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + 26);
    const maturityDateStr = maturityDate.toISOString().split('T')[0];

    // Create investment
    const investResult = await dbRun(
      `INSERT INTO investments (user_id, package_id, deposit_amount, start_date, maturity_date, status, wallet, transaction_txt)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      [userId, packageId, amount, startDate, maturityDateStr, wallet, transactionTxt]
    );

    // Create deposit transaction
    await dbRun(
      'INSERT INTO transactions (user_id, type, amount, investment_id) VALUES (?, ?, ?, ?)',
      [userId, 'deposit', amount, investResult.lastID]
    );

    // Get user email
    const user = await getUserById(userId);

    // Send confirmation email
    await sendEmail(
      user.email,
      'Investment Confirmed',
      `Your investment of K${amount} has been confirmed. Maturity date: ${maturityDateStr}. Transaction: ${transactionTxt}`,
      `<h1>Investment Confirmed</h1><p>Your investment of K${amount} has been confirmed.</p><p>Maturity date: ${maturityDateStr}</p><p>Transaction: ${transactionTxt}</p>`
    );

    res.json({
      message: 'Transaction verified successfully. Investment created.',
      investmentId: investResult.lastID
    });
  } catch (error) {
    console.error('Transaction verification error:', error);
    res.status(500).json({ error: 'Transaction verification failed' });
  }
});

// Recharge/Deposit endpoint (simplified version for direct deposits)
// IMPORTANT: This endpoint does NOT require packageId - deposits are not tied to levels
app.post('/api/recharge', authenticateToken, async (req, res) => {
  try {
    // Skip express-validator - we do manual validation to allow any transaction format
    console.log('✅ Deposit request received at /api/recharge endpoint');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Double-check we're not accidentally hitting this from wrong route
    if (req.path !== '/api/recharge') {
      console.error('⚠️ WARNING: Request path mismatch! Expected /api/recharge, got:', req.path);
    }
    
    // Manual validation with better error messages
    // Note: packageId is NOT required for deposits - deposits are not tied to levels
    // We explicitly ignore packageId if sent (for backward compatibility)
    let { amount, transactionTxt, wallet = 'airtel' } = req.body;
    
    // Explicitly remove packageId if present (shouldn't be needed, but just in case)
    if (req.body.packageId !== undefined) {
      console.log('⚠️ Warning: packageId was sent but will be ignored for deposits');
      delete req.body.packageId;
    }
    
    // Validate amount
    if (amount === undefined || amount === null || amount === '') {
      return res.status(400).json({ error: 'Amount is required' });
    }
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }
    
    // Validate transactionTxt
    if (!transactionTxt || typeof transactionTxt !== 'string') {
      return res.status(400).json({ error: 'Transaction number is required' });
    }
    transactionTxt = transactionTxt.trim();
    if (transactionTxt.length === 0) {
      return res.status(400).json({ error: 'Transaction number cannot be empty' });
    }
    if (transactionTxt.length < 5) {
      return res.status(400).json({ error: 'Transaction number must be at least 5 characters' });
    }
    if (transactionTxt.length > 50) {
      return res.status(400).json({ error: 'Transaction number must be 50 characters or less' });
    }
    
    // Validate wallet
    if (wallet && typeof wallet === 'string') {
      wallet = wallet.trim().toLowerCase();
      if (!['airtel', 'mtn'].includes(wallet)) {
        wallet = 'airtel'; // Default to airtel if invalid
      }
    } else {
      wallet = 'airtel';
    }
    const userId = req.user.userId;

    // Check if transaction TXT already exists (prevent duplicates)
    const existingTransaction = await dbGet(
      'SELECT id FROM investments WHERE transaction_txt = ? AND user_id = ?',
      [transactionTxt, userId]
    );

    if (existingTransaction) {
      return res.status(400).json({ error: 'This transaction has already been used' });
    }

    // Basic transaction validation (in production, integrate with mobile money API)
    // In development mode, only check length - format validation will be done by mobile money API in production
    // Length validation is already done above (lines 896-900), so we skip format validation here
    // NO FORMAT VALIDATION - ACCEPT ANY TRANSACTION NUMBER FORMAT
    console.log('✅ Transaction number validation passed - NO FORMAT CHECK:', transactionTxt);
    console.log('✅ Transaction number length:', transactionTxt.length);
    console.log('✅ Transaction number type:', typeof transactionTxt);

    // Get or create a dummy "deposit" package (package_id = 0 or first package as placeholder)
    // Since schema requires package_id, we'll use the first package as a placeholder
    // The deposit is NOT tied to a level - it just adds to balance
    const firstPackage = await dbGet('SELECT id FROM packages ORDER BY id LIMIT 1');
    if (!firstPackage) {
      return res.status(500).json({ error: 'No packages available. Please contact admin.' });
    }
    const placeholderPackageId = firstPackage.id;

    // Calculate dates (not used for deposits, but required by schema)
    const startDate = new Date().toISOString().split('T')[0];
    const maturityDateStr = '9999-12-31'; // Far future date for deposits

    // Create investment with 'pending' status - this is just a deposit, not a level purchase
    // When approved, it will only add to balance, not assign a level
    const investResult = await dbRun(
      `INSERT INTO investments (user_id, package_id, deposit_amount, start_date, maturity_date, status, wallet, transaction_txt)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [userId, placeholderPackageId, amount, startDate, maturityDateStr, wallet, transactionTxt]
    );

    // Don't create transaction yet - only after admin approval
    // Transaction will be created when admin approves the deposit

    console.log(`Deposit request submitted: User ${userId}, Amount K${amount}, Transaction ${transactionTxt} - Pending approval (NOT a level purchase)`);

    res.json({
      message: 'Deposit request submitted successfully. Your deposit is pending admin approval. Once approved, the money will be added to your balance.',
      investmentId: investResult.lastID,
      amount: amount,
      transactionTxt: transactionTxt,
      status: 'pending'
    });
  } catch (error) {
    console.error('Recharge/Deposit error:', error);
    res.status(500).json({ error: 'Failed to process deposit. Please try again.' });
  }
});

// Verify transaction TXT (basic validation - replace with actual mobile money API in production)
async function verifyTransactionTxt(transactionTxt, wallet, amount) {
  // Basic validation: transaction TXT should be alphanumeric and reasonable length
  // In production, integrate with Airtel Money or MTN Mobile Money API to verify
  if (!transactionTxt || transactionTxt.length < 6 || transactionTxt.length > 50) {
    return false;
  }

  // In development mode, skip format validation - only check length
  // Format validation will be done by mobile money API in production

  // TODO: In production, call mobile money API to verify:
  // - Airtel Money API: Verify transaction exists and amount matches
  // - MTN Mobile Money API: Verify transaction exists and amount matches
  // For now, we accept any valid format (development mode)
  
  console.log(`[Development Mode] Transaction verification: ${transactionTxt} for ${wallet}, amount: K${amount}`);
  
  // In production, replace this with actual API call:
  // const apiResponse = await callMobileMoneyAPI(wallet, transactionTxt, amount);
  // return apiResponse.success && apiResponse.amount === amount;
  
  return true; // Accept for development
}

// Paystack webhook
app.post('/api/paystack/webhook', async (req, res) => {
  try {
    const { event, data } = req.body;

    if (event === 'charge.success') {
      const reference = data.reference;
      
      // Verify payment
      const payment = await verifyPayment(reference);
      if (payment.success && payment.metadata) {
        const { userId, packageId, amount } = payment.metadata;

        // Check if investment already exists
        const existingInvestment = await dbGet(
          'SELECT id FROM investments WHERE user_id = ? AND package_id = ? AND deposit_amount = ? ORDER BY created_at DESC LIMIT 1',
          [userId, packageId, amount]
        );

        if (!existingInvestment) {
          // Calculate dates
          const startDate = new Date().toISOString().split('T')[0];
          const maturityDate = new Date();
          maturityDate.setDate(maturityDate.getDate() + 26);
          const maturityDateStr = maturityDate.toISOString().split('T')[0];

          // Create investment
          const investResult = await dbRun(
            `INSERT INTO investments (user_id, package_id, deposit_amount, start_date, maturity_date, status)
             VALUES (?, ?, ?, ?, ?, 'active')`,
            [userId, packageId, amount, startDate, maturityDateStr]
          );

          // Create deposit transaction
          await dbRun(
            'INSERT INTO transactions (user_id, type, amount, investment_id) VALUES (?, ?, ?, ?)',
            [userId, 'deposit', amount, investResult.lastID]
          );

          // Get user email
          const user = await getUserById(userId);
          if (user) {
            await sendEmail(
              user.email,
              'Investment Confirmed',
              `Your investment of K${amount} has been confirmed. Maturity date: ${maturityDateStr}`,
              `<h1>Investment Confirmed</h1><p>Your investment of K${amount} has been confirmed.</p><p>Maturity date: ${maturityDateStr}</p>`
            );
          }
        }
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get user profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await dbGet(
      'SELECT id, email, full_name, phone, level, withdrawal_wallet, withdrawal_phone, profile_picture, created_at, is_admin FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if withdrawal password is set (without exposing it)
    const userWithPassword = await dbGet(
      'SELECT withdrawal_password FROM users WHERE id = ?',
      [userId]
    );

    // Don't return admin email for non-admin users in profile
    let userEmail = user.email || null;
    if (user.is_admin !== 1 && userEmail === process.env.ADMIN_EMAIL) {
      userEmail = null; // Don't expose admin email to normal users
    }
    
    // Clean full_name if it contains admin email or looks like an email
    let fullName = user.full_name || '';
    if (fullName && (fullName.includes('@') || fullName === 'admin@zambia-youth.com')) {
      // If full_name is an email address (especially admin email), clear it
      if (user.is_admin !== 1) {
        fullName = ''; // Clear email-like full_name for non-admin users
      }
    }
    
    res.json({
      id: user.id, // Include user ID for referral links
      full_name: fullName,
      phone: user.phone || '',
      level: user.level || 'L1',
      email: userEmail,
      withdrawal_wallet: user.withdrawal_wallet || '',
      withdrawal_phone: user.withdrawal_phone || '',
      profile_picture: user.profile_picture || '',
      has_withdrawal_password: !!userWithPassword?.withdrawal_password
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update user profile
// NOTE: Phone number cannot be changed - it's the primary identifier for login
app.put('/api/profile', authenticateToken, [
  body('full_name').optional().trim(),
  body('level').optional().isIn(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const userId = req.user.userId;
    const { full_name, level } = req.body;

    // Phone number cannot be changed - reject if provided
    if (req.body.phone !== undefined) {
      return res.status(400).json({ 
        error: 'Phone number cannot be changed', 
        message: 'Phone number is your account identifier and cannot be modified. Please contact support if you need to change it.' 
      });
    }

    const updates = [];
    const values = [];

    if (full_name !== undefined) {
      // Don't allow email-like values in full_name
      if (full_name && (full_name.includes('@') || full_name === 'admin@zambia-youth.com')) {
        return res.status(400).json({ error: 'Invalid full name. Cannot use email addresses as name.' });
      }
      updates.push('full_name = ?');
      values.push(full_name);
    }
    if (level !== undefined) {
      updates.push('level = ?');
      values.push(level);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    await dbRun(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    console.log(`Profile updated for user ID ${userId}: ${updates.join(', ')}`);

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Change password
app.post('/api/profile/change-password', authenticateToken, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const userId = req.user.userId;
    const { currentPassword, newPassword } = req.body;

    // Get user's current password hash
    const user = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await comparePassword(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await hashPassword(newPassword);

    // Update password
    await dbRun(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [newPasswordHash, userId]
    );

    console.log(`Password changed successfully for user ID ${userId}`);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Upload profile picture
app.post('/api/profile/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
  try {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select an image file.' });
    }

    const userId = req.user.userId;
    const filePath = `/uploads/profiles/${req.file.filename}`;

    // Get old profile picture to delete it
    const user = await dbGet('SELECT profile_picture FROM users WHERE id = ?', [userId]);
    
    // Update database with new profile picture path
    await dbRun('UPDATE users SET profile_picture = ? WHERE id = ?', [filePath, userId]);

    // Delete old profile picture if it exists
    if (user && user.profile_picture) {
      const oldFilePath = path.join(__dirname, 'public', user.profile_picture);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }

    res.json({ 
      message: 'Profile picture uploaded successfully',
      profile_picture: filePath
    });
  } catch (error) {
    console.error('Profile picture upload error:', error);
    console.error('Error details:', error.stack);
    // Delete uploaded file if there was an error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to upload profile picture. Please check file type and size (max 5MB).' });
  }
});

// Get all certificates
app.get('/api/certificates', async (req, res) => {
  try {
    const certificates = await dbQuery(
      'SELECT id, title, file_path, description, uploaded_at FROM certificates ORDER BY uploaded_at DESC'
    );
    res.json(certificates || []);
  } catch (error) {
    console.error('Get certificates error:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
});

// Upload certificate (admin only)
app.post('/api/certificates', authenticateToken, requireAdmin, uploadCertificate.single('certificate'), async (req, res) => {
  try {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Please select a file.' });
    }

    const { title, description } = req.body;
    if (!title) {
      // Delete uploaded file if validation fails
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Certificate title is required' });
    }

    const userId = req.user.userId;
    const filePath = `/uploads/certificates/${req.file.filename}`;

    await dbRun(
      'INSERT INTO certificates (title, file_path, description, uploaded_by) VALUES (?, ?, ?, ?)',
      [title, filePath, description || '', userId]
    );

    res.json({ 
      message: 'Certificate uploaded successfully',
      certificate: {
        title,
        file_path: filePath,
        description: description || ''
      }
    });
  } catch (error) {
    console.error('Certificate upload error:', error);
    console.error('Error details:', error.stack);
    // Delete uploaded file if there was an error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    res.status(500).json({ error: error.message || 'Failed to upload certificate. Please check file type and size (max 10MB).' });
  }
});

// Delete certificate (admin only)
app.delete('/api/certificates/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const certificateId = req.params.id;
    
    // Get certificate info
    const certificate = await dbGet('SELECT file_path FROM certificates WHERE id = ?', [certificateId]);
    
    if (!certificate) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    // Delete file
    const filePath = path.join(__dirname, 'public', certificate.file_path);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Delete from database
    await dbRun('DELETE FROM certificates WHERE id = ?', [certificateId]);

    res.json({ message: 'Certificate deleted successfully' });
  } catch (error) {
    console.error('Delete certificate error:', error);
    res.status(500).json({ error: 'Failed to delete certificate' });
  }
});

// Make user admin (for setup - can be removed in production)
app.post('/api/admin/make-admin', authenticateToken, async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email matches ADMIN_EMAIL
    if (email !== process.env.ADMIN_EMAIL) {
      return res.status(403).json({ error: 'Only the admin email can be made admin' });
    }

    // Update user to admin
    await dbRun('UPDATE users SET is_admin = 1 WHERE email = ?', [email]);

    res.json({ message: 'User has been made admin. Please logout and login again.' });
  } catch (error) {
    console.error('Make admin error:', error);
    res.status(500).json({ error: 'Failed to make user admin' });
  }
});

// Update withdrawal settings (password, wallet, and phone)
app.put('/api/withdrawal-settings', authenticateToken, [
  body('withdrawal_password').optional().isLength({ min: 4 }).withMessage('Password must be at least 4 characters'),
  body('withdrawal_wallet').optional().isIn(['airtel', 'mtn']).withMessage('Wallet must be airtel or mtn'),
  body('withdrawal_phone').optional().trim().matches(/^\+260\d{9}$/).withMessage('Phone must be in format +260XXXXXXXXX (9 digits after +260)')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const userId = req.user.userId;
    const { withdrawal_password, withdrawal_wallet, withdrawal_phone } = req.body;

    const updates = [];
    const values = [];

    if (withdrawal_password !== undefined) {
      const hashedPassword = await hashPassword(withdrawal_password);
      updates.push('withdrawal_password = ?');
      values.push(hashedPassword);
    }
    if (withdrawal_wallet !== undefined) {
      updates.push('withdrawal_wallet = ?');
      values.push(withdrawal_wallet);
    }
    if (withdrawal_phone !== undefined) {
      // Ensure phone starts with +260
      const phone = withdrawal_phone.trim();
      const formattedPhone = phone.startsWith('+260') ? phone : `+260${phone.replace(/^\+260/, '')}`;
      updates.push('withdrawal_phone = ?');
      values.push(formattedPhone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    await dbRun(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    res.json({ message: 'Withdrawal settings updated successfully' });
  } catch (error) {
    console.error('Update withdrawal settings error:', error);
    res.status(500).json({ error: 'Failed to update withdrawal settings' });
  }
});

// Get user withdrawal requests
app.get('/api/withdrawal-requests', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    const requests = await dbQuery(
      `SELECT wr.*, 
              i.deposit_amount, 
              i.total_accruals
       FROM withdrawal_requests wr
       LEFT JOIN investments i ON wr.investment_id = i.id
       WHERE wr.user_id = ?
       ORDER BY wr.requested_at DESC`,
      [userId]
    );
    res.json(requests);
  } catch (error) {
    console.error('Get withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
});

// Get user dashboard data
app.get('/api/dashboard', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`Fetching dashboard data for user ${userId}`);

    // Run both queries in parallel for better performance
    const [investments, transactions] = await Promise.all([
      dbQuery(
        `SELECT i.*, p.amount as package_amount, p.daily_rate
         FROM investments i
         JOIN packages p ON i.package_id = p.id
         WHERE i.user_id = ?
         ORDER BY i.created_at DESC`,
        [userId]
      ).catch(err => {
        console.error('Error fetching investments:', err);
        return []; // Return empty array on error
      }),
      // Get ALL transactions including deleted ones for balance calculation
      // Deleted transactions (deleted=1) are included in balance but filtered out for display in frontend
      dbQuery(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY date DESC LIMIT 50',
        [userId]
      ).catch(err => {
        console.error('Error fetching transactions:', err);
        return []; // Return empty array on error
      })
    ]);

    console.log(`Dashboard data: ${investments.length} investments, ${transactions.length} transactions`);

    res.json({ 
      investments: investments || [], 
      transactions: transactions || [] 
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: error.message });
  }
});

// Request withdrawal (creates a request for admin approval)
app.post('/api/withdraw', authenticateToken, [
  body('investmentId').optional({ nullable: true, checkFalsy: true }).isInt().withMessage('Investment ID must be an integer'),
  body('withdrawal_password').notEmpty().withMessage('Withdrawal password is required'),
  body('amount').isFloat({ min: 50 }).withMessage('Minimum withdrawal is Zmw50')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('Withdrawal validation errors:', errors.array());
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { investmentId, withdrawal_password, amount } = req.body;
    const userId = req.user.userId;
    
    console.log('Withdrawal request received:', { 
      userId, 
      investmentId: investmentId || 'none (standalone)', 
      amount,
      hasPassword: !!withdrawal_password 
    });

    // Get user with withdrawal settings and registered phone
    const user = await dbGet(
      'SELECT withdrawal_password, withdrawal_wallet, withdrawal_phone, phone, last_withdrawal_date FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if withdrawal password is set
    if (!user.withdrawal_password) {
      return res.status(400).json({ error: 'Withdrawal password not set. Please set it in your profile settings.' });
    }

    // Verify withdrawal password
    const { comparePassword } = require('./utils/auth');
    const passwordValid = await comparePassword(withdrawal_password, user.withdrawal_password);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid withdrawal password' });
    }

    // Check if withdrawal wallet is set
    if (!user.withdrawal_wallet) {
      return res.status(400).json({ error: 'Withdrawal wallet not set. Please set it in your profile settings.' });
    }

    // Check if user has withdrawn today
    const today = new Date().toISOString().split('T')[0];
    if (user.last_withdrawal_date === today) {
      return res.status(400).json({ error: 'You can only withdraw once per day. Please try again tomorrow.' });
    }

    // Get withdrawal amount
    let withdrawalAmount = parseFloat(amount);
    
    // Validate minimum withdrawal
    if (withdrawalAmount < 50) {
      return res.status(400).json({ error: 'Minimum withdrawal amount is Zmw50' });
    }

    // If investmentId provided, validate investment
    if (investmentId) {
      const investment = await dbGet(
        'SELECT * FROM investments WHERE id = ? AND user_id = ?',
        [investmentId, userId]
      );

      if (!investment) {
        return res.status(404).json({ error: 'Investment not found' });
      }

      // Maturity date check removed - investments can be withdrawn anytime

      // Check if already withdrawn
      if (investment.status === 'withdrawn') {
        return res.status(400).json({ error: 'Investment already withdrawn' });
      }

      // Calculate withdrawal amount (principal + accruals)
      const totalValue = investment.deposit_amount + investment.total_accruals;
      
      // Check if withdrawal amount exceeds available
      if (withdrawalAmount > totalValue) {
        return res.status(400).json({ error: `Withdrawal amount (K${withdrawalAmount}) exceeds available balance (K${totalValue.toFixed(2)})` });
      }
    } else {
      // Standalone withdrawal - check total balance - include ALL transactions (including deleted ones)
      const transactions = await dbQuery(
        `SELECT type, amount, investment_id, deleted FROM transactions WHERE user_id = ?`,
        [userId]
      );
      const investments = await dbQuery(
        `SELECT id, deposit_amount, total_accruals FROM investments WHERE user_id = ? AND status = 'active'`,
        [userId]
      );
      
      // Calculate balance: deposits + accruals + bonuses - withdrawals - investments from balance
      // IMPORTANT: Include ALL transactions (including deleted ones) for accurate balance calculation
      // Deleted transactions are marked as deleted=1 but still count toward balance
      const totalDeposits = transactions
        .filter(t => t && t.type === 'deposit' && t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);
      const totalWithdrawn = transactions
        .filter(t => t && t.type === 'withdrawal')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Include ALL accrual and bonus transactions (regardless of investment_id or deleted status)
      // This ensures all daily income, bonuses, and any other income is included in balance
      const allAccrualsAndBonuses = transactions
        .filter(t => t && (t.type === 'accrual' || t.type === 'bonus'))
        .reduce((sum, t) => sum + t.amount, 0);
      
      const investmentsFromBalance = transactions
        .filter(t => t && t.type === 'investment')
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const availableBalance = totalDeposits + allAccrualsAndBonuses - totalWithdrawn - investmentsFromBalance;
      
      if (withdrawalAmount > availableBalance) {
        return res.status(400).json({ error: `Withdrawal amount (K${withdrawalAmount}) exceeds available balance (K${availableBalance.toFixed(2)})` });
      }
    }

    // Calculate 12% withdrawal charge
    const withdrawalCharge = withdrawalAmount * 0.12;
    const netAmount = withdrawalAmount - withdrawalCharge;

    // Create withdrawal request (pending admin approval)
    // Use registered phone number first, fallback to withdrawal_phone
    const phoneForWithdrawal = user.phone || user.withdrawal_phone;
    
    // Validate phone is set (required for withdrawal)
    if (!phoneForWithdrawal || phoneForWithdrawal.trim() === '') {
      console.error('Withdrawal error: User does not have a phone number set');
      return res.status(400).json({ error: 'Phone number is required for withdrawal. Please ensure your account has a registered phone number.' });
    }
    
    console.log('Creating withdrawal request:', {
      userId,
      investmentId: investmentId || 'none (standalone)',
      amount: withdrawalAmount,
      charge: withdrawalCharge,
      netAmount,
      wallet: user.withdrawal_wallet,
      phone: phoneForWithdrawal
    });
    
    const requestResult = await dbRun(
      `INSERT INTO withdrawal_requests 
       (user_id, investment_id, amount, gross_amount, charge, net_amount, wallet, phone, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        userId,
        investmentId || null, // Allow NULL for standalone withdrawals
        withdrawalAmount,
        withdrawalAmount,
        withdrawalCharge,
        netAmount,
        user.withdrawal_wallet,
        phoneForWithdrawal.trim()
      ]
    );
    
    console.log('Withdrawal request created successfully:', requestResult.lastID);

    // Send response first to ensure user gets confirmation
    res.json({ 
      message: 'Withdrawal request submitted successfully. Pending admin approval.', 
      request_id: requestResult.lastID,
      gross_amount: withdrawalAmount,
      charge: withdrawalCharge,
      net_amount: netAmount,
      wallet: user.withdrawal_wallet,
      status: 'pending'
    });

    // Send email notification (non-blocking - don't fail withdrawal if email fails)
    // Only send if user has an email address
    // Do this AFTER sending response to avoid blocking the response
    try {
      const userInfo = await getUserById(userId);
      if (userInfo && userInfo.email) {
        const phoneDisplay = phoneForWithdrawal || 'Not set';
        sendEmail(
          userInfo.email,
          'Withdrawal Request Submitted',
          `Your withdrawal request of K${withdrawalAmount} has been submitted and is pending admin approval. Withdrawal charge: K${withdrawalCharge.toFixed(2)}. Net amount: K${netAmount.toFixed(2)}. Funds will be sent to ${phoneDisplay} via ${user.withdrawal_wallet.toUpperCase()} once approved.`,
          `<h1>Withdrawal Request Submitted</h1>
           <p>Your withdrawal request of K${withdrawalAmount} has been submitted and is pending admin approval.</p>
           <p><strong>Withdrawal Charge (12%):</strong> K${withdrawalCharge.toFixed(2)}</p>
           <p><strong>Net Amount:</strong> K${netAmount.toFixed(2)}</p>
           <p><strong>Payment Method:</strong> ${user.withdrawal_wallet.toUpperCase()}</p>
           <p><strong>Phone Number:</strong> ${phoneDisplay}</p>
           <p>You will be notified once your withdrawal request is processed.</p>`
        ).catch(emailError => {
          // Log email error but don't fail the withdrawal
          console.error('Failed to send withdrawal email (non-critical):', emailError);
        });
      } else {
        console.log(`User ${userId} does not have an email address. Skipping email notification.`);
      }
    } catch (emailErr) {
      // Log error but don't fail - withdrawal is already saved
      console.error('Error sending email notification (non-critical):', emailErr);
    }
  } catch (error) {
    console.error('Withdrawal error:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno
    });
    // Return detailed error for debugging
    res.status(500).json({ 
      error: 'Failed to process withdrawal',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ==================== ADMIN ROUTES ====================

// Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Include phone and inviter info (phone/email) via LEFT JOIN
    const users = await dbQuery(
      `SELECT 
        u.id, 
        u.email, 
        u.phone, 
        u.created_at, 
        u.is_admin,
        u.invited_by_user_id,
        inviter.phone as invited_by_phone,
        inviter.email as invited_by_email
      FROM users u
      LEFT JOIN users inviter ON u.invited_by_user_id = inviter.id
      ORDER BY u.is_admin DESC, u.created_at DESC`
    );
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Reset user password (admin only)
app.post('/api/admin/users/:userId/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Get user
    const user = await dbGet('SELECT id, phone, email, full_name FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has a phone number
    if (!user.phone || user.phone.trim() === '') {
      return res.status(400).json({ 
        error: 'User does not have a phone number',
        message: 'Please add a phone number to this user\'s profile before resetting password. Users need a phone number to login.'
      });
    }

    // Use default password
    const newPassword = 'PMK321';
    const passwordHash = await hashPassword(newPassword);

    // Update user password
    const updateResult = await dbRun(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );

    // Verify password was updated
    const verifyUser = await dbGet('SELECT password_hash FROM users WHERE id = ?', [userId]);
    const verifyPassword = await comparePassword(newPassword, verifyUser.password_hash);
    
    if (!verifyPassword) {
      console.error(`❌ Password reset failed: Password verification failed for user ID ${userId}`);
      return res.status(500).json({ error: 'Password reset failed - verification error' });
    }

    console.log(`✅ Password reset successful: User ID ${userId}, Phone: "${user.phone}", Password: ${newPassword}, Verified: ${verifyPassword}`);

    // No email sent - admin will copy password manually and give to user
    res.json({ 
      message: 'Password reset successfully',
      newPassword: newPassword, // Return password so admin can see/copy it
      userPhone: user.phone, // Also return phone so admin knows which phone to use for login
      verified: true
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Get all investments
app.get('/api/admin/investments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const investments = await dbQuery(
      `SELECT i.*, u.email, u.phone, u.full_name, p.amount as package_amount, p.daily_rate
       FROM investments i
       JOIN users u ON i.user_id = u.id
       JOIN packages p ON i.package_id = p.id
       ORDER BY i.created_at DESC`
    );
    res.json(investments);
  } catch (error) {
    console.error('Get investments error:', error);
    res.status(500).json({ error: 'Failed to fetch investments' });
  }
});

// Get all deposits (investments with transaction TXT)
app.get('/api/admin/deposits', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const deposits = await dbQuery(
      `SELECT 
        i.id as investment_id,
        i.deposit_amount as amount,
        i.transaction_txt,
        i.wallet,
        i.created_at as deposit_date,
        i.status,
        u.id as user_id,
        u.phone,
        u.email,
        u.full_name,
        p.level,
        p.amount as package_amount
       FROM investments i
       JOIN users u ON i.user_id = u.id
       JOIN packages p ON i.package_id = p.id
       WHERE i.transaction_txt IS NOT NULL AND i.transaction_txt != ''
         AND i.status != 'deleted'
       ORDER BY 
         CASE WHEN i.status = 'pending' THEN 0 ELSE 1 END,
         i.created_at DESC`
    );
    res.json(deposits);
  } catch (error) {
    console.error('Get deposits error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

// Process deposit request (approve/deny) - admin only
app.put('/api/admin/deposits/:id', authenticateToken, requireAdmin, [
  body('action').isIn(['approve', 'deny']).withMessage('Action must be approve or deny'),
  body('admin_notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const depositId = parseInt(req.params.id);
    const { action, admin_notes } = req.body;
    const adminId = req.user.userId;

    // Get deposit (investment)
    const deposit = await dbGet(
      `SELECT i.*, u.email, u.phone, u.full_name
       FROM investments i
       JOIN users u ON i.user_id = u.id
       WHERE i.id = ?`,
      [depositId]
    );

    if (!deposit) {
      return res.status(404).json({ error: 'Deposit not found' });
    }

    if (deposit.status !== 'pending') {
      return res.status(400).json({ error: `Deposit is already ${deposit.status}` });
    }

    const processedAt = new Date().toISOString();

    // If approved, create deposit transaction and credit user account
    // IMPORTANT: This is just a deposit - it adds to balance, does NOT purchase a level
    if (action === 'approve') {
      // Create deposit transaction to add money to balance
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
        [deposit.user_id, 'deposit', deposit.deposit_amount, depositId]
      );

      // Mark investment as 'deposit_completed' to distinguish from active investments (level purchases)
      await dbRun(
        `UPDATE investments SET status = 'deposit_completed' WHERE id = ?`,
        [depositId]
      );

      console.log(`Deposit ${depositId} approved by admin ${adminId}. Amount: K${deposit.deposit_amount}, User: ${deposit.phone} - Money added to balance (NOT a level purchase)`);
    } else {
      // If denied, mark as denied
      await dbRun(
        `UPDATE investments SET status = 'denied' WHERE id = ?`,
        [depositId]
      );
      console.log(`Deposit ${depositId} denied by admin ${adminId}. Amount: K${deposit.deposit_amount}, User: ${deposit.phone}`);
    }

    const newStatus = action === 'approve' ? 'deposit_completed' : 'denied';

    res.json({ 
      message: `Deposit ${action === 'approve' ? 'approved' : 'denied'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Process deposit error:', error);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

// Get all withdrawal requests (admin only)
app.get('/api/admin/withdrawal-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requests = await dbQuery(
      `SELECT wr.*, 
              u.email, 
              u.phone, 
              u.full_name,
              i.deposit_amount, 
              i.total_accruals,
              i.status as investment_status
       FROM withdrawal_requests wr
       LEFT JOIN users u ON wr.user_id = u.id
       LEFT JOIN investments i ON wr.investment_id = i.id
       ORDER BY wr.requested_at DESC`
    );
    res.json(requests);
  } catch (error) {
    console.error('Get withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to fetch withdrawal requests' });
  }
});

// Process withdrawal request (approve/deny) - admin only
app.put('/api/admin/withdrawal-requests/:id', authenticateToken, requireAdmin, [
  body('action').isIn(['approve', 'deny']).withMessage('Action must be approve or deny'),
  body('admin_notes').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const requestId = parseInt(req.params.id);
    const { action, admin_notes } = req.body;
    const adminId = req.user.userId;

    // Get withdrawal request
    const request = await dbGet(
      `SELECT wr.*, u.email, u.phone 
       FROM withdrawal_requests wr
       JOIN users u ON wr.user_id = u.id
       WHERE wr.id = ?`,
      [requestId]
    );

    if (!request) {
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Withdrawal request is already ${request.status}` });
    }

    const newStatus = action === 'approve' ? 'paid' : 'denied';
    const processedAt = new Date().toISOString();

    // Update withdrawal request
    await dbRun(
      `UPDATE withdrawal_requests 
       SET status = ?, processed_at = ?, processed_by = ?, admin_notes = ?
       WHERE id = ?`,
      [newStatus, processedAt, adminId, admin_notes || null, requestId]
    );

    // If approved, update user's last withdrawal date and create withdrawal transaction
    if (action === 'approve') {
      // Update last withdrawal date
      await dbRun(
        'UPDATE users SET last_withdrawal_date = date("now") WHERE id = ?',
        [request.user_id]
      );

      // Create withdrawal transaction (allow NULL investment_id for standalone withdrawals)
      // IMPORTANT: Deduct the FULL gross_amount (not net_amount) so the 12% charge is removed from balance
      // Example: User withdraws 50, charge is 6 (12%), net is 44
      // We deduct 50 from balance (not 44), so the 6 charge doesn't remain in account
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
        [request.user_id, 'withdrawal', request.gross_amount, request.investment_id || null]
      );
    }

    // Send email notification to user (non-blocking)
    if (request.email) {
      const statusMessage = action === 'approve' 
        ? `Your withdrawal request of K${request.gross_amount} has been approved. Net amount K${request.net_amount} will be sent to ${request.phone} via ${request.wallet.toUpperCase()}.`
        : `Your withdrawal request of K${request.gross_amount} has been denied. ${admin_notes ? 'Reason: ' + admin_notes : ''}`;

      sendEmail(
        request.email,
        `Withdrawal Request ${action === 'approve' ? 'Approved' : 'Denied'}`,
        statusMessage,
        `<h1>Withdrawal Request ${action === 'approve' ? 'Approved' : 'Denied'}</h1>
         <p>${statusMessage}</p>
         ${admin_notes ? `<p><strong>Admin Notes:</strong> ${admin_notes}</p>` : ''}`
      ).catch(emailError => {
        console.error('Failed to send withdrawal status email (non-critical):', emailError);
      });
    }

    console.log(`Withdrawal request ${requestId} ${action === 'approve' ? 'approved' : 'denied'} by admin ${adminId}`);

    res.json({ 
      message: `Withdrawal request ${action === 'approve' ? 'approved' : 'denied'} successfully`,
      status: newStatus
    });
  } catch (error) {
    console.error('Process withdrawal request error:', error);
    res.status(500).json({ error: 'Failed to process withdrawal request' });
  }
});

// Delete withdrawal requests (admin only) - bulk delete
app.delete('/api/admin/withdrawal-requests', authenticateToken, requireAdmin, [
  body('ids').isArray().withMessage('IDs must be an array'),
  body('ids.*').isInt().withMessage('Each ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { ids } = req.body;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    // Delete withdrawal requests
    const placeholders = ids.map(() => '?').join(',');
    await dbRun(
      `DELETE FROM withdrawal_requests WHERE id IN (${placeholders})`,
      ids
    );

    console.log(`Deleted ${ids.length} withdrawal request(s) by admin ${req.user.userId}`);
    res.json({ message: `Successfully deleted ${ids.length} withdrawal request(s)` });
  } catch (error) {
    console.error('Delete withdrawal requests error:', error);
    res.status(500).json({ error: 'Failed to delete withdrawal requests', details: error.message });
  }
});

// Delete deposits (admin only) - bulk delete
app.delete('/api/admin/deposits', authenticateToken, requireAdmin, [
  body('ids').isArray().withMessage('IDs must be an array'),
  body('ids.*').isInt().withMessage('Each ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { ids } = req.body;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    // Mark ONLY deposit-type investments as deleted instead of actually deleting them
    // IMPORTANT:
    // - We ONLY touch investments whose status is 'pending', 'deposit_completed' or 'denied'
    //   (these are pure deposits, NOT level purchases)
    // - We NEVER touch 'active' investments (actual levels like L1, L2, L3...), so
    //   user's Total Invested and current level are NOT affected
    // - Transactions remain in place for balance calculation; they are only flagged as deleted for display
    const placeholders = ids.map(() => '?').join(',');
    
    // Mark deposit investment records as deleted (special status 'deleted')
    // Only for deposits (status in 'pending', 'deposit_completed', 'denied')
    await dbRun(
      `UPDATE investments 
         SET status = 'deleted' 
       WHERE id IN (${placeholders}) 
         AND transaction_txt IS NOT NULL 
         AND transaction_txt != '' 
         AND status IN ('pending', 'deposit_completed', 'denied')`,
      ids
    );
    
    // Mark associated DEPOSIT transactions as deleted (not actually deleted, just flagged)
    // This hides them from admin/user transaction lists but keeps them in balance calculations
    try {
      // Try to add the column if it doesn't exist (will fail silently if it exists)
      await dbRun(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`).catch(() => {
        // Column already exists, which is fine
      });
      
      // Now update transactions to mark as deleted
      await dbRun(
        `UPDATE transactions SET deleted = 1 WHERE investment_id IN (${placeholders})`,
        ids
      );
      console.log(`Marked transactions as deleted for investment IDs: ${ids.join(', ')}`);
    } catch (updateErr) {
      console.error('Error marking transactions as deleted:', updateErr.message);
      // Don't fail the deposit deletion if transaction update fails
      // The deposit will still be hidden from admin panel
      console.warn('Transactions were not marked as deleted, but deposit records were updated.');
    }

    console.log(`Marked ${ids.length} deposit(s) as deleted by admin ${req.user.userId} (balance preserved)`);
    res.json({ message: `Successfully deleted ${ids.length} deposit record(s). User balances remain intact.` });
  } catch (error) {
    console.error('Delete deposits error:', error);
    res.status(500).json({ error: 'Failed to delete deposits', details: error.message });
  }
});

// Delete transaction records (mark as deleted, preserve balance)
// This allows admins to clean up transaction history without affecting user balances
app.delete('/api/admin/transactions', authenticateToken, requireAdmin, [
  body('ids').isArray().withMessage('IDs must be an array'),
  body('ids.*').isInt().withMessage('Each ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { ids } = req.body;
    if (!ids || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }

    // Mark transactions as deleted instead of actually deleting them
    // This preserves balance calculations while hiding them from admin panel
    const placeholders = ids.map(() => '?').join(',');
    
    try {
      // First ensure the deleted column exists (will fail silently if it already exists)
      try {
        await dbRun(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`);
        console.log('Added deleted column to transactions table');
      } catch (alterErr) {
        // Column already exists, which is fine
        if (alterErr.message && !alterErr.message.includes('duplicate') && !alterErr.message.includes('already exists')) {
          console.warn('Could not add deleted column (may already exist):', alterErr.message);
        }
      }
      
      // Now update transactions to mark as deleted
      const result = await dbRun(
        `UPDATE transactions SET deleted = 1 WHERE id IN (${placeholders})`,
        ids
      );

      console.log(`Marked ${ids.length} transaction(s) as deleted by admin ${req.user.userId} (balance preserved). Updated ${result.changes} rows.`);
      console.log(`Transaction IDs marked as deleted: ${ids.join(', ')}`);
      res.json({ 
        message: `Successfully deleted ${ids.length} transaction record(s). User balances remain intact.`,
        updated: result.changes
      });
    } catch (updateErr) {
      console.error('Error marking transactions as deleted:', updateErr.message);
      console.error('Stack:', updateErr.stack);
      // Don't delete transactions if update fails - preserve user balances
      res.status(500).json({ 
        error: 'Failed to mark transactions as deleted',
        message: 'Transactions were NOT deleted to preserve user balances. Please check database migration.',
        details: updateErr.message
      });
    }
  } catch (error) {
    console.error('Delete transactions error:', error);
    res.status(500).json({ error: 'Failed to delete transactions', details: error.message });
  }
});

// Reset user investments and level (admin only) - remove all investments and set level to L0
app.post('/api/admin/users/:userId/reset-investments', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const adminId = req.user.userId;

    // Check if user exists
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get all investments for this user
    const investments = await dbQuery(
      'SELECT id FROM investments WHERE user_id = ?',
      [userId]
    );

    // Delete all transactions related to these investments
    if (investments.length > 0) {
      const investmentIds = investments.map(inv => inv.id);
      const placeholders = investmentIds.map(() => '?').join(',');
      await dbRun(
        `DELETE FROM transactions WHERE investment_id IN (${placeholders})`,
        investmentIds
      );
    }

    // Delete all investment transactions (type = 'investment')
    await dbRun(
      'DELETE FROM transactions WHERE user_id = ? AND type = ?',
      [userId, 'investment']
    );

    // Delete all investments
    await dbRun(
      'DELETE FROM investments WHERE user_id = ?',
      [userId]
    );

    // Reset user level to L0
    await dbRun(
      'UPDATE users SET level = ? WHERE id = ?',
      ['L0', userId]
    );

    console.log(`Reset investments and level for user ${userId} (${user.phone}) by admin ${adminId}. Deleted ${investments.length} investment(s).`);

    res.json({ 
      message: `Successfully reset user investments and level to L0`,
      deletedInvestments: investments.length
    });
  } catch (error) {
    console.error('Reset user investments error:', error);
    res.status(500).json({ error: 'Failed to reset user investments', details: error.message });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const adminId = req.user.userId;

    // Prevent admin from deleting themselves
    if (userId === adminId) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    // Check if user exists (this uses its own connection)
    const user = await getUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting admin users
    if (user.is_admin) {
      return res.status(400).json({ error: 'Cannot delete admin users' });
    }

    // Delete user and all related records using sequential dbRun calls
    // This approach is more reliable and handles connections properly
    console.log(`Starting deletion process for user ID: ${userId}`);
    
    try {
      // 1. Update withdrawal_requests that reference this user as processed_by
      console.log(`Step 1: Updating withdrawal_requests processed_by for user ${userId}`);
      await dbRun('UPDATE withdrawal_requests SET processed_by = NULL WHERE processed_by = ?', [userId]);
      
      // 2. Update users that were invited by this user
      console.log(`Step 2: Updating users invited_by_user_id for user ${userId}`);
      await dbRun('UPDATE users SET invited_by_user_id = NULL WHERE invited_by_user_id = ?', [userId]);
      
      // 3. Delete user's transactions
      console.log(`Step 3: Deleting transactions for user ${userId}`);
      await dbRun('DELETE FROM transactions WHERE user_id = ?', [userId]);
      
      // 4. Delete user's withdrawal requests
      console.log(`Step 4: Deleting withdrawal_requests for user ${userId}`);
      await dbRun('DELETE FROM withdrawal_requests WHERE user_id = ?', [userId]);
      
      // 5. Delete user's investments
      console.log(`Step 5: Deleting investments for user ${userId}`);
      await dbRun('DELETE FROM investments WHERE user_id = ?', [userId]);
      
      // 6. Delete user's certificates (uses uploaded_by column, not user_id)
      console.log(`Step 6: Deleting certificates for user ${userId}`);
      await dbRun('DELETE FROM certificates WHERE uploaded_by = ?', [userId]);
      
      // 7. Delete user's announcements (uses created_by column)
      console.log(`Step 7: Deleting announcements for user ${userId}`);
      await dbRun('DELETE FROM announcements WHERE created_by = ?', [userId]);
      
      // 8. Delete the user
      console.log(`Step 8: Deleting user ${userId}`);
      const deleteResult = await dbRun('DELETE FROM users WHERE id = ?', [userId]);
      console.log(`User deletion result: ${deleteResult.changes} row(s) affected`);
      
      if (deleteResult.changes === 0) {
        throw new Error('User was not deleted. User may not exist or may have already been deleted.');
      }
      
    } catch (dbError) {
      console.error('Database error during user deletion:', dbError);
      console.error('Error details:', {
        message: dbError.message,
        code: dbError.code,
        errno: dbError.errno,
        stack: dbError.stack
      });
      throw dbError;
    }

    console.log(`User ${userId} deleted by admin ${adminId}`);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to delete user', details: error.message });
  }
});

// Update investment status
app.put('/api/admin/investments/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'matured', 'withdrawn'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await dbRun('UPDATE investments SET status = ? WHERE id = ?', [status, id]);
    res.json({ message: 'Investment status updated' });
  } catch (error) {
    console.error('Update investment error:', error);
    res.status(500).json({ error: 'Failed to update investment' });
  }
});

// Add daily income by level (bulk operation)
app.post('/api/admin/daily-income/level', authenticateToken, requireAdmin, [
  body('level').isIn(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10']).withMessage('Invalid level'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { level, amount } = req.body;

    // Get all users with the specified level
    const users = await dbQuery(
      'SELECT id FROM users WHERE level = ?',
      [level]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: `No users found with level ${level}` });
    }

    let successCount = 0;
    let errorCount = 0;

    // Add daily income to each user's investments
    for (const user of users) {
      try {
        // Get all active investments for this user
        const investments = await dbQuery(
          `SELECT id, user_id, deposit_amount, total_accruals 
           FROM investments 
           WHERE user_id = ? AND status = 'active'`,
          [user.id]
        );

        if (investments.length === 0) {
          // If user has no investments, create a transaction entry for balance tracking
          // This ensures the daily income is still credited to their account
          // The balance calculation will need to include these standalone transactions
          await dbRun(
            'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
            [user.id, 'accrual', amount]
          );
          console.log(`Daily income added as transaction for user ${user.id} (no investments)`);
          successCount++;
          continue;
        }

        // Add daily income to each investment
        for (const investment of investments) {
          // Update investment total accruals
          await dbRun(
            'UPDATE investments SET total_accruals = total_accruals + ? WHERE id = ?',
            [amount, investment.id]
          );

          // Create accrual transaction
          await dbRun(
            'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
            [user.id, 'accrual', amount, investment.id]
          );
        }

        successCount++;
      } catch (error) {
        console.error(`Error adding daily income for user ${user.id}:`, error);
        errorCount++;
      }
    }

    console.log(`Daily income added: Level ${level}, Amount K${amount}, Users: ${successCount} success, ${errorCount} errors`);

    res.json({
      message: `Daily income of K${amount} added to ${successCount} users at level ${level}`,
      successCount,
      errorCount,
      totalUsers: users.length
    });
  } catch (error) {
    console.error('Add daily income by level error:', error);
    res.status(500).json({ error: 'Failed to add daily income by level' });
  }
});

// Add daily income (individual user by phone number)
app.post('/api/admin/daily-income', authenticateToken, requireAdmin, [
  body('accountId').trim().notEmpty().withMessage('Account ID (phone number) is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { accountId, amount } = req.body;

    // Find user by phone number (account ID)
    const { normalizeZambianPhone } = require('./utils/auth');
    const normalizedPhone = normalizeZambianPhone(accountId);
    
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Get user by phone
    const user = await getUserByPhone(accountId);
    if (!user) {
      return res.status(404).json({ error: `User with phone number ${accountId} not found` });
    }

    // Get all active investments for this user
    const investments = await dbQuery(
      `SELECT id FROM investments WHERE user_id = ? AND status = 'active'`,
      [user.id]
    );

    if (investments.length === 0) {
      // If user has no investments, create a standalone accrual transaction
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
        [user.id, 'accrual', amount]
      );
      console.log(`Daily income added as transaction for user ${user.id} (no investments)`);
    } else {
      // Add daily income to first active investment
      const investment = investments[0];
      
      // Update investment total accruals
      await dbRun(
        'UPDATE investments SET total_accruals = total_accruals + ? WHERE id = ?',
        [amount, investment.id]
      );

      // Create accrual transaction
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
        [user.id, 'accrual', amount, investment.id]
      );
    }

    console.log(`Daily income added: User ${user.id} (${user.phone}), Amount K${amount}`);

    res.json({
      message: `Daily income of K${amount} added to user ${user.phone}`,
      userId: user.id,
      phone: user.phone,
      amount: amount
    });
  } catch (error) {
    console.error('Add daily income error:', error);
    res.status(500).json({ error: 'Failed to add daily income' });
  }
});

// Add individual bonus by account ID (phone number)
app.post('/api/admin/bonus', authenticateToken, requireAdmin, [
  body('accountId').trim().notEmpty().withMessage('Account ID (phone number) is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { accountId, amount, notes } = req.body;

    // Find user by phone number (account ID)
    const { normalizeZambianPhone } = require('./utils/auth');
    const normalizedPhone = normalizeZambianPhone(accountId);
    
    if (!normalizedPhone) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Get user by phone
    const user = await getUserByPhone(accountId);
    if (!user) {
      return res.status(404).json({ error: `User with phone number ${accountId} not found` });
    }

    // Get all active investments for this user
    const investments = await dbQuery(
      `SELECT id FROM investments WHERE user_id = ? AND status = 'active'`,
      [user.id]
    );

    if (investments.length === 0) {
      // If user has no investments, create a transaction entry for balance tracking
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, date) VALUES (?, ?, ?, datetime("now"))',
        [user.id, 'bonus', amount]
      );
      console.log(`Bonus added as transaction for user ${user.id} (no investments)`);
    } else {
      // Add bonus to first active investment (or distribute evenly)
      const investment = investments[0];
      
      // Update investment total accruals
      await dbRun(
        'UPDATE investments SET total_accruals = total_accruals + ? WHERE id = ?',
        [amount, investment.id]
      );

      // Create bonus transaction
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, investment_id, date) VALUES (?, ?, ?, ?, datetime("now"))',
        [user.id, 'bonus', amount, investment.id]
      );
    }

    console.log(`Bonus added: User ${user.id} (${user.phone}), Amount K${amount}, Notes: ${notes || 'N/A'}`);

    res.json({
      message: `Bonus of K${amount} added to user ${user.phone}`,
      userId: user.id,
      phone: user.phone
    });
  } catch (error) {
    console.error('Add bonus error:', error);
    res.status(500).json({ error: 'Failed to add bonus' });
  }
});

// Get admin stats
app.get('/api/admin/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await dbGet('SELECT COUNT(*) as count FROM users');
    const totalInvestments = await dbGet('SELECT COUNT(*) as count FROM investments WHERE status = "active"');
    
    // Total Deposits: Only count actual deposits (status = 'deposit_completed', 'pending', 'denied')
    // Exclude active investments (level purchases) to avoid duplicates
    // Deposits have transaction_txt set, active investments don't (or have 'BALANCE_INVESTMENT')
    const totalDeposits = await dbGet(
      `SELECT SUM(deposit_amount) as total 
       FROM investments 
       WHERE status IN ('deposit_completed', 'pending', 'denied') 
         AND transaction_txt IS NOT NULL 
         AND transaction_txt != ''
         AND transaction_txt != 'BALANCE_INVESTMENT'`
    );
    
    // Total Accruals: Only from active investments (actual level purchases)
    const totalAccruals = await dbGet(
      'SELECT SUM(total_accruals) as total FROM investments WHERE status = "active"'
    );
    
    res.json({
      totalUsers: totalUsers.count,
      totalInvestments: totalInvestments.count,
      totalDeposits: totalDeposits.total || 0,
      totalAccruals: totalAccruals.total || 0
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ==================== ANNOUNCEMENTS ROUTES ====================

// Get all active announcements (public - no auth required)
app.get('/api/announcements', async (req, res) => {
  try {
    const announcements = await dbQuery(
      `SELECT a.*, u.full_name as created_by_name 
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.is_active = 1
       ORDER BY a.priority DESC, a.created_at DESC
       LIMIT 20`
    );
    res.json(announcements);
  } catch (error) {
    console.error('Get announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Get all announcements (admin only)
app.get('/api/admin/announcements', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const announcements = await dbQuery(
      `SELECT a.*, u.full_name as created_by_name, u.phone as created_by_phone
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       ORDER BY a.priority DESC, a.created_at DESC`
    );
    res.json(announcements);
  } catch (error) {
    console.error('Get admin announcements error:', error);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// Create announcement (admin only) - with optional image upload
app.post('/api/admin/announcements', authenticateToken, requireAdmin, uploadAnnouncement.single('image'), async (req, res) => {
  try {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    const { title, content, priority = 0 } = req.body;
    // Handle is_active: FormData sends booleans as strings, default to true (active) if not provided
    let is_active = req.body.is_active;
    if (is_active === undefined || is_active === null || is_active === '') {
      is_active = true; // Default to active
    } else {
      // Convert string "true"/"false" or boolean to number
      is_active = (is_active === 'true' || is_active === true || is_active === '1' || is_active === 1);
    }
    
    // Validate required fields
    if (!title || !title.trim()) {
      // Delete uploaded file if validation fails
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Title is required' });
    }
    if (!content || !content.trim()) {
      // Delete uploaded file if validation fails
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ error: 'Content is required' });
    }

    const userId = req.user.userId;
    let imagePath = null;

    // Handle image upload if provided
    if (req.file) {
      imagePath = `/uploads/announcements/${req.file.filename}`;
    }

    const result = await dbRun(
      'INSERT INTO announcements (title, content, image_path, created_by, priority, is_active) VALUES (?, ?, ?, ?, ?, ?)',
      [title.trim(), content.trim(), imagePath, userId, parseInt(priority) || 0, is_active ? 1 : 0]
    );

    const announcement = await dbGet(
      `SELECT a.*, u.full_name as created_by_name 
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = ?`,
      [result.lastID]
    );

    res.status(201).json(announcement);
  } catch (error) {
    console.error('Create announcement error:', error);
    // Delete uploaded file if there was an error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    res.status(500).json({ error: 'Failed to create announcement' });
  }
});

// Update announcement (admin only) - with optional image upload
app.put('/api/admin/announcements/:id', authenticateToken, requireAdmin, uploadAnnouncement.single('image'), async (req, res) => {
  try {
    // Handle multer errors
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    const announcementId = parseInt(req.params.id);
    const { title, content, priority, is_active, remove_image } = req.body;

    // Check if announcement exists
    const existing = await dbGet('SELECT * FROM announcements WHERE id = ?', [announcementId]);
    if (!existing) {
      // Delete uploaded file if announcement doesn't exist
      if (req.file && req.file.path) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(404).json({ error: 'Announcement not found' });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    
    if (title !== undefined && title.trim() !== '') {
      updates.push('title = ?');
      values.push(title.trim());
    }
    if (content !== undefined && content.trim() !== '') {
      updates.push('content = ?');
      values.push(content.trim());
    }
    if (priority !== undefined) {
      updates.push('priority = ?');
      values.push(parseInt(priority) || 0);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active === 'true' || is_active === true ? 1 : 0);
    }
    
    // Handle image upload or removal
    if (req.file) {
      // New image uploaded - delete old one if exists
      if (existing.image_path) {
        const oldFilePath = path.join(__dirname, 'public', existing.image_path);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      const imagePath = `/uploads/announcements/${req.file.filename}`;
      updates.push('image_path = ?');
      values.push(imagePath);
    } else if (remove_image === 'true' || remove_image === true) {
      // Remove image
      if (existing.image_path) {
        const oldFilePath = path.join(__dirname, 'public', existing.image_path);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      updates.push('image_path = NULL');
    }
    
    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(announcementId);

    await dbRun(
      `UPDATE announcements SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    const updated = await dbGet(
      `SELECT a.*, u.full_name as created_by_name 
       FROM announcements a
       LEFT JOIN users u ON a.created_by = u.id
       WHERE a.id = ?`,
      [announcementId]
    );

    res.json(updated);
  } catch (error) {
    console.error('Update announcement error:', error);
    // Delete uploaded file if there was an error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    res.status(500).json({ error: 'Failed to update announcement' });
  }
});

// Delete announcement (admin only)
app.delete('/api/admin/announcements/:id', authenticateToken, requireAdmin, async (req, res) => {
  let announcementId;
  try {
    announcementId = parseInt(req.params.id);
    
    if (isNaN(announcementId) || announcementId <= 0) {
      console.error(`Invalid announcement ID: ${req.params.id}`);
      return res.status(400).json({ error: 'Invalid announcement ID', received: req.params.id });
    }

    console.log(`[DELETE] Attempting to delete announcement ID: ${announcementId}`);

    // Check if announcement exists
    let existing;
    try {
      existing = await dbGet('SELECT * FROM announcements WHERE id = ?', [announcementId]);
    } catch (dbErr) {
      console.error('[DELETE] Database error checking announcement:', dbErr);
      return res.status(500).json({ error: 'Database error', details: dbErr.message });
    }
    
    if (!existing) {
      console.log(`[DELETE] Announcement ${announcementId} not found`);
      return res.status(404).json({ error: 'Announcement not found', id: announcementId });
    }

    console.log(`[DELETE] Found announcement: "${existing.title}" (ID: ${announcementId})`);

    // Delete image file if exists (non-blocking)
    if (existing.image_path) {
      try {
        // Normalize image path - remove leading slash if present to avoid path.join issues
        const normalizedImagePath = existing.image_path.startsWith('/') 
          ? existing.image_path.substring(1) 
          : existing.image_path;
        const imageFilePath = path.join(__dirname, 'public', normalizedImagePath);
        
        if (fs.existsSync(imageFilePath)) {
          fs.unlinkSync(imageFilePath);
          console.log(`[DELETE] Deleted image file: ${imageFilePath}`);
        } else {
          console.log(`[DELETE] Image file not found (skipping): ${imageFilePath}`);
        }
      } catch (unlinkErr) {
        // Log error but don't fail the deletion if image can't be deleted
        console.error('[DELETE] Error deleting announcement image file (non-critical):', unlinkErr.message);
      }
    }

    // Delete from database
    try {
      const result = await dbRun('DELETE FROM announcements WHERE id = ?', [announcementId]);
      console.log(`[DELETE] Successfully deleted announcement ID: ${announcementId}, changes: ${result.changes}`);
      
      if (result.changes === 0) {
        console.warn(`[DELETE] No rows deleted for announcement ID: ${announcementId}`);
        return res.status(404).json({ error: 'Announcement not found or already deleted', id: announcementId });
      }

      res.json({ message: 'Announcement deleted successfully', id: announcementId });
    } catch (dbErr) {
      console.error('[DELETE] Database error deleting announcement:', dbErr);
      console.error('[DELETE] Error details:', dbErr.message, dbErr.stack);
      return res.status(500).json({ error: 'Failed to delete announcement from database', details: dbErr.message });
    }
  } catch (error) {
    console.error('[DELETE] Unexpected error deleting announcement:', error);
    console.error('[DELETE] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to delete announcement', details: error.message, id: announcementId });
  }
});

// ==================== CRON JOB - Daily Accruals ====================

// Run daily at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running daily accrual job...');
  try {
    // Get all active investments
    const investments = await dbQuery(
      `SELECT i.*, p.daily_rate
       FROM investments i
       JOIN packages p ON i.package_id = p.id
       WHERE i.status = 'active'`
    );

    for (const investment of investments) {
      // Calculate daily accrual
      const dailyAccrual = investment.deposit_amount * investment.daily_rate;

      // Update total accruals
      await dbRun(
        'UPDATE investments SET total_accruals = total_accruals + ? WHERE id = ?',
        [dailyAccrual, investment.id]
      );

      // Create accrual transaction
      await dbRun(
        'INSERT INTO transactions (user_id, type, amount, investment_id) VALUES (?, ?, ?, ?)',
        [investment.user_id, 'accrual', dailyAccrual, investment.id]
      );

      // Maturity date logic removed - investments no longer mature
      // Investments remain active and continue earning daily income indefinitely
    }

    console.log(`Processed ${investments.length} investments`);
  } catch (error) {
    console.error('Accrual job error:', error);
  }
});

// ==================== SERVER START ====================

// Start server only after database is initialized
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

