# 🏸 Believers Badminton Academy - Setup Complete! 

## ✅ What's Already Set Up

Your website now has **complete backend integration** with:
- ✅ Supabase database for storing form submissions
- ✅ Email notifications via Resend
- ✅ Image storage for coaches, courts, and events
- ✅ Admin dashboard to view all submissions
- ✅ Image manager to upload photos/videos

---

## 🎯 How to Use Everything

### 1️⃣ **Test Your Contact Forms**

**Try it now:**
1. Go to your website
2. Fill out the **"Start Your Journey Today"** contact form at the bottom
3. Or click **"Plan Your Tournament"** button in the Events section
4. Submit the form

**What happens:**
- ✅ Form data is saved to Supabase database
- ✅ You receive an email at `hello@believersbadmintonacademy.com`
- ✅ User sees success confirmation

---

### 2️⃣ **Access Your Admin Dashboard**

**To view all form submissions:**

Simply navigate to: **`/admin`**

Or append `/admin` to your website URL

**What you can do:**
- 📋 View all trial booking submissions
- 🏆 View all tournament requests
- 📧 See contact details (name, email, phone)
- 📅 See submission timestamps
- 🔄 Refresh to see new submissions in real-time

---

### 3️⃣ **Upload & Manage Images**

**From the Admin Dashboard:**
1. Go to `/admin`
2. Click the **"Image Manager"** tab
3. Choose a category:
   - **Coaches** - Upload coach photos
   - **Courts** - Upload court/facility photos
   - **Events** - Upload event photos/videos

**How to use uploaded images:**
1. Upload your image
2. Click **"Copy URL"** 
3. Use the URL in your code or share it

**Example:**
```tsx
<img src="https://your-uploaded-image-url.jpg" alt="Coach Name" />
```

---

## 📧 Email Notifications

**Every form submission sends an email with:**
```
New Trial Booking Submission

Submitted at: Oct 19, 2025, 2:30 PM IST

Details:
name: John Doe
email: john@example.com
phone: +91 98765 43210
centre: Dadar Railway Colony
message: Interested in advanced coaching

---
Believers Badminton Academy
```

**Email is sent to:** `prdeshpande2504@gmail.com`

**Note:** Resend's free tier only allows sending to your verified email address. To send to other emails (like `hello@believersbadmintonacademy.com`), you need to verify a domain at [resend.com/domains](https://resend.com/domains). See `EMAIL_SETUP_INFO.md` for details.

---

## 🔧 Technical Details

### API Endpoints Available:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/submit-trial` | POST | Submit trial booking form |
| `/submit-tournament` | POST | Submit tournament request |
| `/upload-image` | POST | Upload image/video |
| `/images/:bucketType` | GET | Get all images from bucket |
| `/submissions` | GET | Get all form submissions |

### Storage Buckets:
- `make-fd33611c-coaches` - Coach photos
- `make-fd33611c-courts` - Court/facility photos
- `make-fd33611c-events` - Event media

### Form Data Stored:
All submissions are saved in Supabase KV store with keys like:
- `trial_2025-10-19T14:30:00_abc123`
- `tournament_2025-10-19T15:45:00_xyz789`

---

## 🚀 Next Steps

### Immediate Actions:
1. ✅ Test the contact form → Check your email
2. ✅ Test the tournament modal → Check your email
3. ✅ Visit `/admin` to see submissions
4. ✅ Upload some test images in Image Manager

### Future Enhancements:
- 📱 Add WhatsApp notifications (requires Twilio)
- 🎨 Customize email templates
- 📊 Add analytics dashboard
- 👥 Add user authentication for admin
- 📱 Create mobile app

---

## 🆘 Troubleshooting

**Not receiving emails?**
- Check spam folder
- Verify RESEND_API_KEY is set correctly
- Check server logs in Supabase Edge Functions

**Form not submitting?**
- Open browser console (F12) for error messages
- Check network tab for API call failures
- Verify Supabase is running

**Images not uploading?**
- Max file size is 50MB
- Only images and videos are allowed
- Check browser console for errors

---

## 📞 Support

If you need help:
1. Check browser console (F12) for errors
2. Check Supabase Edge Function logs
3. Review the email notifications for clues

---

## 🎉 You're All Set!

Everything is configured and ready to use. Start testing your forms and admin dashboard!

**Quick Links:**
- 🌐 Main Website: `/`
- 🔐 Admin Dashboard: `/admin`
- 📧 Notification Email: `hello@believersbadmintonacademy.com`

---

Built with ❤️ using:
- React + TypeScript
- Tailwind CSS
- Supabase (Database + Storage)
- Resend (Email Notifications)
- Hono (Backend API)
