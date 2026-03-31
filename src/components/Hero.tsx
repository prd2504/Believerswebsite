import { motion } from 'motion/react';
import { Button } from './ui/button';
import { ArrowRight, Play, Trophy } from 'lucide-react';
import { useState } from 'react';
import { TournamentRegistration } from './TournamentRegistration';

export function Hero() {
  const [isTournamentModalOpen, setIsTournamentModalOpen] = useState(false);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/50 to-black z-10" />
        <img
          src="https://images.unsplash.com/photo-1613918431551-b2ef2720387c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBwbGF5ZXIlMjBhY3Rpb258ZW58MXx8fHwxNzYwMTc0NTU1fDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Badminton Player in Action"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Content */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-6 tracking-tight px-4">
            Elevate Your Game.
            <br />
            <span className="text-primary">Believe in Excellence.</span>
          </h1>
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-lg sm:text-xl text-white/70 mb-12 max-w-2xl mx-auto"
        >
          Join India's premier badminton academy where champions are made. Expert coaching,
          world-class facilities, and a community that believes in your potential.
        </motion.p>

        {/* Tournament Registration Banner - CLOSED */}
        {/* Deadline exceeded - Registration closed on 30th January 2026 */}
        {/* <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mb-8 max-w-3xl mx-auto"
        >
          <div className="bg-gradient-to-r from-orange-600/20 to-orange-500/20 border border-orange-500/30 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="w-6 h-6 text-orange-500" />
              <h3 className="text-2xl font-bold text-white">Tournament Registration Open!</h3>
            </div>
            <p className="text-white/80 mb-4">
              31st Jan & 1st Feb 2026 | Wadala Sports Club
            </p>
            <Button
              onClick={() => setIsTournamentModalOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg font-semibold"
            >
              Register Now
            </Button>
          </div>
        </motion.div> */}

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 px-4 w-full sm:w-auto"
        >
          <Button
            onClick={() => scrollToSection('#contact')}
            className="bg-primary hover:bg-primary/90 text-white px-6 sm:px-8 py-5 sm:py-6 group w-full sm:w-auto text-sm sm:text-base"
            size="lg"
          >
            Start Your Journey
            <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
          </Button>
          <Button
            onClick={() => scrollToSection('#about')}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10 px-6 sm:px-8 py-5 sm:py-6 w-full sm:w-auto text-sm sm:text-base"
            size="lg"
          >
            <Play className="mr-2" size={18} />
            Watch Our Story
          </Button>
        </motion.div>

        {/* Floating Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="grid grid-cols-3 gap-4 sm:gap-8 mt-16 sm:mt-20 max-w-3xl mx-auto px-4"
        >
          {[
            { number: '500+', label: 'Students' },
            { number: '15+', label: 'Expert Coaches' },
            { number: '5', label: 'Centres' },
          ].map((stat, index) => (
            <div key={index} className="text-center">
              <div className="text-2xl sm:text-3xl md:text-4xl text-white mb-1 sm:mb-2">{stat.number}</div>
              <div className="text-xs sm:text-sm text-white/60">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </div>
      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 1 }}
        className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20"
      >
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2"
        >
          <div className="w-1 h-2 bg-white/50 rounded-full" />
        </motion.div>
      </motion.div>

      {/* Tournament Registration Modal */}
      <TournamentRegistration
        isOpen={isTournamentModalOpen}
        onClose={() => setIsTournamentModalOpen(false)}
      />
    </section>
  );
}