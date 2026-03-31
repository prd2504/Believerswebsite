import { useState, useEffect } from 'react';
import { Navigation } from './components/Navigation';
import { Hero } from './components/Hero';
import { About } from './components/About';
import { Events } from './components/Events';
import { Centres } from './components/Centres';
import { CoachingStaff } from './components/CoachingStaff';
import { ContactForm } from './components/ContactForm';
import { Footer } from './components/Footer';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLogin } from './components/AdminLogin';
import { Toaster } from './components/ui/sonner';

export default function App() {
  const [showAdmin, setShowAdmin] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication status and URL on mount
  useEffect(() => {
    const isAuth = localStorage.getItem('admin_authenticated') === 'true';
    setIsAuthenticated(isAuth);
    
    const path = window.location.pathname;
    if (path === '/admin' || path.startsWith('/admin')) {
      setShowAdmin(true);
    }

    // Listen for popstate (back/forward navigation)
    const handlePopState = () => {
      const currentPath = window.location.pathname;
      if (currentPath === '/admin' || currentPath.startsWith('/admin')) {
        setShowAdmin(true);
      } else {
        setShowAdmin(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Update URL when switching views
  useEffect(() => {
    if (showAdmin) {
      if (window.location.pathname !== '/admin') {
        window.history.pushState({}, '', '/admin');
      }
    } else {
      if (window.location.pathname !== '/') {
        window.history.pushState({}, '', '/');
      }
    }
  }, [showAdmin]);

  // Keyboard shortcut: Ctrl+Shift+A to toggle admin
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        setShowAdmin(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('admin_authenticated');
    setIsAuthenticated(false);
    setShowAdmin(false);
  };

  // Show admin login if trying to access admin but not authenticated
  if (showAdmin && !isAuthenticated) {
    return (
      <>
        <AdminLogin 
          onLogin={() => setIsAuthenticated(true)}
          onBack={() => setShowAdmin(false)}
        />
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  // Show admin dashboard if authenticated
  if (showAdmin && isAuthenticated) {
    return (
      <>
        <AdminDashboard 
          onExit={() => setShowAdmin(false)}
          onLogout={handleLogout}
        />
        <Toaster position="top-right" theme="dark" />
      </>
    );
  }

  // Show main website
  return (
    <div className="min-h-screen bg-black">
      <Navigation />
      <Hero />
      <About />
      <Events />
      <Centres />
      <CoachingStaff />
      <ContactForm />
      <Footer onAdminClick={() => setShowAdmin(true)} />
      <Toaster position="top-right" theme="dark" />
    </div>
  );
}
