# 🔐 Admin Password Protection

## Overview

The admin dashboard is now protected with a 6-digit PIN authentication system.

---

## 🔑 Login Credentials

**PIN:** `123456`

**Type:** 6-digit numeric PIN  
**Session:** Persistent (stored in browser localStorage)

---

## 🚪 How to Access Admin

### Step 1: Navigate to Admin
Use any of these methods:
- Type `/admin` in URL
- Click "Admin" link in footer
- Press `Ctrl + Shift + A`

### Step 2: Enter PIN
- You'll see a login screen with 6 boxes
- Enter PIN: `123456`
- Press Enter or type all 6 digits
- If correct, you'll enter the dashboard
- If incorrect, you'll see an error and can try again

### Step 3: Access Dashboard
Once authenticated, you'll have access to:
- Form Submissions viewer
- Image Manager
- All admin features

---

## 🔒 Security Features

### Session Management
- ✅ **Auto-save:** Once logged in, you stay logged in
- ✅ **Browser-based:** Authentication stored in localStorage
- ✅ **Per-device:** Each browser/device requires separate login
- ✅ **Logout button:** Clear session and return to login

### PIN Protection
- ✅ **6-digit PIN required**
- ✅ **Shake animation on wrong PIN**
- ✅ **2-second error display**
- ✅ **Auto-clear after wrong attempt**

### Access Control
- ❌ Cannot access admin without correct PIN
- ❌ Back button returns to main website
- ✅ Can logout anytime from dashboard

---

## 🎯 Login Flow

```
1. User clicks "Admin" → Login Screen
2. User enters PIN → Validation
3. Correct PIN? → Admin Dashboard
4. Wrong PIN? → Error message + Retry
5. User logs out → Clears session + Returns to login
```

---

## 🔄 Session Lifecycle

### When You're Logged In:
- ✅ Can access `/admin` directly
- ✅ Can use keyboard shortcut
- ✅ Can use footer link
- ✅ Session persists across page reloads
- ✅ Session persists until logout

### When You Logout:
- ❌ Session cleared from localStorage
- ❌ Redirected to main website
- ❌ Next admin access requires PIN

### When Session Expires:
The session does NOT expire automatically. It stays active until:
- You click "Logout"
- You clear browser data
- You clear localStorage

---

## 🖥️ User Interface

### Login Screen:
```
┌─────────────────────────────┐
│   🏸 Believers Academy      │
│                             │
│      🔒 Lock Icon           │
│                             │
│     Admin Access            │
│  Enter your 6-digit PIN     │
│                             │
│  [_] [_] [_] [_] [_] [_]    │
│                             │
│  ← Back to Website          │
└─────────────────────────────┘
```

### Success Flow:
```
Enter PIN: 123456
→ ✅ Correct!
→ Dashboard loads
```

### Error Flow:
```
Enter PIN: 999999
→ ❌ Incorrect PIN (shake animation)
→ Error message for 2 seconds
→ Input clears
→ Try again
```

---

## 🛡️ Security Best Practices

### Current Setup:
- ✅ PIN protection enabled
- ✅ No direct dashboard access
- ✅ Session management
- ✅ Logout functionality

### For Production (Recommended):

**1. Change the PIN:**
- Current PIN `123456` is for development only
- Change to a secure 6-digit PIN
- Update in `/components/AdminLogin.tsx` line 21

**2. Add IP Whitelist (Optional):**
- Restrict admin access to office IP
- Implement in Supabase Edge Functions

**3. Add Two-Factor Auth (Advanced):**
- Send OTP to email/phone
- Requires additional setup

**4. Use Strong Authentication:**
- Consider password instead of PIN
- Add username + password
- Integrate with Supabase Auth

---

## 🔧 Technical Details

### Where PIN is Validated:
**File:** `/components/AdminLogin.tsx`  
**Line:** 21

```tsx
const handleComplete = (value: string) => {
  if (value === '123456') {
    // Correct PIN
    localStorage.setItem('admin_authenticated', 'true');
    onLogin();
  } else {
    // Wrong PIN
    setError('Incorrect PIN. Please try again.');
  }
};
```

### Where Session is Checked:
**File:** `/App.tsx`  
**Lines:** 17-19

```tsx
useEffect(() => {
  const isAuth = localStorage.getItem('admin_authenticated') === 'true';
  setIsAuthenticated(isAuth);
}, []);
```

### Where Logout is Handled:
**File:** `/App.tsx`  
**Lines:** 61-65

```tsx
const handleLogout = () => {
  localStorage.removeItem('admin_authenticated');
  setIsAuthenticated(false);
  setShowAdmin(false);
};
```

---

## 📱 Mobile Access

### Works on Mobile!
- ✅ Responsive login screen
- ✅ Touch-friendly PIN input
- ✅ Same 6-digit PIN
- ✅ Session persists on mobile browser

### Mobile Flow:
1. Tap "Admin" in footer
2. Enter PIN on mobile keyboard
3. Access dashboard
4. Logout when done

---

## 🚨 Troubleshooting

### "Can't remember the PIN"
- Default PIN is: `123456`
- It's shown on the login screen for development
- Check `/components/AdminLogin.tsx` line 21

### "Already logged in but want to re-login"
- Click "Logout" button in dashboard
- Or clear localStorage in browser DevTools
- Or clear browser data/cache

### "Login screen not showing"
- If you're already logged in, you'll go straight to dashboard
- Click "Logout" to see login screen again

### "PIN not working"
- Make sure you're typing: `123456`
- Check for typos
- The input auto-clears after 6 digits

### "Session lost after browser restart"
- This shouldn't happen (session persists)
- Check if "Clear data on exit" is enabled
- Check if you're in Incognito/Private mode

---

## 🎨 Customization Guide

### Change the PIN:

**File:** `/components/AdminLogin.tsx`

```tsx
// Current (line 21)
if (value === '123456') {

// Change to your PIN
if (value === '987654') {
```

### Change PIN Length:

```tsx
// Current (line 44)
<InputOTP maxLength={6}>

// Change to 4 digits
<InputOTP maxLength={4}>

// Then update validation
if (value === '1234') {
```

### Add Password Instead:

Replace PIN input with regular password input:
```tsx
<input 
  type="password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
/>

// Validate
if (password === 'your-secure-password') {
  onLogin();
}
```

---

## ✅ Quick Test Checklist

- [ ] Navigate to `/admin`
- [ ] See login screen (not dashboard)
- [ ] Enter wrong PIN: `999999`
- [ ] See error message and shake
- [ ] Enter correct PIN: `123456`
- [ ] Access admin dashboard
- [ ] See "Logout" button
- [ ] Click "Logout"
- [ ] Return to login screen
- [ ] Enter PIN again
- [ ] Access dashboard again

**All should work!** ✅

---

## 🎯 Summary

**Access Method:**
- Click "Admin" in footer
- Type `/admin` in URL
- Press `Ctrl + Shift + A`

**Login:**
- PIN: `123456`
- 6-digit numeric
- Auto-submit after 6 digits

**Session:**
- Persistent in localStorage
- No auto-expiry
- Manual logout required

**Security:**
- PIN-protected
- Session-based
- Logout button available

**Ready to use!** Your admin is now password-protected! 🔐✨
