import { useState, useEffect } from 'react';
import { X, Users, Calendar, MapPin, Loader2, CheckCircle, MessageCircle, Copy, Check, Upload, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from './ui/button';
import { toast } from 'sonner@2.0.3';
import { submitTournamentRegistration, getTournamentSlots } from '../utils/api';
import paymentQR from 'figma:asset/3bf2840552bf3f50a30712dcb212bb02cf071a6b.png';

interface TournamentRegistrationProps {
  isOpen: boolean;
  onClose: () => void;
}

const FORM_STORAGE_KEY = 'tournament_registration_form';

export function TournamentRegistration({ isOpen, onClose }: TournamentRegistrationProps) {
  const [formData, setFormData] = useState({
    playerName: '',
    email: '',
    phone: '',
    category: '',
    partnerName: '',
    emergencyContact: '',
  });
  const [paymentScreenshot, setPaymentScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [ticketId, setTicketId] = useState('');
  const [slots, setSlots] = useState({ mensDoubles: 16, mixedDoubles: 16 });
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<'phone' | 'upi' | null>(null);

  const WHATSAPP_GROUP_LINK = 'https://chat.whatsapp.com/F4fLnzqSshNECXdK20EXSO';
  const UPI_NUMBER = '9022102921';
  const UPI_ID = 'prdeshpande2504@oksbi';

  // Load saved form data from localStorage
  useEffect(() => {
    if (isOpen) {
      fetchSlots();
      const savedData = localStorage.getItem(FORM_STORAGE_KEY);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setFormData(parsed);
        } catch (error) {
          console.error('Error loading saved form data:', error);
        }
      }
    }
  }, [isOpen]);

  // Save form data to localStorage whenever it changes
  useEffect(() => {
    if (isOpen && !showSuccess) {
      localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify(formData));
    }
  }, [formData, isOpen, showSuccess]);

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const data = await getTournamentSlots();
      setSlots({
        mensDoubles: 16 - (data.mensDoublesCount || 0),
        mixedDoubles: 16 - (data.mixedDoublesCount || 0),
      });
    } catch (error) {
      console.error('Error fetching slots:', error);
      toast.error('Failed to load slot information');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.playerName || !formData.email || !formData.phone || !formData.category || !formData.partnerName || !formData.emergencyContact) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Check if category is full
    if (formData.category === 'mens_doubles' && slots.mensDoubles <= 0) {
      toast.error("Men's Doubles category is full!");
      return;
    }
    if (formData.category === 'mixed_doubles' && slots.mixedDoubles <= 0) {
      toast.error('Mixed Doubles category is full!');
      return;
    }

    // Check if payment screenshot is provided
    if (!paymentScreenshot) {
      toast.error('Please upload a payment screenshot');
      return;
    }

    setIsSubmitting(true);
    try {
      console.log('🚀 Submitting tournament registration...');
      const result = await submitTournamentRegistration(formData, paymentScreenshot);
      
      console.log('✅ Registration result:', result);
      
      if (result.success) {
        setTicketId(result.ticketId);
        setShowSuccess(true);
        toast.success('Registration successful! Check your email for confirmation.');
        
        // Clear localStorage after successful submission
        localStorage.removeItem(FORM_STORAGE_KEY);
        
        // Refresh slots
        await fetchSlots();
      } else {
        console.error('❌ Registration failed:', result);
        toast.error(result.error || 'Registration failed. Please try again.');
      }
    } catch (error: any) {
      console.error('❌ Registration error:', {
        message: error.message,
        error: error,
      });
      
      // Show more detailed error message
      const errorMessage = error.message || 'Failed to submit registration. Please try again.';
      toast.error(errorMessage, {
        duration: 5000, // Show for 5 seconds
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setPaymentScreenshot(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setScreenshotPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
    toast.success('Screenshot uploaded successfully!');
  };

  const handleWhatsAppRedirect = () => {
    window.open(WHATSAPP_GROUP_LINK, '_blank');
    handleClose();
  };

  const copyToClipboard = (text: string, field: 'phone' | 'upi') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success(`${field === 'phone' ? 'Phone number' : 'UPI ID'} copied!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleClose = () => {
    setFormData({
      playerName: '',
      email: '',
      phone: '',
      category: '',
      partnerName: '',
      emergencyContact: '',
    });
    setPaymentScreenshot(null);
    setScreenshotPreview(null);
    setShowSuccess(false);
    setTicketId('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-2xl bg-zinc-900 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>

          {!showSuccess ? (
            <div className="p-8">
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-3xl font-bold text-white mb-2">
                  Tournament Registration
                </h2>
                <div className="space-y-1 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    <span>31st Jan & 1st Feb 2026</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-orange-500" />
                    <span>Wadala Sports Club</span>
                  </div>
                </div>
              </div>

              {/* Available Slots */}
              {loading ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className={`p-4 rounded-lg border ${slots.mensDoubles > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-orange-500" />
                      <h3 className="font-semibold text-white text-sm">Men's Doubles OPEN</h3>
                    </div>
                    <p className={`text-2xl font-bold ${slots.mensDoubles > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                      {slots.mensDoubles > 0 ? `${slots.mensDoubles} Slots Left` : 'FULL'}
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg border ${slots.mixedDoubles > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-orange-500" />
                      <h3 className="font-semibold text-white text-sm">Mixed Doubles OPEN</h3>
                    </div>
                    <p className={`text-2xl font-bold ${slots.mixedDoubles > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                      {slots.mixedDoubles > 0 ? `${slots.mixedDoubles} Slots Left` : 'FULL'}
                    </p>
                  </div>
                </div>
              )}

              {/* Payment Details Section - FIRST */}
              <div className="bg-gradient-to-r from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-xl p-6 mb-6">
                <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                  <span className="text-2xl">💳</span>
                  Step 1: Complete Payment
                </h3>
                <p className="text-sm text-gray-300 mb-4">
                  Please make your payment first, then upload the screenshot below and complete the registration form.
                </p>
                
                <div className="bg-zinc-900 rounded-lg p-4 mb-4">
                  <div className="flex items-center justify-center mb-4">
                    <img src={paymentQR} alt="Payment QR Code" className="w-48 h-48 rounded-lg border-2 border-orange-500/30" />
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2 bg-zinc-800 p-3 rounded-lg">
                      <div className="flex-1">
                        <p className="text-xs text-gray-400 mb-1">UPI ID</p>
                        <p className="text-white font-mono text-sm">{UPI_ID}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(UPI_ID, 'upi')}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                      >
                        {copiedField === 'upi' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    
                    <div className="flex items-center justify-between gap-2 bg-zinc-800 p-3 rounded-lg">
                      <div className="flex-1">
                        <p className="text-xs text-gray-400 mb-1">Phone Number</p>
                        <p className="text-white font-mono text-sm">{UPI_NUMBER}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(UPI_NUMBER, 'phone')}
                        className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                      >
                        {copiedField === 'phone' ? (
                          <Check className="w-4 h-4 text-green-500" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                  <p className="text-xs text-orange-300 flex items-center gap-2">
                    <span>💡</span>
                    After payment, take a screenshot and upload it below
                  </p>
                </div>
              </div>

              {/* Registration Form - SECOND */}
              <h3 className="text-xl font-bold text-white mb-4">
                Step 2: Upload Payment Proof & Fill Details
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Payment Screenshot Upload - FIRST FIELD */}
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4">
                  <label className="block text-sm font-semibold text-orange-400 mb-2 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Payment Screenshot * (Required)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-orange-500 file:text-white hover:file:bg-orange-600 cursor-pointer"
                    required
                  />
                  {screenshotPreview && (
                    <div className="mt-3">
                      <p className="text-xs text-gray-400 mb-2">Preview:</p>
                      <img src={screenshotPreview} alt="Payment Screenshot Preview" className="w-full max-w-xs rounded-lg border border-zinc-700" />
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2">Max file size: 5MB. Supported formats: JPG, PNG, etc.</p>
                </div>

                {/* Player Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Player Name *
                  </label>
                  <input
                    type="text"
                    value={formData.playerName}
                    onChange={(e) => setFormData({ ...formData, playerName: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>

                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Category *
                  </label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:border-orange-500 transition-colors"
                    required
                  >
                    <option value="">Select a category</option>
                    {slots.mensDoubles > 0 && (
                      <option value="mens_doubles">Men's Doubles OPEN ({slots.mensDoubles} slots left)</option>
                    )}
                    {slots.mensDoubles <= 0 && (
                      <option value="mens_doubles" disabled>Men's Doubles OPEN (FULL)</option>
                    )}
                    {slots.mixedDoubles > 0 && (
                      <option value="mixed_doubles">Mixed Doubles OPEN ({slots.mixedDoubles} slots left)</option>
                    )}
                    {slots.mixedDoubles <= 0 && (
                      <option value="mixed_doubles" disabled>Mixed Doubles OPEN (FULL)</option>
                    )}
                  </select>
                </div>

                {/* Partner Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Partner Name *
                  </label>
                  <input
                    type="text"
                    value={formData.partnerName}
                    onChange={(e) => setFormData({ ...formData, partnerName: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="Enter your partner's name"
                    required
                  />
                </div>

                {/* Emergency Contact */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    Emergency Contact Number *
                  </label>
                  <input
                    type="tel"
                    value={formData.emergencyContact}
                    onChange={(e) => setFormData({ ...formData, emergencyContact: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  disabled={isSubmitting || (slots.mensDoubles <= 0 && slots.mixedDoubles <= 0)}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Register Now'
                  )}
                </Button>
              </form>
            </div>
          ) : (
            // Success Screen
            <div className="p-8 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', duration: 0.5 }}
                className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle className="w-10 h-10 text-green-500" />
              </motion.div>

              <h2 className="text-3xl font-bold text-white mb-2">
                Registration Successful!
              </h2>
              <p className="text-gray-400 mb-6">
                Your tournament registration has been confirmed.
              </p>

              <div className="bg-zinc-800 rounded-lg p-6 mb-6">
                <p className="text-sm text-gray-400 mb-2">Your Ticket ID</p>
                <p className="text-2xl font-bold text-orange-500 font-mono tracking-wider">
                  {ticketId}
                </p>
              </div>

              <div className="text-left bg-zinc-800 rounded-lg p-6 mb-6 space-y-2 text-sm">
                <p className="text-white font-semibold mb-3">📧 Confirmation Email Sent!</p>
                <p className="text-gray-400">
                  ✓ Check your email for your tournament ticket and details
                </p>
                <p className="text-gray-400">
                  ✓ A screenshot of your ticket would be fine on tournament day
                </p>
                <p className="text-gray-400">
                  ✓ Reporting time will be shared on WhatsApp group
                </p>
              </div>

              <Button
                onClick={handleWhatsAppRedirect}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
              >
                <MessageCircle className="w-5 h-5" />
                Join WhatsApp Group
              </Button>

              <Button
                onClick={handleClose}
                variant="outline"
                className="w-full border-zinc-700 hover:bg-zinc-800 text-white"
              >
                Close
              </Button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}