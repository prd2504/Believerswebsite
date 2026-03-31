import { motion } from 'motion/react';
import { Instagram, Mail, Phone, MapPin, Settings } from 'lucide-react';
import logo from 'figma:asset/14135a1b3ed9da99b316b01709d28ffba1d165b2.png';

interface FooterProps {
  onAdminClick?: () => void;
}

export function Footer({ onAdminClick }: FooterProps) {
  const currentYear = new Date().getFullYear();

  const goToAdmin = () => {
    if (onAdminClick) {
      onAdminClick();
    }
  };

  const quickLinks = [
    { name: 'About Us', href: '#about' },
    { name: 'Events', href: '#events' },
    { name: 'Our Centres', href: '#centres' },
    { name: 'Coaching Staff', href: '#coaches' },
    { name: 'Contact Us', href: '#contact' },
  ];

  const socialLinks = [
    { icon: Instagram, href: 'https://www.instagram.com/believers_badminton_academy/', label: 'Instagram' },
  ];

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-black border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Column 1: Logo & Description */}
          <div className="lg:col-span-2">
            <img src={logo} alt="Believers Badminton Academy" className="h-12 w-auto mb-4" />
            <p className="text-white/60 mb-6 max-w-md">
              India's premier badminton academy dedicated to nurturing champions and fostering a
              love for the sport through expert coaching and world-class facilities.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social, index) => (
                <motion.a
                  key={index}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/50 rounded-lg flex items-center justify-center transition-all duration-300 group"
                  aria-label={social.label}
                >
                  <social.icon size={20} className="text-white/70 group-hover:text-primary transition-colors" />
                </motion.a>
              ))}
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-white mb-4">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <button
                    onClick={() => scrollToSection(link.href)}
                    className="text-white/60 hover:text-primary transition-colors text-left"
                  >
                    {link.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact Info */}
          <div>
            <h3 className="text-white mb-4">Contact</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-white/60">
                <Phone size={18} className="flex-shrink-0 mt-1 text-primary" />
                <span className="text-sm">+91 90221 02921</span>
              </li>
              <li className="flex items-start gap-3 text-white/60">
                <Mail size={18} className="flex-shrink-0 mt-1 text-primary" />
                <span className="text-sm">hello@believersbadmintonacademy.com</span>
              </li>
              <li className="flex items-start gap-3 text-white/60">
                <MapPin size={18} className="flex-shrink-0 mt-1 text-primary" />
                <span className="text-sm">5 Centres across Mumbai and South Mumbai</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-white/10">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-white/40 text-sm text-center md:text-left">
              © {currentYear} Believers Badminton Academy. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-white/40">
              <button className="hover:text-primary transition-colors">Privacy Policy</button>
              <button className="hover:text-primary transition-colors">Terms of Service</button>
              <button 
                onClick={goToAdmin}
                className="hover:text-primary transition-colors flex items-center gap-1"
                title="Access Admin Dashboard (Ctrl+Shift+A)"
              >
                <Settings size={14} />
                Admin
              </button>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
