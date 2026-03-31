import { motion } from 'motion/react';
import { useInView } from 'motion/react';
import { useRef, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MapPin, Phone, Mail, Send } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { submitTrialBooking } from '../utils/api';

export function ContactForm() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    centre: '',
    message: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await submitTrialBooking(formData);
      toast.success('Thank you! We will contact you soon. 🎉');
      setFormData({ name: '', email: '', phone: '', centre: '', message: '' });
    } catch (error) {
      console.error('Form submission error:', error);
      toast.error('Failed to submit form. Please try again or call us directly.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const contactInfo = [
    {
      icon: MapPin,
      title: 'Visit Us',
      content: 'Multiple locations across Mumbai & South Mumbai',
      link: '#centres',
    },
    {
      icon: Phone,
      title: 'Call Us',
      content: '+91 90221 02921',
      link: 'tel:+919022102921',
    },
    {
      icon: Mail,
      title: 'Email Us',
      content: 'hello@believersbadmintonacademy.com',
      link: 'mailto:hello@believersbadmintonacademy.com',
    },
  ];

  return (
    <section id="contact" ref={ref} className="py-24 bg-gradient-to-b from-[#0a0a0a] to-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl text-white mb-4 px-4">
            Start Your <span className="text-primary">Journey Today</span>
          </h2>
          <p className="text-white/70 text-lg max-w-2xl mx-auto">
            Ready to take your badminton skills to the next level? Get in touch with us and book
            your free trial session.
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Left: Contact Info */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="space-y-8"
          >
            <div>
              <h3 className="text-white text-xl sm:text-2xl mb-6">Get In Touch</h3>
              <p className="text-white/70 mb-8">
                Have questions? We're here to help. Reach out to us through any of the channels
                below or fill out the contact form.
              </p>
            </div>

            <div className="space-y-6">
              {contactInfo.map((info, index) => (
                <motion.a
                  key={index}
                  href={info.link}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                  className="flex items-start gap-4 p-4 bg-gradient-to-br from-card to-secondary border border-white/10 rounded-xl hover:border-primary/50 transition-all duration-300 group"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    <info.icon className="text-primary" size={24} />
                  </div>
                  <div>
                    <h4 className="text-white mb-1">{info.title}</h4>
                    <p className="text-white/70 text-sm">{info.content}</p>
                  </div>
                </motion.a>
              ))}
            </div>

            {/* Social Proof */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-6"
            >
              <p className="text-white/90 mb-2">
                "Best badminton academy in Mumbai! The coaches are exceptional and the
                facilities are top-notch."
              </p>
              <p className="text-white/60 text-sm">— Anay P., State Champion</p>
            </motion.div>
          </motion.div>

          {/* Right: Contact Form */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <form
              onSubmit={handleSubmit}
              className="bg-gradient-to-br from-card to-secondary border border-white/10 rounded-2xl p-8"
            >
              <div className="space-y-6">
                <div>
                  <Label htmlFor="name" className="text-white mb-2 block">
                    Full Name *
                  </Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    placeholder="Enter your name"
                    className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary"
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email" className="text-white mb-2 block">
                      Email *
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => handleChange('email', e.target.value)}
                      placeholder="your@email.com"
                      className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary"
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone" className="text-white mb-2 block">
                      Phone *
                    </Label>
                    <Input
                      id="phone"
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
                  <Label htmlFor="centre" className="text-white mb-2 block">
                    Preferred Centre *
                  </Label>
                  <Select value={formData.centre} onValueChange={(value) => handleChange('centre', value)}>
                    <SelectTrigger className="bg-input-background border-white/10 text-white focus:border-primary">
                      <SelectValue placeholder="Select a centre" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dadar-railway">Dadar Railway Colony</SelectItem>
                      <SelectItem value="dadar-parsee">Dadar Parsee Colony Gymkhana</SelectItem>
                      <SelectItem value="kalidas">Kalidas Sport Complex</SelectItem>
                      <SelectItem value="nirmal">Nirmal Park</SelectItem>
                      <SelectItem value="salsette">Salsette</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="message" className="text-white mb-2 block">
                    Message
                  </Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => handleChange('message', e.target.value)}
                    placeholder="Tell us about your badminton experience and goals..."
                    rows={4}
                    className="bg-input-background border-white/10 text-white placeholder:text-white/40 focus:border-primary resize-none"
                  />
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-primary hover:bg-primary/90 text-white py-6 group disabled:opacity-50"
                  size="lg"
                >
                  {isSubmitting ? 'Sending...' : 'Send Message'}
                  <Send className="ml-2 group-hover:translate-x-1 transition-transform" size={20} />
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
