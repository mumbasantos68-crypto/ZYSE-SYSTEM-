# Zambia Youth Self Employment - Investment Platform

A lightweight investment platform where users can register, select tiered investment packages (K200 to K10,000), deposit funds, earn daily accruals, and withdraw after a 26-day lock-in period.

## Features

- **User Registration & Authentication**: Secure JWT-based authentication
- **Investment Packages**: Tiered packages from K200 to K10,000 with daily accrual rates
- **Payment Integration**: Paystack integration for deposits
- **Daily Accruals**: Automated daily accrual calculation and updates
- **26-Day Lock-in Period**: Investments mature after 26 days
- **Admin Panel**: Manage users and investments
- **Hash-based Routing**: Seamless single-page app experience
- **Mobile-responsive**: Works on all devices

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **Backend**: Node.js with Express.js
- **Database**: SQLite
- **Authentication**: JWT (JSON Web Tokens)
- **Payments**: Paystack API
- **Email**: Nodemailer (Gmail SMTP)
- **Cron Jobs**: node-cron for daily accruals

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# JWT Secret Key
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production

# Email Configuration (Gmail SMTP)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password

# Paystack API Keys
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
PAYSTACK_PUBLIC_KEY=pk_test_your_paystack_public_key

# Server Port
PORT=3000

# Admin Email
ADMIN_EMAIL=admin@zambia-youth.com
```

### 3. Initialize Database

The database will be automatically created and initialized when you start the server.

### 4. Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000`

## Project Structure

```
project/
├── server.js              # Express server with routes and cron jobs
├── package.json           # Dependencies and scripts
├── .env                   # Environment variables (create from .env.example)
├── db.sqlite              # SQLite database (auto-created)
├── public/                # Static files
│   ├── index.html         # Landing page with hash router
│   ├── dashboard.html     # User dashboard
│   ├── invest.html        # Investment page
│   ├── admin.html         # Admin panel
│   ├── css/
│   │   └── style.css      # Global styles
│   └── js/
│       ├── router.js      # Hash-based router
│       ├── auth.js        # Authentication functions
│       ├── dashboard.js   # Dashboard functionality
│       ├── invest.js      # Investment functionality
│       └── admin.js       # Admin panel functionality
├── utils/
│   ├── db.js              # Database utilities
│   ├── auth.js            # Authentication utilities
│   └── payments.js        # Payment integration
└── accrue.py              # Optional Python accrual script
```

## API Endpoints

### Authentication
- `POST /api/register` - Register a new user
- `POST /api/login` - Login and get JWT token

### Packages
- `GET /api/packages` - Get all investment packages

### Investments
- `GET /api/dashboard` - Get user dashboard data (requires auth)
- `POST /api/create-payment` - Initialize payment (requires auth)
- `POST /api/invest` - Create investment (requires auth)
- `POST /api/withdraw` - Withdraw matured investment (requires auth)
- `POST /api/paystack/webhook` - Paystack webhook handler

### Admin
- `GET /api/admin/users` - Get all users (requires admin)
- `GET /api/admin/investments` - Get all investments (requires admin)
- `GET /api/admin/stats` - Get admin statistics (requires admin)
- `PUT /api/admin/investments/:id` - Update investment status (requires admin)

## Daily Accruals

Daily accruals are processed automatically via a cron job that runs at midnight. The cron job:
1. Finds all active investments
2. Calculates daily accrual (deposit_amount * daily_rate)
3. Updates total_accruals
4. Creates a transaction record
5. Marks investments as matured if maturity date is reached

### Manual Accrual (Python Script)

You can also run the Python script manually:

```bash
python accrue.py --db db.sqlite
```

## Investment Packages

Packages are automatically seeded on server startup:
- K200, K350, K500, K1000, K2000, K3000, K4000, K5000, K6000, K7000, K8000, K9000, K10000

Daily rates scale from 1% to 5% based on package amount.

## Security Features

- Password hashing with bcrypt
- JWT token authentication
- Input validation with express-validator
- SQL injection protection (parameterized queries)
- CORS enabled
- Admin-only routes protection

## Deployment

### Glitch

1. Upload project to Glitch
2. Set environment variables in Glitch dashboard
3. Deploy automatically

### Render

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set environment variables
4. Deploy

## Development Notes

- The hash-based router provides seamless navigation without page reloads
- Mock payment is available for development (see `invest.js`)
- Database is file-based SQLite (no server required)
- Email notifications are sent for registration, investment, maturity, and withdrawal

## License

ISC

## Support

For issues or questions, please contact the development team.

