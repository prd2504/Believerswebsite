import { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { 
  Mail, 
  Phone, 
  Calendar, 
  Trophy, 
  RefreshCw, 
  Download,
  Users,
  AlertCircle,
  Copy,
  Check,
  Image as ImageIcon,
  ExternalLink
} from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface TournamentRegistration {
  type: 'tournament_registration';
  ticketId: string;
  playerName: string;
  email: string;
  phone: string;
  category: string;
  partnerName: string;
  emergencyContact: string;
  paymentScreenshotPath?: string;
  registeredAt: string;
  whatsappStatus: string;
}

export function TournamentRegistrations() {
  const [registrations, setRegistrations] = useState<TournamentRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [filter, setFilter] = useState<'all' | 'mens_doubles' | 'mixed_doubles'>('all');

  const fetchRegistrations = async () => {
    setLoading(true);
    try {
      const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fd33611c`;
      const response = await fetch(`${API_BASE_URL}/tournament-registrations`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch registrations');
      }

      const data = await response.json();
      setRegistrations(data.registrations || []);
    } catch (error) {
      console.error('Error fetching registrations:', error);
      toast.error('Failed to load tournament registrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const exportToCSV = () => {
    const headers = [
      'Ticket ID',
      'Player Name',
      'Email',
      'Phone',
      'Category',
      'Partner Name',
      'Emergency Contact',
      'Registration Date',
      'WhatsApp Status'
    ];

    const rows = filteredRegistrations.map(reg => [
      reg.ticketId,
      reg.playerName,
      reg.email,
      reg.phone,
      reg.category === 'mens_doubles' ? "Men's Doubles OPEN" : "Mixed Doubles OPEN",
      reg.partnerName,
      reg.emergencyContact,
      new Date(reg.registeredAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      reg.whatsappStatus
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `tournament_registrations_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    toast.success('CSV exported successfully!');
  };

  const copyAllPhoneNumbers = () => {
    const phoneNumbers = filteredRegistrations.map(reg => reg.phone).join('\n');
    navigator.clipboard.writeText(phoneNumbers);
    setCopiedPhone(true);
    toast.success(`${filteredRegistrations.length} phone numbers copied to clipboard!`);
    setTimeout(() => setCopiedPhone(false), 2000);
  };

  const viewPaymentScreenshot = async (paymentScreenshotPath: string) => {
    if (!paymentScreenshotPath) {
      toast.error('No payment screenshot available');
      return;
    }

    try {
      const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fd33611c`;
      const response = await fetch(`${API_BASE_URL}/payment-screenshot/${encodeURIComponent(paymentScreenshotPath)}`, {
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to get screenshot URL');
      }

      const data = await response.json();
      
      if (data.signedUrl) {
        // Open in new tab
        window.open(data.signedUrl, '_blank');
      } else {
        throw new Error('No signed URL returned');
      }
    } catch (error) {
      console.error('Error viewing payment screenshot:', error);
      toast.error('Failed to load payment screenshot');
    }
  };

  const mensDoublesRegs = registrations.filter(r => r.category === 'mens_doubles');
  const mixedDoublesRegs = registrations.filter(r => r.category === 'mixed_doubles');

  const filteredRegistrations = filter === 'all' 
    ? registrations 
    : registrations.filter(r => r.category === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl text-white mb-2">
            Tournament <span className="text-primary">Registrations</span>
          </h2>
          <p className="text-white/60">31st Jan & 1st Feb 2026 | Wadala Sports Club</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={copyAllPhoneNumbers}
            variant="outline"
            className="border-green-500/30 text-green-400 hover:bg-green-500/10"
            disabled={filteredRegistrations.length === 0}
          >
            {copiedPhone ? (
              <>
                <Check className="mr-2" size={16} />
                Copied!
              </>
            ) : (
              <>
                <Copy className="mr-2" size={16} />
                Copy Phone Numbers
              </>
            )}
          </Button>
          <Button
            onClick={exportToCSV}
            variant="outline"
            className="border-primary/30 text-primary hover:bg-primary/10"
            disabled={filteredRegistrations.length === 0}
          >
            <Download className="mr-2" size={16} />
            Export CSV
          </Button>
          <Button
            onClick={fetchRegistrations}
            disabled={loading}
            variant="outline"
            className="border-white/20 text-white hover:bg-white/10"
          >
            <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={16} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm mb-1">Total Registrations</p>
              <p className="text-3xl font-bold text-white">{registrations.length}</p>
            </div>
            <Trophy className="w-12 h-12 text-blue-500/50" />
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm mb-1">Men's Doubles</p>
              <p className="text-3xl font-bold text-white">
                {mensDoublesRegs.length}
                <span className="text-lg text-white/50"> / 16</span>
              </p>
              <p className="text-xs text-white/40 mt-1">
                {16 - mensDoublesRegs.length} slots remaining
              </p>
            </div>
            <Users className="w-12 h-12 text-orange-500/50" />
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/60 text-sm mb-1">Mixed Doubles</p>
              <p className="text-3xl font-bold text-white">
                {mixedDoublesRegs.length}
                <span className="text-lg text-white/50"> / 16</span>
              </p>
              <p className="text-xs text-white/40 mt-1">
                {16 - mixedDoublesRegs.length} slots remaining
              </p>
            </div>
            <Users className="w-12 h-12 text-purple-500/50" />
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 bg-card border border-white/10 rounded-lg p-1">
        <button
          onClick={() => setFilter('all')}
          className={`flex-1 py-2 px-4 rounded transition-colors ${
            filter === 'all'
              ? 'bg-primary text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          All ({registrations.length})
        </button>
        <button
          onClick={() => setFilter('mens_doubles')}
          className={`flex-1 py-2 px-4 rounded transition-colors ${
            filter === 'mens_doubles'
              ? 'bg-orange-500 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Men's Doubles ({mensDoublesRegs.length})
        </button>
        <button
          onClick={() => setFilter('mixed_doubles')}
          className={`flex-1 py-2 px-4 rounded transition-colors ${
            filter === 'mixed_doubles'
              ? 'bg-purple-500 text-white'
              : 'text-white/60 hover:text-white hover:bg-white/5'
          }`}
        >
          Mixed Doubles ({mixedDoublesRegs.length})
        </button>
      </div>

      {/* Registrations List */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading registrations...</p>
        </div>
      ) : filteredRegistrations.length === 0 ? (
        <Card className="p-12 text-center bg-card border-white/10">
          <Trophy className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <p className="text-white/40">No registrations yet</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredRegistrations.map((reg, index) => (
            <Card
              key={index}
              className="p-6 bg-gradient-to-br from-card to-secondary border-white/10 hover:border-primary/30 transition-all"
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white text-lg font-semibold mb-1">{reg.playerName}</h3>
                  <Badge
                    variant="outline"
                    className={
                      reg.category === 'mens_doubles'
                        ? 'border-orange-500/50 text-orange-400'
                        : 'border-purple-500/50 text-purple-400'
                    }
                  >
                    <Trophy size={12} className="mr-1" />
                    {reg.category === 'mens_doubles' ? "Men's Doubles" : 'Mixed Doubles'}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-primary font-mono text-sm font-semibold">{reg.ticketId}</p>
                  <div className="flex items-center gap-1 text-white/50 text-xs mt-1">
                    <Calendar size={12} />
                    {new Date(reg.registeredAt).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </div>
                </div>
              </div>

              {/* Details Grid */}
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-white/40 text-xs mb-1">Partner</p>
                    <p className="text-white/80 flex items-center gap-1">
                      <Users size={14} className="text-primary" />
                      {reg.partnerName}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 space-y-2">
                  <div className="flex items-center gap-2 text-white/70">
                    <Mail size={14} className="text-primary" />
                    <a href={`mailto:${reg.email}`} className="hover:text-primary transition-colors truncate">
                      {reg.email}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-white/70">
                    <Phone size={14} className="text-primary" />
                    <a href={`tel:${reg.phone}`} className="hover:text-primary transition-colors">
                      {reg.phone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2 text-white/70">
                    <AlertCircle size={14} className="text-red-500" />
                    <span className="text-xs">Emergency: {reg.emergencyContact}</span>
                  </div>
                </div>
              </div>

              {/* Payment Screenshot Button */}
              {reg.paymentScreenshotPath && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <Button
                    onClick={() => viewPaymentScreenshot(reg.paymentScreenshotPath!)}
                    variant="outline"
                    size="sm"
                    className="w-full border-green-500/30 text-green-400 hover:bg-green-500/10 hover:border-green-500/50"
                  >
                    <ImageIcon size={14} className="mr-2" />
                    View Payment Screenshot
                    <ExternalLink size={12} className="ml-2" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}