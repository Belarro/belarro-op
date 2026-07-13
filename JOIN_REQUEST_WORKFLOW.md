# Join Request Workflow - Complete Guide

## Overview
Users request access → Admin approves → User sets password → User logs in

---

## For Users

### 1. Request Access
- Go to: **`/join`**
- Enter: Email address
- Enter: Name (optional)
- Click: **"Request Access"**
- You see: "Request submitted. Admin will review shortly."

### 2. Wait for Admin Approval
- Admin reviews your request on the dashboard
- Admin approves your request
- Admin sends you a **setup link**

### 3. Set Your Password
- Click the **setup link** you receive
- Page: `/set-password?token=XXX&email=your@email.com`
- Enter: **New Password** (8+ characters)
- Enter: **Confirm Password**
- Click: **"Create Account"**
- You see: "Password set! Redirecting to login..."

### 4. Log In
- Go to: **`/login`**
- Enter: Your **email address**
- Enter: **Password** (the one you just set)
- Click: **"Sign in"**
- ✅ You're in! Welcome to dashboard

---

## For Admins

### 1. Check Pending Requests
- Go to: **`/admin`** (dashboard)
- Look for: Blue **"Join Requests"** card at the top
- See: List of pending requests with email, name, time requested

### 2. Review Request
- Read the user's email and name
- Verify it's someone who should have access

### 3. Approve Request
- Click: **[Approve]** button
- System generates:
  - 24-hour approval token
  - Setup link with user's email
- Blue box appears with setup link

### 4. Send Link to User
- Click: **[Copy]** button (in blue box)
- Send the link to user via:
  - Email
  - WhatsApp
  - Telegram
  - Any messaging app
- Link format: `https://admin.belarro.com/set-password?token=XXXXX&email=user@example.com`

### 5. User Will Set Password
- User clicks link you sent
- User sets their own password
- User logs in with email + password

### 6. (Optional) Reject Request
- Click: **[Reject]** button
- Request is marked as rejected
- User can request access again later

---

## Key Details

### Setup Link
- **Duration**: 24 hours from approval
- **One-time use**: Token is cleared after password is set
- **Includes**: User's email in URL (pre-filled on form)

### Password Requirements
- Minimum: **8 characters**
- Must: **Match confirmation**
- Type: **Case-sensitive**

### User Roles
After login, users get role: `field`
- Can access: Field operations, deliveries, follow-ups
- Cannot access: Admin settings, financial reports

---

## URLs

| Page | URL | Who Uses | Purpose |
|------|-----|----------|---------|
| Join Request | `/join` | Users | Request access |
| Set Password | `/set-password` | Users | Create account after approval |
| Login | `/login` | Everyone | Sign in |
| Admin Dashboard | `/admin` | Admin | Approve requests |

---

## Troubleshooting

### "Request submitted" but admin doesn't see it
- Refresh dashboard (F5)
- Wait 30 seconds (widget auto-refreshes)
- Check database directly in Supabase

### User's link expires
- Setup links valid for 24 hours
- User can request access again at `/join`
- Admin will approve with new link

### "Invalid token" error
- Token expired (>24 hours)
- User already used this token
- User should request access again

### User forgets password
- User cannot reset yet (no reset flow)
- Workaround: Have admin delete user from database
- User requests access again at `/join`
- Admin approves again

---

## Database

### Table: `user_join_requests`
Tracks all join requests and approvals

| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID | Unique request ID |
| `email` | TEXT | User's email (UNIQUE) |
| `name` | TEXT | User's name (optional) |
| `status` | TEXT | pending / approved / rejected |
| `approval_token` | TEXT | 24-hour setup token |
| `approved_until` | TIMESTAMP | Token expiry time |
| `requested_at` | TIMESTAMP | When user requested |
| `reviewed_at` | TIMESTAMP | When admin acted |

### Table: `admin_users`
User accounts (created after password set)

| Column | Purpose |
|--------|---------|
| `email` | Login email |
| `password_hash` | Bcrypt hash |
| `role` | admin / field / farm |
| `name` | Display name |
| `deleted_at` | Soft-delete flag |

---

## Security

✅ **Email Validation**: Required field, must be unique
✅ **Password Hashing**: Bcrypt (cost=10)
✅ **Token Expiry**: 24 hours
✅ **Rate Limiting**: Max 10 login attempts per 15 minutes
✅ **Case-Insensitive**: Emails normalized to lowercase
✅ **Soft Deletes**: Users marked deleted, not removed
✅ **Admin Protection**: Join requests endpoint requires session
✅ **CSRF**: Next.js built-in protection
✅ **HTTPS**: All communication encrypted

---

## API Endpoints

| Endpoint | Method | Public | Purpose |
|----------|--------|--------|---------|
| `/api/auth/join-request` | POST | Yes | User submits request |
| `/api/auth/join-requests` | GET | No | Admin views pending |
| `/api/auth/join-requests` | POST | No | Admin approve/reject |
| `/api/auth/set-password` | POST | Yes | User sets password |
| `/api/auth/login` | POST | Yes | User logs in |

---

## Workflow Diagram

```
User                          Admin                      System
 │                              │                          │
 ├─────────────────────────────>│                          │
 │  1. Request Access (/join)    │                          │
 │                              │                          │
 │                              ├─────────────────────────>│
 │                              │  Stores request          │
 │                              │<─────────────────────────┤
 │                              │                          │
 │                              ├── 2. Check Dashboard     │
 │                              │    (sees blue card)      │
 │                              │                          │
 │                              ├─────────────────────────>│
 │                              │  3. Click "Approve"      │
 │                              │<─────────────────────────┤
 │                              │  Generates token + link  │
 │                              │                          │
 │  4. Receives setup link <─────────────────────────────┤│
 │     (copy & paste)           │                          │
 │                              │                          │
 ├─────────────────────────────>│                          │
 │  5. Click link, set password │                          │
 │     (/set-password)          │     ┌────────────────────┤
 │                              │     │  Creates user
 │                              │     │  Clears token
 │                              │<────┘
 │                              │
 ├─────────────────────────────>│                          │
 │  6. Login (/login)           │                          │
 │     email + password         │     ┌────────────────────┤
 │                              │     │  Verifies
 │                              │     │  Sets session
 │<─────────────────────────────────┤  cookie
 │  ✅ Logged in                    │
 │     (dashboard access)       │
```

---

## Next Steps

1. **User requests** at `/join`
2. **You approve** on dashboard `/admin`
3. **You send link** to user (copy from blue box)
4. **User sets password** via link
5. **User logs in** at `/login`
6. ✅ **Done!**
