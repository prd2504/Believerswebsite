import { Hono } from 'npm:hono';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// ==================== FORM SUBMISSION ROUTES ====================

// Submit trial booking / contact form
app.post('/make-server-fd33611c/submit-trial', async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, phone, centre, message } = body;

    // Validate required fields
    if (!name || !email || !phone || !centre) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Store in KV store
    const timestamp = new Date().toISOString();
    const submissionId = `trial_${timestamp}_${Math.random().toString(36).substring(7)}`;
    
    await kv.set(submissionId, {
      type: 'trial_booking',
      name,
      email,
      phone,
      centre,
      message: message || '',
      submittedAt: timestamp,
    });

    // Send email notification
    await sendEmailNotification({
      type: 'Trial Booking',
      data: { name, email, phone, centre, message: message || 'N/A' },
      timestamp,
    });

    console.log(`Trial booking submitted: ${submissionId}`);
    return c.json({ success: true, id: submissionId });
  } catch (error) {
    console.error('Error submitting trial booking:', error);
    return c.json({ error: 'Failed to submit trial booking', details: error.message }, 500);
  }
});

// Submit tournament request
app.post('/make-server-fd33611c/submit-tournament', async (c) => {
  try {
    const body = await c.req.json();
    const { name, email, phone, description } = body;

    // Validate required fields
    if (!name || !email || !phone || !description) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Store in KV store
    const timestamp = new Date().toISOString();
    const submissionId = `tournament_${timestamp}_${Math.random().toString(36).substring(7)}`;
    
    await kv.set(submissionId, {
      type: 'tournament_request',
      name,
      email,
      phone,
      description,
      submittedAt: timestamp,
    });

    // Send email notification
    await sendEmailNotification({
      type: 'Tournament Request',
      data: { name, email, phone, description },
      timestamp,
    });

    console.log(`Tournament request submitted: ${submissionId}`);
    return c.json({ success: true, id: submissionId });
  } catch (error) {
    console.error('Error submitting tournament request:', error);
    return c.json({ error: 'Failed to submit tournament request', details: error.message }, 500);
  }
});

// ==================== TOURNAMENT REGISTRATION ROUTES ====================

// Get tournament slot availability
app.get('/make-server-fd33611c/tournament-slots', async (c) => {
  try {
    // Get all tournament registrations
    const registrations = await kv.getByPrefix('tournament_reg_');
    
    // Count by category
    const mensDoublesCount = registrations.filter(r => r.category === 'mens_doubles').length;
    const mixedDoublesCount = registrations.filter(r => r.category === 'mixed_doubles').length;
    
    return c.json({ 
      success: true,
      mensDoublesCount,
      mixedDoublesCount,
      mensDoublesAvailable: 16 - mensDoublesCount,
      mixedDoublesAvailable: 16 - mixedDoublesCount,
    });
  } catch (error) {
    console.error('Error fetching tournament slots:', error);
    return c.json({ error: 'Failed to fetch slots', details: error.message }, 500);
  }
});

// Submit tournament registration
app.post('/make-server-fd33611c/tournament-registration', async (c) => {
  try {
    console.log('📝 Tournament registration request received');
    
    // Parse multipart form data
    const formData = await c.req.formData();
    const playerName = formData.get('playerName') as string;
    const email = formData.get('email') as string;
    const phone = formData.get('phone') as string;
    const category = formData.get('category') as string;
    const partnerName = formData.get('partnerName') as string;
    const emergencyContact = formData.get('emergencyContact') as string;
    const paymentScreenshot = formData.get('paymentScreenshot') as File;

    console.log('📋 Form data received:', {
      playerName,
      email,
      phone,
      category,
      partnerName,
      emergencyContact,
      hasScreenshot: !!paymentScreenshot,
      screenshotName: paymentScreenshot?.name,
      screenshotSize: paymentScreenshot?.size,
      screenshotType: paymentScreenshot?.type,
    });

    // Validate required fields
    if (!playerName || !email || !phone || !category || !partnerName || !emergencyContact) {
      console.error('❌ Missing required fields');
      return c.json({ error: 'Missing required fields' }, 400);
    }

    if (!paymentScreenshot) {
      console.error('❌ Payment screenshot is missing');
      return c.json({ error: 'Payment screenshot is required' }, 400);
    }

    // Check slot availability
    console.log('🔍 Checking slot availability...');
    const registrations = await kv.getByPrefix('tournament_reg_');
    const categoryCount = registrations.filter(r => r.category === category).length;
    
    console.log(`📊 Current registrations for ${category}: ${categoryCount}/16`);
    
    if (categoryCount >= 16) {
      console.warn(`⚠️  Category ${category} is full`);
      return c.json({ error: 'This category is full. Please try another category.' }, 400);
    }

    // Generate ticket ID and registration ID
    const timestamp = new Date().toISOString();
    const ticketId = `BBA-${category === 'mens_doubles' ? 'MD' : 'MX'}-${(categoryCount + 1).toString().padStart(2, '0')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const registrationId = `tournament_reg_${timestamp}_${Math.random().toString(36).substring(7)}`;
    
    console.log(`🎫 Generated ticket ID: ${ticketId}`);
    
    // Sanitize filename - remove spaces and special characters
    const sanitizeFilename = (filename: string) => {
      // Get file extension
      const ext = filename.substring(filename.lastIndexOf('.'));
      const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
      
      // Replace spaces with underscores and remove special characters
      const sanitized = nameWithoutExt
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 50); // Limit length
      
      return `${sanitized}${ext}`;
    };
    
    // Upload payment screenshot to Supabase Storage
    console.log('📤 Uploading payment screenshot to Supabase Storage...');
    const bucketName = 'make-fd33611c-payment-screenshots';
    const sanitizedOriginalName = sanitizeFilename(paymentScreenshot.name);
    const screenshotFileName = `${ticketId}_${Date.now()}_${sanitizedOriginalName}`;
    
    console.log(`📁 Bucket: ${bucketName}, Filename: ${screenshotFileName}`);
    
    const fileBuffer = await paymentScreenshot.arrayBuffer();
    console.log(`💾 File buffer size: ${fileBuffer.byteLength} bytes`);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(screenshotFileName, fileBuffer, {
        contentType: paymentScreenshot.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('❌ Error uploading payment screenshot:', {
        message: uploadError.message,
        statusCode: uploadError.statusCode,
        error: uploadError,
      });
      return c.json({ 
        error: 'Failed to upload payment screenshot', 
        details: uploadError.message,
        statusCode: uploadError.statusCode 
      }, 500);
    }

    console.log(`✅ Payment screenshot uploaded successfully: ${screenshotFileName}`);
    
    // Store in KV store with payment screenshot URL
    console.log('💾 Saving registration to database...');
    await kv.set(registrationId, {
      type: 'tournament_registration',
      ticketId,
      playerName,
      email,
      phone,
      category,
      partnerName,
      emergencyContact,
      paymentScreenshotPath: screenshotFileName,
      registeredAt: timestamp,
      whatsappStatus: 'pending',
    });

    console.log('✅ Registration saved to database');

    // Send confirmation email with ticket
    console.log('📧 Sending confirmation email...');
    await sendTournamentConfirmationEmail({
      ticketId,
      playerName,
      email,
      category,
      partnerName,
      emergencyContact,
      timestamp,
    });

    console.log(`🎉 Tournament registration complete: ${ticketId}`);
    return c.json({ success: true, ticketId, registrationId });
  } catch (error) {
    console.error('❌ Error submitting tournament registration:', {
      message: error.message,
      stack: error.stack,
      error,
    });
    return c.json({ 
      error: 'Failed to submit registration', 
      details: error.message 
    }, 500);
  }
});

// ==================== STORAGE MANAGEMENT ROUTES ====================

// Initialize storage buckets (called on server startup)
export async function initializeStorage() {
  const buckets = [
    { name: 'make-fd33611c-coaches', public: true },
    { name: 'make-fd33611c-courts', public: true },
    { name: 'make-fd33611c-events', public: true },
    { name: 'make-fd33611c-payment-screenshots', public: false }, // Private bucket for payment screenshots
  ];

  for (const bucket of buckets) {
    try {
      const { data: existing } = await supabase.storage.listBuckets();
      const bucketExists = existing?.some(b => b.name === bucket.name);
      
      if (!bucketExists) {
        const { error } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: 52428800, // 50MB limit
        });
        
        // Ignore "already exists" errors (409 conflict)
        if (error && error.statusCode !== '409') {
          console.error(`Error creating bucket ${bucket.name}:`, error);
        } else if (!error) {
          console.log(`✅ Created storage bucket: ${bucket.name}`);
        } else {
          console.log(`✓ Bucket ${bucket.name} already exists (409)`);
        }
      } else {
        console.log(`✓ Bucket ${bucket.name} already exists`);
      }
    } catch (error) {
      // Silently ignore "already exists" errors
      if (error.statusCode === '409' || error.status === 409) {
        console.log(`✓ Bucket ${bucket.name} already exists (caught 409)`);
      } else {
        console.error(`Error initializing bucket ${bucket.name}:`, error);
      }
    }
  }
}

// Upload image to storage
app.post('/make-server-fd33611c/upload-image', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const bucketType = formData.get('bucketType') as string; // 'coaches', 'courts', or 'events'
    
    if (!file || !bucketType) {
      return c.json({ error: 'Missing file or bucket type' }, 400);
    }

    const bucketName = `make-fd33611c-${bucketType}`;
    const fileName = `${Date.now()}_${file.name}`;
    const fileBuffer = await file.arrayBuffer();

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error('Upload error:', error);
      return c.json({ error: 'Failed to upload image', details: error.message }, 500);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`Image uploaded: ${fileName} to ${bucketName}`);
    return c.json({ success: true, url: publicUrl, fileName });
  } catch (error) {
    console.error('Error uploading image:', error);
    return c.json({ error: 'Failed to upload image', details: error.message }, 500);
  }
});

// Get all images from a bucket
app.get('/make-server-fd33611c/images/:bucketType', async (c) => {
  try {
    const bucketType = c.req.param('bucketType');
    const bucketName = `make-fd33611c-${bucketType}`;

    const { data, error } = await supabase.storage
      .from(bucketName)
      .list();

    if (error) {
      console.error('List error:', error);
      return c.json({ error: 'Failed to list images', details: error.message }, 500);
    }

    // Get public URLs for all files
    const images = data.map(file => {
      const { data: { publicUrl } } = supabase.storage
        .from(bucketName)
        .getPublicUrl(file.name);
      return {
        name: file.name,
        url: publicUrl,
        createdAt: file.created_at,
      };
    });

    return c.json({ success: true, images });
  } catch (error) {
    console.error('Error listing images:', error);
    return c.json({ error: 'Failed to list images', details: error.message }, 500);
  }
});

// ==================== ADMIN ROUTES ====================

// Get all submissions (paginated)
app.get('/make-server-fd33611c/submissions', async (c) => {
  try {
    const type = c.req.query('type'); // 'trial_booking' or 'tournament_request' or undefined for all
    
    // Get all submissions with the type prefix
    const trialBookings = await kv.getByPrefix('trial_');
    const tournamentRequests = await kv.getByPrefix('tournament_');
    
    let allSubmissions = [...trialBookings, ...tournamentRequests];
    
    // Filter by type if specified
    if (type) {
      allSubmissions = allSubmissions.filter(sub => sub.type === type);
    }
    
    // Sort by date (newest first)
    allSubmissions.sort((a, b) => 
      new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
    );

    return c.json({ 
      success: true, 
      submissions: allSubmissions,
      count: allSubmissions.length 
    });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return c.json({ error: 'Failed to fetch submissions', details: error.message }, 500);
  }
});

// Get all tournament registrations
app.get('/make-server-fd33611c/tournament-registrations', async (c) => {
  try {
    // Get all tournament registrations
    const registrations = await kv.getByPrefix('tournament_reg_');
    
    // Sort by date (newest first)
    registrations.sort((a, b) => 
      new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime()
    );

    return c.json({ 
      success: true, 
      registrations,
      count: registrations.length 
    });
  } catch (error) {
    console.error('Error fetching tournament registrations:', error);
    return c.json({ error: 'Failed to fetch registrations', details: error.message }, 500);
  }
});

// Get signed URL for payment screenshot (private bucket)
app.get('/make-server-fd33611c/payment-screenshot/:filename', async (c) => {
  try {
    const filename = c.req.param('filename');
    
    if (!filename) {
      return c.json({ error: 'Filename is required' }, 400);
    }

    const bucketName = 'make-fd33611c-payment-screenshots';
    
    // Generate signed URL valid for 1 hour
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filename, 3600);

    if (error) {
      console.error('Error creating signed URL:', error);
      return c.json({ error: 'Failed to create signed URL', details: error.message }, 500);
    }

    return c.json({ success: true, signedUrl: data.signedUrl });
  } catch (error) {
    console.error('Error getting payment screenshot:', error);
    return c.json({ error: 'Failed to get screenshot', details: error.message }, 500);
  }
});

// ==================== EMAIL NOTIFICATION HELPER ====================

async function sendEmailNotification(params: {
  type: string;
  data: Record<string, string>;
  timestamp: string;
}) {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey || resendApiKey === '' || resendApiKey === 'undefined') {
      console.warn('⚠️  RESEND_API_KEY not configured properly. Email notifications disabled.');
      console.log('📧 Form submission received (email would be sent):', {
        type: params.type,
        timestamp: new Date(params.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        data: params.data
      });
      return;
    }

    // Format email body
    const dataString = Object.entries(params.data)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const emailBody = `
New ${params.type} Submission

Submitted at: ${new Date(params.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Details:
${dataString}

---
Believers Badminton Academy
`;

    // Send email via Resend API
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Believers Badminton Academy <hello@believersbadmintonacademy.com>',
        to: 'hello@believersbadmintonacademy.com',
        subject: `New ${params.type} - Believers Academy`,
        text: emailBody,
      }),
    });

    const responseData = await response.json();

    if (!response.ok) {
      console.error('❌ Email send failed:', {
        status: response.status,
        error: responseData
      });
      
      if (responseData.statusCode === 401 || responseData.name === 'validation_error') {
        console.warn('⚠️  Resend API key is invalid. Please update RESEND_API_KEY in Supabase secrets.');
        console.log('📧 Form submission saved to database (email not sent)');
      }
    } else {
      console.log(`✅ Email notification sent successfully for ${params.type}`);
      console.log(`📧 Email ID: ${responseData.id}`);
    }
  } catch (error) {
    console.error('Error sending email notification:', error);
    console.log('📧 Form submission saved to database (email error occurred)');
  }
}

async function sendTournamentConfirmationEmail(params: {
  ticketId: string;
  playerName: string;
  email: string;
  category: string;
  partnerName: string;
  emergencyContact: string;
  timestamp: string;
}) {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    
    if (!resendApiKey || resendApiKey === '' || resendApiKey === 'undefined') {
      console.warn('⚠️  RESEND_API_KEY not configured properly. Email notifications disabled.');
      console.log('📧 Tournament registration received (email would be sent):', {
        timestamp: new Date(params.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        data: params
      });
      return;
    }

    const categoryName = params.category === 'mens_doubles' ? "Men's Doubles OPEN" : "Mixed Doubles OPEN";

    // Format email body for participant
    const participantEmailBody = `\n🏸 Tournament Registration Confirmed! 🏸\n\nDear ${params.playerName},\n\nThank you for registering for the Believers Badminton Academy Tournament!\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nYOUR TOURNAMENT TICKET\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nTicket ID: ${params.ticketId}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nREGISTRATION DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nPlayer Name: ${params.playerName}\nPartner Name: ${params.partnerName}\nCategory: ${categoryName}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nTOURNAMENT DETAILS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📅 Date: 31st January & 1st February 2026\n📍 Venue: Wadala Sports Club\n⏰ Reporting Time: Will be shared on WhatsApp group\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nIMPORTANT INSTRUCTIONS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n✓ A screenshot of this ticket would be fine on tournament day\n✓ Arrive at least 30 minutes before reporting time\n✓ Carry your own shuttles for warm-up\n✓ Bring valid ID proof\n✓ Emergency contact: ${params.emergencyContact}\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📱 JOIN WHATSAPP GROUP\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nReporting time and all tournament updates will be shared on our WhatsApp group.\nKindly join if you haven't already:\n\n🔗 https://chat.whatsapp.com/F4fLnzqSshNECXdK20EXSO\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nFor any queries, please contact:\n📧 hello@believersbadmintonacademy.com\n\nSee you on court! 🏆\n\nBest regards,\nBelievers Badminton Academy\n`;

    // Send email to participant
    const participantResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Believers Badminton Academy <hello@believersbadmintonacademy.com>',
        to: params.email,
        subject: `🏸 Tournament Registration Confirmed - ${params.ticketId}`,
        text: participantEmailBody,
      }),
    });

    const participantData = await participantResponse.json();

    if (!participantResponse.ok) {
      console.error('❌ Participant email send failed:', participantData);
    } else {
      console.log(`✅ Confirmation email sent to participant: ${params.email}`);
    }

    // Also send notification to admin
    const adminEmailBody = `
New Tournament Registration Received

Ticket ID: ${params.ticketId}
Registered at: ${new Date(params.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Player Details:
- Name: ${params.playerName}
- Email: ${params.email}
- Partner: ${params.partnerName}
- Category: ${categoryName}
- Emergency Contact: ${params.emergencyContact}

---
Believers Badminton Academy
`;

    const adminResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Believers Badminton Academy <hello@believersbadmintonacademy.com>',
        to: 'hello@believersbadmintonacademy.com',
        subject: `New Tournament Registration - ${params.ticketId}`,
        text: adminEmailBody,
      }),
    });

    const adminData = await adminResponse.json();

    if (!adminResponse.ok) {
      console.error('❌ Admin notification email failed:', adminData);
    } else {
      console.log(`✅ Admin notification sent for registration: ${params.ticketId}`);
    }
  } catch (error) {
    console.error('Error sending tournament confirmation emails:', error);
    console.log('📧 Tournament registration saved to database (email error occurred)');
  }
}

export default app;