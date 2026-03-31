import { motion } from 'motion/react';
import { useInView } from 'motion/react';
import { useRef, useState, useEffect } from 'react';
import { Award, GraduationCap, Trophy } from 'lucide-react';
import { getImages } from '../utils/api';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Coach {
  name: string;
  role: string;
  experience: string;
  achievements: string;
  specialty: string;
  image: string;
}

export function CoachingStaff() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [coachImages, setCoachImages] = useState<string[]>([]);

  // Fetch coach images from admin dashboard
  useEffect(() => {
    const fetchCoachImages = async () => {
      try {
        const response = await getImages('coaches');
        if (response.images && response.images.length > 0) {
          // Get up to 3 images sorted by creation date
          const imageUrls = response.images
            .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
            .slice(0, 3)
            .map((img: any) => img.url);
          setCoachImages(imageUrls);
        }
      } catch (error) {
        console.error('Error fetching coach images:', error);
      }
    };

    fetchCoachImages();
  }, []);

  const coaches: Coach[] = [
    {
      name: 'Darshak Palkar',
      role: 'Head Coach',
      experience: '12+ Years',
      achievements: 'National Level Coach, BWF Certified',
      specialty: 'Advanced Techniques & Strategy',
      image: coachImages[0] || 'https://images.unsplash.com/photo-1595220427358-8cf2ce3d7f89?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBzbWFzaCUyMGR5bmFtaWN8ZW58MXx8fHwxNzYwMTc5NDI2fDA&ixlib=rb-4.1.0&q=80&w=1080',
    },
    {
      name: 'Arif Inamdar',
      role: 'Senior Coach',
      experience: '7+ Years',
      achievements: 'Former National Player',
      specialty: 'Professional Training & Footwork',
      image: coachImages[1] || 'https://images.unsplash.com/photo-1595220427358-8cf2ce3d7f89?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBzbWFzaCUyMGR5bmFtaWN8ZW58MXx8fHwxNzYwMTc5NDI2fDA&ixlib=rb-4.1.0&q=80&w=1080',
    },
    {
      name: 'Manas Gupta',
      role: 'Professional Coach',
      experience: '7+ Years',
      achievements: 'Sports Science Graduate, Fitness Expert',
      specialty: 'Physical Conditioning & Recovery',
      image: coachImages[2] || 'https://images.unsplash.com/photo-1613918431551-b2ef2720387c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBwbGF5ZXIlMjBhY3Rpb258ZW58MXx8fHwxNzYwMTc0NTU1fDA&ixlib=rb-4.1.0&q=80&w=1080',
    },
  ];

  return (
    <section id="coaches" ref={ref} className="py-24 bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl text-white mb-4 px-4">
            Meet Our <span className="text-primary">Expert Coaches</span>
          </h2>
          <p className="text-white/70 text-lg max-w-2xl mx-auto">
            Learn from the best. Our coaching staff brings decades of experience, proven track
            records, and a passion for developing champions.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {coaches.map((coach, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="group"
            >
              <div className="bg-gradient-to-br from-card to-secondary border border-white/10 rounded-2xl overflow-hidden hover:border-primary/50 transition-all duration-300">
                {/* Image */}
                <div className="aspect-[4/5] overflow-hidden relative">
                  <ImageWithFallback
                    src={coach.image}
                    alt={coach.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  
                  {/* Floating Badge */}
                  <div className="absolute top-4 right-4 bg-primary/90 backdrop-blur-sm px-3 py-1 rounded-full text-white text-sm">
                    {coach.experience}
                  </div>
                </div>

                {/* Content */}
                <div className="p-6">
                  <h3 className="text-white text-xl mb-1 group-hover:text-primary transition-colors">
                    {coach.name}
                  </h3>
                  <p className="text-primary/90 mb-4">{coach.role}</p>

                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Trophy size={18} className="flex-shrink-0 mt-0.5 text-primary" />
                      <p className="text-white/70 text-sm">{coach.achievements}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <GraduationCap size={18} className="flex-shrink-0 mt-0.5 text-primary" />
                      <p className="text-white/70 text-sm">{coach.specialty}</p>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="mt-16 bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-2xl p-8 text-center"
        >
          <Award className="text-primary mx-auto mb-4" size={48} />
          <h3 className="text-white text-xl sm:text-2xl mb-3 px-4">World-Class Certification</h3>
          <p className="text-white/70 max-w-2xl mx-auto">
            All our coaches are certified by leading badminton federations and undergo continuous
            training to stay updated with the latest techniques and methodologies.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
