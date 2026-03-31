# 📧 Setting Up Resend Email Notifications

## ⚠️ Current Status

Your API key was entered in Figma Make, but it needs to be configured in **Supabase directly** to work with the Edge Functions.

---

## 🔧 How to Fix the Email Notifications

### Step 1: Go to Supabase Dashboard

1. Open your Supabase project dashboard
2. Go to: **Settings** → **Edge Functions**
3. Click on **"Secrets"** or **"Environment Variables"**

### Step 2: Add RESEND_API_KEY Secret

1. Click **"Add Secret"** or **"New Secret"**
2. **Name:** `RESEND_API_KEY`
3. **Value:** `re_2myYxvFh_DVfMqvBGDwujxj3dBxkNW8zK`
4. Click **"Save"**

### Step 3: Redeploy Edge Functions

After adding the secret, you need to redeploy your Edge Functions:

**Option A - Via Supabase Dashboard:**
1. Go to **Edge Functions** in your Supabase dashboard
2. Find the `make-server-fd33611c` function
3. Click **"Redeploy"** or **"Restart"**

**Option B - They Auto-Redeploy:**
- Edge Functions typically redeploy automatically when secrets are added
- Wait 30-60 seconds and test again

---

## ✅ Testing After Setup

### Test Your Email Notifications:

1. **Submit a form** on your website (contact form or tournament modal)
2. **Check the Supabase logs** to see:
   - ✅ `Email notification sent successfully for Trial Booking`
   - ✅ `Email ID: re_xxx...`
3. **Check your email** at `hello@believersbadmintonacademy.com`

### If Still Not Working:

**Check Supabase Edge Function Logs:**
1. Go to **Edge Functions** → **Logs**
2. Look for any error messages
3. You should see: `✅ Email notification sent successfully`

**Verify the API Key:**
1. Go to [resend.com/api-keys](https://resend.com/api-keys)
2. Check if your API key is active
3. If expired, generate a new one and update in Supabase

---

## 🎯 What's Working Right Now (Without Email)

Even without email configured, everything else works perfectly:

✅ **Forms submit successfully**  
✅ **Data is saved to database**  
✅ **Admin dashboard shows all submissions**  
✅ **Image uploads work**  

The only thing missing is the email notification to your inbox!

---

## 📧 Email Address Configuration

**Current Setup (FREE TIER):**
- Emails are sent to: `prdeshpande2504@gmail.com`
- This is required for Resend's free tier
- You can only send to the email you signed up with

**To Send to Different Email Addresses:**

You need to verify a custom domain with Resend:

1. Go to [resend.com/domains](https://resend.com/domains)
2. Click **"Add Domain"**
3. Enter your domain (e.g., `believersbadmintonacademy.com`)
4. Follow DNS verification steps
5. Once verified, update the code:
   ```typescript
   from: 'Believers Academy <notifications@believersbadmintonacademy.com>',
   to: 'hello@believersbadmintonacademy.com', // Now you can use any email!
   ```

**For now:** All notifications go to your Gmail (prdeshpande2504@gmail.com) ✅

---

## 🔐 Important Security Notes

- Never commit your API key to Git
- Keep your RESEND_API_KEY secret
- Only add it in Supabase dashboard (Environment Variables)
- Don't expose it in frontend code

---

## 🆘 Still Having Issues?

### Common Problems:

**"API key is invalid"**
- ✅ Fixed! The app now handles this gracefully
- Add the key in Supabase Secrets (see Step 2 above)

**"Bucket already exists"**
- ✅ Fixed! The app now ignores this error
- Your storage buckets are working fine

**Email not arriving:**
- Check spam folder
- Verify Resend API key is active
- Check Supabase Edge Function logs
- Resend free tier: 100 emails/day, 3000/month

---

## 💡 Pro Tips

### Want to customize the email?

Edit the `sendEmailNotification` function in `/supabase/functions/server/routes.tsx`:

```typescript
const emailBody = `
🏸 New ${params.type} Submission

Submitted: ${new Date(params.timestamp).toLocaleString('en-IN')}

Details:
${dataString}

Reply to this person at: ${params.data.email}

---
Believers Badminton Academy
Powered by Figma Make
`;
```

### Want HTML emails instead of plain text?

Change `text: emailBody` to `html: emailBody` and use HTML formatting!

---

## ✨ You're Almost There!

Just add the RESEND_API_KEY to Supabase Secrets and you'll receive email notifications for every form submission! 🚀
