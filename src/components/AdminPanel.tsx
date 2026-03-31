import { useState, useEffect } from 'react';
import { getSubmissions } from '../utils/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { RefreshCw, Mail, Phone, Calendar, MapPin, Trophy, FileText } from 'lucide-react';
import { toast } from 'sonner@2.0.3';

interface Submission {
  type: 'trial_booking' | 'tournament_request';
  name: string;
  email: string;
  phone: string;
  submittedAt: string;
  centre?: string;
  message?: string;
  description?: string;
}

export function AdminPanel() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'trial_booking' | 'tournament_request'>('all');

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const filterType = filter === 'all' ? undefined : filter;
      const response = await getSubmissions(filterType);
      setSubmissions(response.submissions);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      toast.error('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [filter]);

  const trialBookings = submissions.filter(s => s.type === 'trial_booking');
  const tournamentRequests = submissions.filter(s => s.type === 'tournament_request');

  const SubmissionCard = ({ submission }: { submission: Submission }) => (
    <Card className="p-6 bg-gradient-to-br from-card to-secondary border-white/10 hover:border-primary/30 transition-all">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-white text-lg mb-1">{submission.name}</h3>
          <Badge variant="outline" className={
            submission.type === 'trial_booking' 
              ? 'border-green-500/50 text-green-400' 
              : 'border-primary/50 text-primary'
          }>
            {submission.type === 'trial_booking' ? (
              <>
                <FileText size={12} className="mr-1" />
                Trial Booking
              </>
            ) : (
              <>
                <Trophy size={12} className="mr-1" />
                Tournament
              </>
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-white/50 text-sm">
          <Calendar size={14} />
          {new Date(submission.submittedAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-white/70">
          <Mail size={16} className="text-primary" />
          <a href={`mailto:${submission.email}`} className="hover:text-primary transition-colors">
            {submission.email}
          </a>
        </div>
        <div className="flex items-center gap-2 text-white/70">
          <Phone size={16} className="text-primary" />
          <a href={`tel:${submission.phone}`} className="hover:text-primary transition-colors">
            {submission.phone}
          </a>
        </div>
        
        {submission.centre && (
          <div className="flex items-center gap-2 text-white/70">
            <MapPin size={16} className="text-primary" />
            {submission.centre}
          </div>
        )}

        {submission.message && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-white/60 text-sm italic">"{submission.message}"</p>
          </div>
        )}

        {submission.description && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-white/60 text-sm italic">"{submission.description}"</p>
          </div>
        )}
      </div>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl text-white mb-2">
            Form <span className="text-primary">Submissions</span>
          </h2>
          <p className="text-white/60">View and manage all trial bookings and tournament requests</p>
        </div>
        <Button
          onClick={fetchSubmissions}
          disabled={loading}
          variant="outline"
          className="border-white/20 text-white hover:bg-white/10"
        >
          <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={16} />
          Refresh
        </Button>
      </div>

        <Tabs defaultValue="all" className="space-y-6" onValueChange={(v) => setFilter(v as any)}>
          <TabsList className="bg-card border border-white/10">
            <TabsTrigger value="all">
              All Submissions ({submissions.length})
            </TabsTrigger>
            <TabsTrigger value="trial_booking">
              Trial Bookings ({trialBookings.length})
            </TabsTrigger>
            <TabsTrigger value="tournament_request">
              Tournaments ({tournamentRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin mx-auto mb-4 text-primary" size={32} />
                <p className="text-white/50">Loading submissions...</p>
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/50">No submissions yet</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {submissions.map((submission, idx) => (
                  <SubmissionCard key={idx} submission={submission} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="trial_booking" className="space-y-4">
            {trialBookings.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/50">No trial bookings yet</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {trialBookings.map((submission, idx) => (
                  <SubmissionCard key={idx} submission={submission} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tournament_request" className="space-y-4">
            {tournamentRequests.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-white/50">No tournament requests yet</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {tournamentRequests.map((submission, idx) => (
                  <SubmissionCard key={idx} submission={submission} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
