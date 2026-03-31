import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Trophy, Send, CheckCircle } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { submitTournamentRequest } from '../utils/api';

interface TournamentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TournamentModal({ open, onOpenChange }: TournamentModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    description: '',
  });
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await submitTournamentRequest(formData);
      setIsSubmitted(true);
      toast.success('Tournament inquiry submitted! We\'ll contact you within 24 hours. 🏆');
      
      // Reset after showing success state
      setTimeout(() => {
        setFormData({ name: '', email: '', phone: '', description: '' });
        setIsSubmitted(false);
        onOpenChange(false);
      }, 2000);
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error('Failed to submit inquiry. Please try again or call us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-gradient-to-br from-card to-secondary border-white/20">
        {!isSubmitted ? (
          <>
            <DialogHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <Trophy className="text-primary" size={32} />
                </div>
              </div>
              <DialogTitle className="text-center text-2xl text-white">
                You're at the Right Place!
              </DialogTitle>
              <DialogDescription className="text-center text-white/70">
                We specialize in organizing world-class badminton tournaments. Tell us about your
                event, and we'll make it extraordinary.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-6 mt-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="modal-name" className="text-white mb-2 block">
                    Full Name *
                  </Label>
                  <Input
                    id="modal-name"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Enter your name"
                    className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="modal-email" className="text-white mb-2 block">
                      Email Address *
                    </Label>
                    <Input
                      id="modal-email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="your@email.com"
                      className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary"
                    />
                  </div>
                  <div>
                    <Label htmlFor="modal-phone" className="text-white mb-2 block">
                      Phone Number *
                    </Label>
                    <Input
                      id="modal-phone"
                      type="tel"
                      required
                      value={formData.phone}
                      onChange={(e) => handleChange('phone', e.target.value)}
                      placeholder="+91 98765 43210"
                      className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="modal-description" className="text-white mb-2 block">
                    Describe Your Tournament *
                  </Label>
                  <Textarea
                    id="modal-description"
                    required
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    placeholder="Tell us about your tournament: Expected participants, venue, date preferences, special requirements, etc."
                    rows={5}
                    className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white group disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Inquiry'}
                  <Send className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="py-12 text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center">
                <CheckCircle className="text-green-500" size={48} />
              </div>
            </div>
            <h3 className="text-white text-2xl mb-3">Inquiry Submitted!</h3>
            <p className="text-white/70">
              Thank you for your interest. Our events team will contact you within 24 hours.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
