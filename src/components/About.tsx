import { motion } from 'motion/react';
import { useInView } from 'motion/react';
import { useRef } from 'react';
import { Target, Award, Users, TrendingUp } from 'lucide-react';

export function About() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, amount: 0.3 });

  const features = [
    {
      icon: Target,
      title: 'Expert Training',
      description: 'Personalized coaching programs designed to bring out the best in every player.',
    },
    {
      icon: Award,
      title: 'Proven Results',
      description: 'Our students consistently excel in state and national championships.',
    },
    {
      icon: Users,
      title: 'Community',
      description: 'Join a vibrant community of passionate players and supportive coaches.',
    },
    {
      icon: TrendingUp,
      title: 'Growth Mindset',
      description: 'We focus on continuous improvement, both on and off the court.',
    },
  ];

  return (
    <section id="about" ref={ref} className="py-24 bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left: Image */}
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="aspect-[4/3] rounded-2xl overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1624024834874-2a1611305604?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiYWRtaW50b24lMjBjb3VydCUyMGluZG9vcnxlbnwxfHx8fDE3NjAwOTA5ODJ8MA&ixlib=rb-4.1.0&q=80&w=1080"
                alt="Badminton Court"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-8 -right-8 w-64 h-64 bg-primary/20 rounded-full blur-3xl" />
          </motion.div>

          {/* Right: Content */}
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl text-white mb-6">
              Where Passion Meets
              <span className="text-primary"> Excellence</span>
            </h2>
            <p className="text-white/70 text-lg mb-8 leading-relaxed">
              At Believers Badminton Academy, we don't just teach badminton – we nurture champions.
              Our state-of-the-art facilities, combined with expert coaching and a supportive
              environment, create the perfect foundation for players of all levels to excel.
            </p>
            <p className="text-white/70 text-lg mb-12 leading-relaxed">
              Founded with a vision to make world-class badminton training accessible, we've grown
              into one of India's most trusted academies, producing countless state and national
              champions.
            </p>

            {/* Features Grid */}
            <div className="grid sm:grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.4 + index * 0.1 }}
                  className="flex gap-4"
                >
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                      <feature.icon className="text-primary" size={24} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-white mb-2">{feature.title}</h3>
                    <p className="text-white/60 text-sm">{feature.description}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
