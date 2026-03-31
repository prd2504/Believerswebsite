import { useState } from 'react';
import { AdminPanel } from './AdminPanel';
import { ImageUploader } from './ImageUploader';
import { TournamentRegistrations } from './TournamentRegistrations';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';
import { Home, FileText, Image, LogOut, Trophy } from 'lucide-react';

interface AdminDashboardProps {
  onExit: () => void;
  onLogout?: () => void;
}

export function AdminDashboard({ onExit, onLogout }: AdminDashboardProps) {
  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-[#0a0a0a]">
      {/* Top Bar */}
      <div className="border-b border-white/10 bg-black/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <span className="text-primary text-xl">🏸</span>
            </div>
            <div>
              <h2 className="text-white font-semibold">Believers Badminton Academy</h2>
              <p className="text-white/50 text-sm">Admin Dashboard</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="border-white/20 text-white hover:bg-red-500/20 hover:border-red-500/50"
            >
              <LogOut className="mr-2" size={16} />
              Logout
            </Button>
            <Button
              onClick={onExit}
              variant="outline"
              className="border-white/20 text-white hover:bg-white/10"
            >
              <Home className="mr-2" size={16} />
              Back to Website
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Tabs defaultValue="submissions" className="space-y-6">
          <TabsList className="bg-card border border-white/10">
            <TabsTrigger value="submissions">
              <FileText className="mr-2" size={16} />
              Form Submissions
            </TabsTrigger>
            <TabsTrigger value="tournament">
              <Trophy className="mr-2" size={16} />
              Tournament Registrations
            </TabsTrigger>
            <TabsTrigger value="images">
              <Image className="mr-2" size={16} />
              Image Manager
            </TabsTrigger>
          </TabsList>

          <TabsContent value="submissions" className="mt-0">
            <AdminPanel />
          </TabsContent>

          <TabsContent value="tournament" className="mt-0">
            <TournamentRegistrations />
          </TabsContent>

          <TabsContent value="images" className="mt-0">
            <ImageUploader />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}