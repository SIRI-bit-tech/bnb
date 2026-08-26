# BNB Banking Platform

A comprehensive, production-ready full-stack online banking platform built with Next.js 16 (Frontend) and FastAPI (Backend).

## 📋 Project Overview

BNB Banking Platform is a secure, professional digital banking solution that enables users to:

- **Manage Multiple Accounts**: Checking, Savings, and Crypto accounts in different currencies
- **Transfer Money**: Internal, domestic, and international transfers with real-time processing
- **Apply for Loans**: Browse loan products and manage applications and active loans
- **Pay Bills**: Schedule and manage recurring bill payments
- **Real-time Notifications**: Live updates via Ably for transactions and alerts
- **Customer Support**: Live chat with relationship managers and support tickets
- **Multi-currency Support**: 15+ currencies with competitive exchange rates
- **Bank-Grade Security**: 128-bit SSL encryption, JWT authentication, and device authorization

## ðŸ—ï¸ Architecture

### Backend (FastAPI)
Located in `/backend` directory
- **Framework**: Python FastAPI with async/await
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Authentication**: Better Auth (primary) + Clerk (fallback)
- **Real-time**: Ably SDK for live notifications
- **File Storage**: Cloudinary for document management
- **Background Jobs**: Celery for async tasks
- **Caching**: Redis for session and data caching

### Frontend (Next.js 16)
Located in `/frontend` directory
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **UI Framework**: React with Tailwind CSS v4
- **State Management**: Zustand for global state
- **Data Fetching**: SWR for client-side caching
- **Real-time**: Ably client SDK
- **API Client**: Axios for HTTP requests

## 🚀 Getting Started

### Prerequisites
- Python 3.9+
- Node.js 18+
- PostgreSQL 12+
- Redis 6+

### Backend Setup

1. **Clone the repository**
   ```bash
   cd backend
   ```

2. **Create virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. **Initialize database**
   ```bash
   # FastAPI will auto-create tables on startup
   python main.py
   ```

6. **Start the server**
   ```bash
   uvicorn main:app --reload --host 127.0.0.1 --port 8000
   python main.py
   taskkill /F /IM python.exe
   ```

### Frontend Setup

1. **Navigate to frontend**
   ```bash
   cd frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API URL and keys
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

## ðŸ“ Project Structure

### Backend Structure
```
backend/
├── main.py                 # FastAPI application entry point
├── config.py              # Configuration management
├── database.py            # Database connection and session
├── models/                # SQLAlchemy database models
â”‚   ├── user.py           # User model
â”‚   ├── account.py        # Account models
â”‚   ├── transaction.py    # Transaction model
â”‚   ├── transfer.py       # Transfer and beneficiary models
â”‚   ├── loan.py           # Loan-related models
â”‚   ├── notification.py   # Notification models
â”‚   ├── document.py       # Document model
â”‚   ├── support.py        # Support ticket and chat models
â”‚   └── bill_payment.py   # Bill payment models
├── routers/               # API route handlers
â”‚   ├── auth.py           # Authentication endpoints
â”‚   ├── accounts.py       # Account management endpoints
â”‚   ├── transfers.py      # Transfer endpoints
â”‚   ├── loans.py          # Loan endpoints
â”‚   ├── notifications.py  # Notification endpoints
â”‚   ├── support.py        # Support endpoints
â”‚   ├── profile.py        # Profile endpoints
â”‚   ├── documents.py      # Document endpoints
â”‚   └── bill_payments.py  # Bill payment endpoints
└── requirements.txt      # Python dependencies

```

### Frontend Structure
```
frontend/
├── src/
â”‚   ├── app/              # Next.js app directory
â”‚   â”‚   ├── layout.tsx    # Root layout
â”‚   â”‚   ├── page.tsx      # Home page
â”‚   â”‚   ├── auth/         # Authentication pages
â”‚   â”‚   â”‚   ├── login/
â”‚   â”‚   â”‚   ├── register/
â”‚   â”‚   â”‚   └── layout.tsx
â”‚   â”‚   └── dashboard/    # Protected dashboard pages
â”‚   â”‚       ├── page.tsx
â”‚   â”‚       ├── accounts/
â”‚   â”‚       ├── transfers/
â”‚   â”‚       ├── loans/
â”‚   â”‚       ├── bills/
â”‚   â”‚       ├── profile/
â”‚   â”‚       ├── support/
â”‚   â”‚       └── layout.tsx
â”‚   ├── components/       # Reusable React components
â”‚   ├── lib/             # Utility functions and helpers
â”‚   â”‚   ├── api-client.ts      # Axios API client
â”‚   â”‚   ├── store.ts           # Zustand stores
â”‚   â”‚   └── utils.ts           # Helper functions
â”‚   ├── styles/          # Global CSS and Tailwind config
â”‚   ├── types/           # TypeScript type definitions
â”‚   ├── constants/       # Application constants
â”‚   └── hooks/           # Custom React hooks
├── public/              # Static assets
├── next.config.js       # Next.js configuration
├── tailwind.config.ts   # Tailwind CSS configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Node.js dependencies

```

## 🔌 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout
- `POST /api/v1/auth/refresh` - Refresh access token

### Accounts
- `GET /api/v1/accounts` - Get user accounts
- `POST /api/v1/accounts` - Create new account
- `GET /api/v1/accounts/{id}` - Get account details
- `GET /api/v1/accounts/{id}/balance` - Get current balance
- `GET /api/v1/accounts/{id}/transactions` - Get transaction history
- `GET /api/v1/accounts/{id}/statements` - Get account statements

### Transfers
- `POST /api/v1/transfers/internal` - Internal transfer
- `POST /api/v1/transfers/domestic` - Domestic transfer
- `POST /api/v1/transfers/international` - International transfer
- `GET /api/v1/transfers/{id}` - Get transfer details
- `GET /api/v1/transfers/beneficiaries` - Get saved beneficiaries
- `POST /api/v1/transfers/beneficiaries` - Add beneficiary

### Loans
- `GET /api/v1/loans/products` - Get available loan products
- `POST /api/v1/loans/apply` - Apply for loan
- `GET /api/v1/loans/applications` - Get loan applications
- `GET /api/v1/loans/accounts` - Get active loans
- `POST /api/v1/loans/accounts/{id}/payment` - Make loan payment

### Bill Payments
- `GET /api/v1/bills/payees` - Get bill payees
- `POST /api/v1/bills/pay` - Pay bill
- `POST /api/v1/bills/schedule` - Schedule recurring payment
- `GET /api/v1/bills/scheduled` - Get scheduled payments

### Support
- `POST /api/v1/support/chat/start` - Start support chat
- `POST /api/v1/support/chat/{id}/message` - Send chat message
- `POST /api/v1/support/ticket` - Create support ticket
- `GET /api/v1/support/tickets` - Get support tickets

### Profile
- `GET /api/v1/profile` - Get user profile
- `PUT /api/v1/profile` - Update profile
- `POST /api/v1/profile/documents/upload` - Upload document
- `GET /api/v1/profile/login-history` - Get login history

## ðŸ” Security Features

- **End-to-End Encryption**: 128-bit SSL/TLS for all communications
- **JWT Authentication**: Short-lived access tokens with refresh rotation
- **Device Authorization**: Device verification for new logins
- **Session Management**: 15-minute automatic timeout
- **Password Hashing**: Bcrypt for secure password storage
- **Input Validation**: Pydantic for API request validation
- **Row-Level Security**: Database-level access control
- **Audit Logging**: All sensitive operations logged
- **Rate Limiting**: API rate limiting to prevent abuse

## ðŸ’± Multi-Currency Support

Supported currencies by country:
- ðŸ‡ºðŸ‡¸ United States â†’ USD
- ðŸ‡¬ðŸ‡§ United Kingdom â†’ GBP
- ðŸ‡ªðŸ‡º European Union â†’ EUR
- ðŸ‡°ðŸ‡¼ Kuwait â†’ KWD
- ðŸ‡¦ðŸ‡ª United Arab Emirates â†’ AED
- ðŸ‡¸ðŸ‡¬ Singapore â†’ SGD
- ðŸ‡­ðŸ‡° Hong Kong â†’ HKD
- ðŸ‡®ðŸ‡³ India â†’ INR
- ðŸ‡³ðŸ‡¬ Nigeria â†’ NGN
- ðŸ‡¿ðŸ‡¦ South Africa â†’ ZAR
- ðŸ‡°ðŸ‡ª Kenya â†’ KES
- And 5+ more countries

## ðŸ“Š User Tiers

### Standard Account
- Basic checking and savings accounts
- Domestic transfers (ACH, wire)
- International transfers with standard fees
- Bill payment service
- Email support
- Standard exchange rates

### Priority Banking
- All Standard Account features
- Dedicated relationship manager
- Priority customer support with live chat
- Reduced transfer fees
- Better exchange rates
- Loan pre-approval
- Free cashier's checks

### Premium Account
- All Priority Banking features
- Zero transfer fees for international wires
- Best exchange rates
- Instant loan approval
- Concierge services
- Premium credit cards
- Investment advisory services

## ðŸ”„ Real-time Features (Ably)

Channels:
- `account:{account_id}` - Balance updates, transactions
- `user:{user_id}` - General notifications, security alerts
- `transfers:{user_id}` - Transfer status updates
- `support:{chat_id}` - Live chat messages

Events:
- `balance_updated` - Account balance changed
- `transaction_posted` - New transaction posted
- `transfer_completed` - Transfer successfully completed
- `transfer_failed` - Transfer failed
- `loan_approved` - Loan application approved
- `security_alert` - Security alert triggered
- `message_received` - New support chat message

## ðŸ“± Design System

### Color Palette
- **Primary**: #0073CF (BNB Blue)
- **Secondary**: #009A44 (BNB Green)
- **Accent**: #00AEEF (Light Blue)
- **Success**: #009A44
- **Warning**: #F39C12
- **Error**: #E74C3C
- **Background**: #FFFFFF
- **Text Primary**: #2C2C2C
- **Text Secondary**: #6B6B6B

### Typography
- **Font**: Inter (system fonts fallback)
- **Headings**: Semibold (600, 700)
- **Body**: Regular (400), Medium (500)
- **Monospace**: For account numbers and codes

## ðŸ§ª Testing

### Backend Testing
```bash
cd backend
pytest tests/
```

### Frontend Testing
```bash
cd frontend
npm run test
```

## ðŸš¢ Deployment

### Backend Deployment
```bash
# Build Docker image
docker build -t banking-api .

# Run container
docker run -p 8000:8000 --env-file .env banking-api
```

### Frontend Deployment
```bash
# Build Next.js project
npm run build

# Start production server
npm start
```

## ðŸ“š Documentation

- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [Next.js Documentation](https://nextjs.org/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org)
- [Better Auth Documentation](https://www.better-auth.com)

## ðŸ¤ Contributing

1. Create a feature branch (`git checkout -b feature/amazing-feature`)
2. Commit changes (`git commit -m 'Add amazing feature'`)
3. Push to branch (`git push origin feature/amazing-feature`)
4. Open a Pull Request

## ðŸ“„ License

This project is proprietary and confidential to Broadmont National Bank.

## ðŸ“ž Support

For support, email support@broadmontnationalb.com or create a support ticket in the application.

## âœ¨ Features Summary

✅ Complete user authentication system
✅ Multi-account management (checking, savings, crypto)
✅ Real-time balance and transaction updates
✅ Internal, domestic, and international transfers
✅ Bill payment and recurring payments
✅ Loan application and management system
✅ Real-time notifications via Ably
✅ Document upload and management via Cloudinary
✅ Live chat with customer support
✅ Support tickets system
✅ Multi-currency support (15+ currencies)
✅ User tier system (Standard, Priority, Premium)
✅ Device authorization and login history
✅ Dark mode and responsive design
✅ Production-ready API with validation
✅ Comprehensive error handling
✅ Rate limiting and security middleware
✅ Audit logging for all transactions
✅ Session management with Redis
✅ 128-bit SSL/TLS encryption

---

**Version**: 1.0.0
**Last Updated**: 2024
**Status**: Production Ready
