import { motion } from 'motion/react';
import { useInView } from 'motion/react';
import { useRef, useState, useEffect } from 'react';
import { 
  Calendar, 
  Trophy, 
  Users, 
  Globe, 
  Instagram, 
  Smartphone,
  CheckCircle2,
  Sparkles,
  Play,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from './ui/button';
import { TournamentModal } from './TournamentModal';
import { getImages } from '../utils/api';
import { ImageWithFallback } from './figma/ImageWithFallback';

export function Events() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [isTournamentModalOpen, setIsTournamentModalOpen] = useState(false);
  const [testimonyVideos, setTestimonyVideos] = useState<string[]>([]);
  const [videoPlayingStates, setVideoPlayingStates] = useState<boolean[]>([]);
  const [dentalImages, setDentalImages] = useState<string[]>([]);
  const [dcpgImages, setDcpgImages] = useState<string[]>([]);
  const [dentalSlide, setDentalSlide] = useState(0);
  const [dcpgSlide, setDcpgSlide] = useState(0);
  const [currentTestimonyIndex, setCurrentTestimonyIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // Fetch testimony videos and event images from admin dashboard
  useEffect(() => {
    const fetchEventMedia = async () => {
      try {
        const response = await getImages('events');
        console.log('Events bucket response:', response);
        if (response.images && response.images.length > 0) {
          // Separate videos and images
          const videos: any[] = [];
          const dentalImgs: any[] = [];
          const dcpgImgs: any[] = [];
          
          response.images.forEach((item: any) => {
            const name = (item.name || '').toLowerCase();
            const url = (item.url || '').toLowerCase();
            const isVideo = name.includes('.mp4') || name.includes('.mov') || 
                           name.includes('.webm') || name.includes('.avi') ||
                           url.includes('.mp4') || url.includes('.mov') || 
                           url.includes('.webm') || url.includes('.avi');
            
            if (isVideo) {
              videos.push(item);
            } else {
              // Separate DCPG images from Dental Association images
              if (name.includes('dcpg') || name.includes('dpcg')) {
                dcpgImgs.push(item);
              } else {
                dentalImgs.push(item);
              }
            }
          });
          
          // Set all videos
          if (videos.length > 0) {
            const videoUrls = videos
              .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .map((vid: any) => vid.url);
            console.log('Found videos:', videoUrls);
            setTestimonyVideos(videoUrls);
            setVideoPlayingStates(new Array(videoUrls.length).fill(false));
          }
          
          // Set Dental Association images (first 4 non-DCPG images)
          if (dentalImgs.length > 0) {
            const dentalUrls = dentalImgs
              .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
              .slice(0, 4)
              .map((img: any) => img.url);
            console.log('Found Dental Association images:', dentalUrls);
            setDentalImages(dentalUrls);
          }
          
          // Set DCPG images (up to 4)
          if (dcpgImgs.length > 0) {
            const dcpgUrls = dcpgImgs
              .sort((a: any, b: any) => {
                // Try to sort by number in filename (DCPG 1, DCPG 2, etc.)
                const numA = parseInt(a.name.match(/\d+/)?.[0] || '0');
                const numB = parseInt(b.name.match(/\d+/)?.[0] || '0');
                return numA - numB;
              })
              .slice(0, 4)
              .map((img: any) => img.url);
            console.log('Found DCPG images:', dcpgUrls);
            setDcpgImages(dcpgUrls);
          }
        }
      } catch (error) {
        console.error('Error fetching event media:', error);
      }
    };

    fetchEventMedia();
  }, []);

  // Auto-advance Dental Association slideshow every 3 seconds
  useEffect(() => {
    if (dentalImages.length > 1) {
      const interval = setInterval(() => {
        setDentalSlide((prev) => (prev + 1) % dentalImages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [dentalImages.length]);

  // Auto-advance DCPG slideshow every 3 seconds
  useEffect(() => {
    if (dcpgImages.length > 1) {
      const interval = setInterval(() => {
        setDcpgSlide((prev) => (prev + 1) % dcpgImages.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [dcpgImages.length]);

  const handlePlayVideo = (index: number) => {
    if (videoRefs.current[index]) {
      videoRefs.current[index]?.play();
      const newStates = [...videoPlayingStates];
      newStates[index] = true;
      setVideoPlayingStates(newStates);
    }
  };

  const handleVideoEnded = (index: number) => {
    const newStates = [...videoPlayingStates];
    newStates[index] = false;
    setVideoPlayingStates(newStates);
  };

  const pastEvents = [
    {
      title: 'Annual Badminton Tournament - All India Dental Association (Mumbai branch)',
      date: 'AUGUST 2025',
      participants: '100+ Players',
      hasSlideshow: true,
    },
    {
      title: 'DPCG Carnival\' 2025',
      date: 'SEPTEMBER 2025',
      participants: '150+ Players',
      image: 'https://images.unsplash.com/photo-1623208525215-a573aacb1560?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBldmVudCUyMG9yZ2FuaXphdGlvbnxlbnwxfHx8fDE3NjAxODAxMjZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
    },
  ];

  const services = [
    {
      icon: Calendar,
      title: 'End-to-End Event Management',
      description: 'Complete tournament organization from planning to execution, handling every detail.',
    },
    {
      icon: Globe,
      title: 'Custom Registration Websites',
      description: 'Professional registration portals with payment integration and participant management.',
    },
    {
      icon: Instagram,
      title: 'Social Media Marketing',
      description: 'Comprehensive Instagram and social media campaigns to maximize event reach and engagement.',
    },
    {
      icon: Smartphone,
      title: 'Live Updates & Scoring',
      description: 'Real-time match updates, live scoring systems, and digital leaderboards.',
    },
    {
      icon: Trophy,
      title: 'Prize & Awards Management',
      description: 'Complete trophy management, certificate design, and award ceremony coordination.',
    },
    {
      icon: Users,
      title: 'Participant Experience',
      description: 'Player registration, draw management, scheduling, and communication throughout the event.',
    },
  ];

  const highlights = [
    '50+ Successful Events',
    '5,000+ Total Participants',
    'Professional Livestreaming',
    'Certified Umpires',
    'Media Coverage',
    'Sponsorship Management',
  ];

  return (
    <section id="events" ref={ref} className="py-24 bg-gradient-to-b from-black to-[#0a0a0a]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl text-white mb-4 px-4">
            World-Class <span className="text-primary">Event Management</span>
          </h2>
          <p className="text-white/70 text-lg max-w-3xl mx-auto">
            From intimate club tournaments to large-scale championships, we deliver exceptional 
            badminton events with professional organization, cutting-edge technology, and unforgettable experiences.
          </p>
        </motion.div>

        {/* Video Testimony Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-20"
        >
          <h3 className="text-white text-xl sm:text-2xl mb-8 text-center px-4">Client Testimonials</h3>
          {testimonyVideos.length > 0 ? (
            <>
              {/* Desktop: Grid Layout */}
              <div className={`hidden md:grid ${testimonyVideos.length === 1 ? 'max-w-4xl mx-auto' : 'md:grid-cols-2 gap-6 max-w-6xl mx-auto'}`}>
                {testimonyVideos.map((video, index) => (
                  <div key={index} className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 group">
                    <video
                      ref={(el) => (videoRefs.current[index] = el)}
                      src={video}
                      className="w-full h-full object-cover"
                      controls={videoPlayingStates[index]}
                      onEnded={() => handleVideoEnded(index)}
                      poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect fill='%23000' width='100%25' height='100%25'/%3E%3C/svg%3E"
                    />
                    {!videoPlayingStates[index] && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <button
                          onClick={() => handlePlayVideo(index)}
                          className="w-20 h-20 bg-primary/90 hover:bg-primary rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110 group-hover:shadow-[0_0_30px_rgba(255,87,34,0.5)]"
                        >
                          <Play className="text-white ml-1" size={36} fill="white" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Mobile: Carousel */}
              <div className="md:hidden max-w-lg mx-auto">
                <div className="relative">
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-white/10 group">
                    <video
                      ref={(el) => (videoRefs.current[currentTestimonyIndex] = el)}
                      src={testimonyVideos[currentTestimonyIndex]}
                      className="w-full h-full object-cover"
                      controls={videoPlayingStates[currentTestimonyIndex]}
                      onEnded={() => handleVideoEnded(currentTestimonyIndex)}
                      poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25'%3E%3Crect fill='%23000' width='100%25' height='100%25'/%3E%3C/svg%3E"
                    />
                    {!videoPlayingStates[currentTestimonyIndex] && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <button
                          onClick={() => handlePlayVideo(currentTestimonyIndex)}
                          className="w-16 h-16 bg-primary/90 hover:bg-primary rounded-full flex items-center justify-center transition-all duration-300 transform hover:scale-110"
                        >
                          <Play className="text-white ml-1" size={28} fill="white" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Navigation Arrows */}
                  {testimonyVideos.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentTestimonyIndex((prev) => (prev - 1 + testimonyVideos.length) % testimonyVideos.length)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-all"
                      >
                        <ChevronLeft size={24} />
                      </button>
                      <button
                        onClick={() => setCurrentTestimonyIndex((prev) => (prev + 1) % testimonyVideos.length)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/70 hover:bg-black/90 rounded-full flex items-center justify-center text-white transition-all"
                      >
                        <ChevronRight size={24} />
                      </button>
                    </>
                  )}
                </div>

                {/* Dots Indicator */}
                {testimonyVideos.length > 1 && (
                  <div className="flex justify-center gap-2 mt-4">
                    {testimonyVideos.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setCurrentTestimonyIndex(index)}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          index === currentTestimonyIndex 
                            ? 'bg-primary w-8' 
                            : 'bg-white/40'
                        }`}
                        aria-label={`Go to testimony ${index + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="max-w-4xl mx-auto">
              <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-card to-secondary border border-white/10 flex items-center justify-center">
                <div className="text-center p-8">
                  <Play className="text-white/30 mx-auto mb-4" size={48} />
                  <p className="text-white/50">No testimony videos uploaded yet</p>
                  <p className="text-white/30 text-sm mt-2">Upload videos in the Admin Dashboard → Events tab</p>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Past Events Gallery */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-20"
        >
          <h3 className="text-white text-xl sm:text-2xl mb-8 text-center px-4">Recent Events</h3>
          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {pastEvents.map((event, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.3 + index * 0.1 }}
                className="group relative overflow-hidden rounded-2xl aspect-[4/5]"
              >
                {/* Slideshow or Static Image */}
                {index === 0 && dentalImages.length > 0 ? (
                  // Dental Association Slideshow
                  <div className="relative w-full h-full">
                    {/* Slideshow Images */}
                    {dentalImages.map((imgUrl, imgIndex) => (
                      <div
                        key={imgIndex}
                        className="absolute inset-0 transition-opacity duration-1000"
                        style={{
                          opacity: imgIndex === dentalSlide ? 1 : 0,
                          zIndex: imgIndex === dentalSlide ? 1 : 0,
                        }}
                      >
                        <ImageWithFallback
                          src={imgUrl}
                          alt={`${event.title} - Photo ${imgIndex + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ))}
                    
                    {/* Slideshow Indicators */}
                    <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-2 z-10">
                      {dentalImages.map((_, dotIndex) => (
                        <button
                          key={dotIndex}
                          onClick={() => setDentalSlide(dotIndex)}
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            dotIndex === dentalSlide 
                              ? 'bg-primary w-8' 
                              : 'bg-white/40 hover:bg-white/60'
                          }`}
                          aria-label={`Go to slide ${dotIndex + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                ) : index === 1 && dcpgImages.length > 0 ? (
                  // DCPG Slideshow
                  <div className="relative w-full h-full">
                    {/* Slideshow Images */}
                    {dcpgImages.map((imgUrl, imgIndex) => (
                      <div
                        key={imgIndex}
                        className="absolute inset-0 transition-opacity duration-1000"
                        style={{
                          opacity: imgIndex === dcpgSlide ? 1 : 0,
                          zIndex: imgIndex === dcpgSlide ? 1 : 0,
                        }}
                      >
                        <ImageWithFallback
                          src={imgUrl}
                          alt={`${event.title} - Photo ${imgIndex + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      </div>
                    ))}
                    
                    {/* Slideshow Indicators */}
                    <div className="absolute bottom-24 left-0 right-0 flex justify-center gap-2 z-10">
                      {dcpgImages.map((_, dotIndex) => (
                        <button
                          key={dotIndex}
                          onClick={() => setDcpgSlide(dotIndex)}
                          className={`w-2 h-2 rounded-full transition-all duration-300 ${
                            dotIndex === dcpgSlide 
                              ? 'bg-primary w-8' 
                              : 'bg-white/40 hover:bg-white/60'
                          }`}
                          aria-label={`Go to slide ${dotIndex + 1}`}
                        />
                      ))}
                    </div>
                  </div>
                ) : event.image ? (
                  // Static image fallback
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  // Placeholder if no images uploaded
                  <div className="w-full h-full bg-gradient-to-br from-card to-secondary flex items-center justify-center">
                    <div className="text-center p-8">
                      <ImageWithFallback
                        src="https://images.unsplash.com/photo-1716041040048-228dbae7b6ba?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjB0b3VybmFtZW50JTIwZXZlbnR8ZW58MXx8fHwxNzYwMTgwMTI1fDA&ixlib=rb-4.1.0&q=80&w=1080"
                        alt={event.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
                  <h4 className="text-white text-xl mb-2">{event.title}</h4>
                  <div className="flex items-center gap-4 text-white/70 text-sm">
                    <span className="flex items-center gap-1">
                      <Calendar size={16} className="text-primary" />
                      {event.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={16} className="text-primary" />
                      {event.participants}
                    </span>
                  </div>
                </div>

                {/* Sparkle effect on hover */}
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Sparkles className="text-primary" size={24} />
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Services We Offer */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mb-20"
        >
          <h3 className="text-white text-xl sm:text-2xl mb-8 text-center px-4">Complete Tournament Solutions</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {services.map((service, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.6 + index * 0.1 }}
                className="bg-gradient-to-br from-card to-secondary border border-white/10 rounded-xl p-6 hover:border-primary/50 transition-all duration-300 group"
              >
                <div className="w-14 h-14 bg-primary/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <service.icon className="text-primary" size={28} />
                </div>
                <h4 className="text-white mb-2">{service.title}</h4>
                <p className="text-white/60 text-sm">{service.description}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Highlights */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-2xl p-8 md:p-12"
        >
          <div className="text-center mb-8">
            <h3 className="text-white text-2xl sm:text-3xl mb-3 px-4">Why Choose Believers for Your Event?</h3>
            <p className="text-white/70">
              We've mastered the art of creating memorable tournaments that run seamlessly
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {highlights.map((highlight, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.9 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <CheckCircle2 className="text-primary flex-shrink-0" size={24} />
                <span className="text-white">{highlight}</span>
              </motion.div>
            ))}
          </div>

          <div className="text-center">
            <Button
              onClick={() => setIsTournamentModalOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white px-8 py-6"
              size="lg"
            >
              Plan Your Tournament
            </Button>
          </div>
        </motion.div>

        {/* Tech Stack Info */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-16 text-center"
        >
          <p className="text-white/50 text-sm max-w-3xl mx-auto">
            Our event management platform includes custom-built registration websites, automated 
            email notifications, payment processing, bracket generation, live scoring, Instagram 
            integration for real-time updates, and comprehensive analytics dashboards.
          </p>
        </motion.div>
      </div>

      {/* Tournament Planning Modal */}
      <TournamentModal 
        open={isTournamentModalOpen} 
        onOpenChange={setIsTournamentModalOpen} 
      />
    </section>
  );
}
