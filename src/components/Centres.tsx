import { motion } from 'motion/react';
import { useInView } from 'motion/react';
import { useRef, useState } from 'react';
import { MapPin, Clock, Phone, X, Play, Navigation } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { ImageWithFallback } from './figma/ImageWithFallback';

interface Centre {
  name: string;
  address: string;
  timing: string;
  phone: string;
  courts: number;
  image: string;
  videoUrl?: string;
  mapsUrl: string;
  detailedTimings: {
    day: string;
    hours: string;
  }[];
  facilities: string[];
}

export function Centres() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.2 });
  const [selectedCentre, setSelectedCentre] = useState<Centre | null>(null);

  const centres: Centre[] = [
    {
      name: 'Dadar Railway Colony',
      address: 'Dadar Central Railway Officers Colony, near Bharatkshetra, Dadar (E) - 400014 ',
      timing: 'Mon-Fri: 9.15 AM - 10.15 AM & 4 PM - 7 PM; SAT & SUN: 10 AM - 6 PM',
      phone: '+91 90221 02921',
      courts: 1,
      image: 'https://images.unsplash.com/photo-1624024834874-2a1611305604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBjb3VydCUyMGluZG9vcnxlbnwxfHx8fDE3NjA3MjA1NDR8MA&ixlib=rb-4.1.0&q=80&w=1080',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      mapsUrl: 'https://maps.google.com/?q=Dadar+Central+Railway+Officers+Colony+near+Bharatkshetra+Dadar+East+Mumbai+400014',
      detailedTimings: [
        { day: 'Monday - Friday', hours: '9:15 AM - 10:15 AM' },
        { day: 'Monday - Friday', hours: '4:00 PM - 7:00 PM' },
        { day: 'Saturday - Sunday', hours: '10:00 AM - 6:00 PM' },
      ],
      facilities: ['Premium Court Surface', 'LED Lighting', 'Changing Rooms', 'Water Cooler'],
    },
    {
      name: 'Dadar Parsee Colony Gymkhana',
      address: '606, Dr Babasaheb Ambedkar Rd, Dadar East, Dadar, Mumbai, Maharashtra 400014',
      timing: 'Mon-Sat: 7:00 AM - 9:00 PM',
      phone: '+91 90221 02921',
      courts: 1,
      image: 'https://images.unsplash.com/photo-1613918431551-b2ef2720387c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBwbGF5ZXJzJTIwYWN0aW9ufGVufDF8fHx8MTc2MDgwNTUxNnww&ixlib=rb-4.1.0&q=80&w=1080',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      mapsUrl: 'https://maps.google.com/?q=606+Dr+Babasaheb+Ambedkar+Rd+Dadar+East+Mumbai+400014',
      detailedTimings: [
        { day: 'Monday - Saturday', hours: '7:00 AM - 9:00 PM' },
        { day: 'Sunday', hours: 'Closed' },
      ],
      facilities: ['Modern Gymkhana', 'High-Quality Courts', 'Parking Available', 'Refreshments'],
    },
    {
      name: 'Kalidas Sport Complex',
      address: 'Purushottam Kheraj Rd, Mulund, Mulund West, Mumbai, Maharashtra 400080',
      timing: 'Mon-Fri: 10:00 PM - 12:00 AM',
      phone: '+91 80975 25015',
      courts: 4,
      image: 'https://images.unsplash.com/photo-1641352848874-c96659e03144?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxpbmRvb3IlMjBzcG9ydHMlMjBjb3VydHxlbnwxfHx8fDE3NjA3MDcyOTd8MA&ixlib=rb-4.1.0&q=80&w=1080',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      mapsUrl: 'https://maps.google.com/?q=Purushottam+Kheraj+Rd+Mulund+West+Mumbai+400080',
      detailedTimings: [
        { day: 'Monday - Friday', hours: '10:00 PM - 12:00 AM' },
        { day: 'Saturday - Sunday', hours: 'Closed' },
      ],
      facilities: ['4 Premium Courts', 'Late Night Sessions', 'Professional Lighting', 'Air Ventilation'],
    },
    {
      name: 'Nirmal Park',
      address: 'Near Lalbaug, Nirmal Park Railway Colony, Dr Baba Saheb Ambedkar Road, Chinchpokli-400011',
      timing: 'Mon-Sat: 6:00 AM - 9:00 PM',
      phone: '+91 90221 02921',
      courts: 1,
      image: 'https://images.unsplash.com/photo-1624024834874-2a1611305604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBjb3VydCUyMGluZG9vcnxlbnwxfHx8fDE3NjA3MjA1NDR8MA&ixlib=rb-4.1.0&q=80&w=1080',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      mapsUrl: 'https://maps.google.com/?q=Nirmal+Park+Railway+Colony+Dr+Baba+Saheb+Ambedkar+Road+Chinchpokli+Mumbai+400011',
      detailedTimings: [
        { day: 'Monday - Saturday', hours: '6:00 AM - 9:00 PM' },
        { day: 'Sunday', hours: 'Closed' },
      ],
      facilities: ['Morning Sessions', 'Evening Sessions', 'Equipment Available', 'Coached Sessions'],
    },
    {
      name: 'Salsette',
      address: 'The New Great Eastern Mills, Dr Babasaheb Ambedkar Rd, Dhaku Prabhuchi Wadi, Byculla East, Byculla - 400033',
      timing: 'Wed & Fri: 5 PM - 7 PM',
      phone: '+91 90221 02921',
      courts: 1,
      image: 'https://images.unsplash.com/photo-1613918431551-b2ef2720387c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBwbGF5ZXJzJTIwYWN0aW9ufGVufDF8fHx8MTc2MDgwNTUxNnww&ixlib=rb-4.1.0&q=80&w=1080',
      videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
      mapsUrl: 'https://maps.google.com/?q=New+Great+Eastern+Mills+Dr+Babasaheb+Ambedkar+Rd+Byculla+East+Mumbai+400033',
      detailedTimings: [
        { day: 'Wednesday', hours: '5:00 PM - 7:00 PM' },
        { day: 'Friday', hours: '5:00 PM - 7:00 PM' },
      ],
      facilities: ['Heritage Location', 'Quality Court', 'Beginner Friendly', 'Group Sessions'],
    },
  ];

  return (
    <>
      <section id="centres" ref={ref} className="py-24 bg-gradient-to-b from-black to-[#0a0a0a]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl text-white mb-4 px-4">
              Our <span className="text-primary">Training Centres</span>
            </h2>
            <p className="text-white/70 text-lg max-w-2xl mx-auto">
              Find a centre near you and start your badminton journey today. All our facilities are
              equipped with premium courts and modern amenities.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {centres.map((centre, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="bg-gradient-to-br from-card to-secondary border border-white/10 rounded-2xl p-6 hover:border-primary/50 transition-all duration-300 group cursor-pointer"
                onClick={() => setSelectedCentre(centre)}
              >
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-white text-xl group-hover:text-primary transition-colors font-normal">
                    {centre.name}
                  </h3>
                  <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-sm">
                    {centre.courts} {centre.courts === 1 ? 'Court' : 'Courts'}
                  </div>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="flex items-start gap-3 text-white/70">
                    <MapPin size={18} className="flex-shrink-0 mt-1 text-primary" />
                    <span className="text-sm">{centre.address}</span>
                  </div>
                  <div className="flex items-center gap-3 text-white/70">
                    <Clock size={18} className="flex-shrink-0 text-primary" />
                    <span className="text-sm">{centre.timing}</span>
                  </div>
                  <div className="flex items-center gap-3 text-white/70">
                    <Phone size={18} className="flex-shrink-0 text-primary" />
                    <span className="text-sm">{centre.phone}</span>
                  </div>
                </div>

                <Button
                  variant="outline"
                  className="w-full border-white/20 text-white hover:bg-primary hover:border-primary hover:text-white transition-all"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCentre(centre);
                  }}
                >
                  View Details
                </Button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Centre Detail Modal */}
      <Dialog open={!!selectedCentre} onOpenChange={(open) => !open && setSelectedCentre(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-gradient-to-br from-card to-secondary border-white/20 text-white w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="text-2xl sm:text-3xl text-white">
              {selectedCentre?.name}
            </DialogTitle>
            <DialogDescription className="text-white/70">
              View detailed information about this training centre including timings, facilities, and location.
            </DialogDescription>
          </DialogHeader>

          {selectedCentre && (
            <div className="space-y-6 mt-4">
              {/* Court Image */}
              <div className="relative rounded-xl overflow-hidden aspect-video">
                <ImageWithFallback
                  src={selectedCentre.image}
                  alt={`${selectedCentre.name} court`}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Video Section */}
              <div className="relative rounded-xl overflow-hidden aspect-video bg-black/50">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="bg-primary/20 rounded-full p-6 inline-block mb-4 border border-primary/50">
                      <Play size={40} className="text-primary" />
                    </div>
                    <p className="text-white/70">Video Coming Soon</p>
                    <p className="text-white/50 text-sm mt-2">
                      Watch players in action at {selectedCentre.name}
                    </p>
                  </div>
                </div>
                {/* Uncomment below to use actual YouTube embed */}
                {/* <iframe
                  width="100%"
                  height="100%"
                  src={selectedCentre.videoUrl}
                  title="Court video"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full"
                ></iframe> */}
              </div>

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Location & Contact */}
                <div className="space-y-4">
                  <h3 className="text-xl text-primary">Location & Contact</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <MapPin size={20} className="flex-shrink-0 text-primary mt-1" />
                      <div>
                        <a
                          href={selectedCentre.mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/90 hover:text-primary transition-colors cursor-pointer underline decoration-dotted"
                        >
                          {selectedCentre.address}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone size={20} className="flex-shrink-0 text-primary" />
                      <a
                        href={`tel:${selectedCentre.phone}`}
                        className="text-white/90 hover:text-primary transition-colors"
                      >
                        {selectedCentre.phone}
                      </a>
                    </div>
                  </div>
                  
                  {/* Get Directions Button */}
                  <Button
                    variant="outline"
                    className="w-full border-primary/50 text-primary hover:bg-primary hover:text-white transition-all"
                    onClick={() => window.open(selectedCentre.mapsUrl, '_blank')}
                  >
                    <Navigation size={18} className="mr-2" />
                    Get Directions
                  </Button>

                  <div className="pt-4">
                    <h4 className="text-white/90 mb-3">Facilities</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedCentre.facilities.map((facility, idx) => (
                        <div
                          key={idx}
                          className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-sm text-white/80"
                        >
                          {facility}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Timings */}
                <div className="space-y-4">
                  <h3 className="text-xl text-primary">Timings</h3>
                  <div className="space-y-2">
                    {selectedCentre.detailedTimings.map((timing, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center bg-white/5 border border-white/10 rounded-lg px-4 py-3"
                      >
                        <span className="text-white/90">{timing.day}</span>
                        <span className="text-primary">{timing.hours}</span>
                      </div>
                    ))}
                  </div>

                  <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mt-4">
                    <p className="text-sm text-white/70 mb-1">Number of Courts</p>
                    <p className="text-2xl text-primary">
                      {selectedCentre.courts} {selectedCentre.courts === 1 ? 'Court' : 'Courts'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Book Trial Button */}
              <div className="pt-4 border-t border-white/10">
                <Button
                  size="lg"
                  className="w-full bg-primary hover:bg-primary/90 text-white"
                  onClick={() => {
                    // Scroll to contact form
                    setSelectedCentre(null);
                    const contactSection = document.getElementById('contact');
                    if (contactSection) {
                      contactSection.scrollIntoView({ behavior: 'smooth' });
                    }
                  }}
                >
                  Book a Trial Session
                </Button>
                <p className="text-center text-white/50 text-sm mt-3">
                  Get in touch with us to schedule your free trial session
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
