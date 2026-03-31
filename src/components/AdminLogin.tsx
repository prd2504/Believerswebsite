import { useState } from 'react';
import { Lock, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import { Button } from './ui/button';
import { InputOTP, InputOTPGroup, InputOTPSlot } from './ui/input-otp';
import logo from 'figma:asset/14135a1b3ed9da99b316b01709d28ffba1d165b2.png';

interface AdminLoginProps {
  onLogin: () => void;
  onBack: () => void;
}

export function AdminLogin({ onLogin, onBack }: AdminLoginProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);

  const handleComplete = (value: string) => {
    if (value === '123456') {
      // Correct PIN
      localStorage.setItem('admin_authenticated', 'true');
      onLogin();
    } else {
      // Wrong PIN
      setError('Incorrect PIN. Please try again.');
      setIsShaking(true);
      setPin('');
      setTimeout(() => {
        setIsShaking(false);
        setError('');
      }, 2000);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
      >
        {/* Back Button */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-8 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span>Back to Website</span>
        </button>

        {/* Login Card */}
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img src={logo} alt="Believers Academy" className="h-12 w-auto" />
          </div>

          {/* Lock Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center border border-primary/30">
              <Lock size={28} className="text-primary" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-white text-center mb-2">Admin Access</h2>
          <p className="text-white/60 text-center text-sm mb-8">
            Enter your 6-digit PIN to continue
          </p>

          {/* PIN Input */}
          <motion.div
            animate={isShaking ? { x: [-10, 10, -10, 10, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="flex justify-center mb-6"
          >
            <InputOTP
              maxLength={6}
              value={pin}
              onChange={setPin}
              onComplete={handleComplete}
              autoFocus
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} className="bg-white/5 border-white/20 text-white" />
                <InputOTPSlot index={1} className="bg-white/5 border-white/20 text-white" />
                <InputOTPSlot index={2} className="bg-white/5 border-white/20 text-white" />
                <InputOTPSlot index={3} className="bg-white/5 border-white/20 text-white" />
                <InputOTPSlot index={4} className="bg-white/5 border-white/20 text-white" />
                <InputOTPSlot index={5} className="bg-white/5 border-white/20 text-white" />
              </InputOTPGroup>
            </InputOTP>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-center text-sm mb-4"
            >
              {error}
            </motion.p>
          )}

          {/* Instructions */}
          <div className="text-white/40 text-xs text-center space-y-1">
            <p>Enter PIN (ADMIN ONLY) </p>
            
          </div>
        </div>

        {/* Additional Info */}
        <p className="text-white/30 text-xs text-center mt-6">
          Your session will remain active until you log out or clear browser data
        </p>
      </motion.div>
    </div>
  );
}
