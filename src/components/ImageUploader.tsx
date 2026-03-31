import { useState, useEffect, useRef } from 'react';
import { uploadImage, getImages } from '../utils/api';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Upload, Image as ImageIcon, RefreshCw, Trash2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { ImageWithFallback } from './figma/ImageWithFallback';

type BucketType = 'coaches' | 'courts' | 'events';

interface ImageData {
  name: string;
  url: string;
  createdAt: string;
}

export function ImageUploader() {
  const [activeTab, setActiveTab] = useState<BucketType>('coaches');
  const [images, setImages] = useState<Record<BucketType, ImageData[]>>({
    coaches: [],
    courts: [],
    events: [],
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchImages = async (bucket: BucketType) => {
    setLoading(true);
    try {
      const response = await getImages(bucket);
      setImages(prev => ({ ...prev, [bucket]: response.images }));
    } catch (error) {
      console.error(`Error fetching ${bucket} images:`, error);
      toast.error(`Failed to load ${bucket} images`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages(activeTab);
  }, [activeTab]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
      toast.error('Please select an image or video file');
      return;
    }

    // Validate file size (50MB max)
    if (file.size > 50 * 1024 * 1024) {
      toast.error('File size must be less than 50MB');
      return;
    }

    setUploading(true);
    try {
      const response = await uploadImage(file, activeTab);
      toast.success(`${file.name} uploaded successfully!`);
      fetchImages(activeTab); // Refresh the list
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = async (url: string) => {
    // Method 1: Try modern Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        setCopiedUrl(url);
        toast.success('URL copied to clipboard!');
        setTimeout(() => setCopiedUrl(null), 2000);
        return; // Success!
      } catch (clipboardErr) {
        // Clipboard API failed (permissions blocked), try fallback
        console.warn('Clipboard API blocked, using fallback method');
      }
    }

    // Method 2: Fallback to document.execCommand (works when Clipboard API is blocked)
    try {
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      
      if (successful) {
        setCopiedUrl(url);
        toast.success('URL copied to clipboard!');
        setTimeout(() => setCopiedUrl(null), 2000);
        return; // Success!
      }
    } catch (execErr) {
      console.warn('execCommand failed, showing manual copy option');
    }

    // Method 3: Show URL in toast for manual copy
    toast.info('Click to copy: ' + url, {
      duration: 10000,
      description: 'Click on the URL above to select and copy manually',
      action: {
        label: 'Select All',
        onClick: () => {
          // This won't copy, but helps user know what to do
          toast.info('Press Ctrl+C to copy the URL from the previous notification');
        }
      }
    });
    setCopiedUrl(null);
  };

  const currentImages = images[activeTab] || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl text-white mb-2">
          Image <span className="text-primary">Manager</span>
        </h2>
        <p className="text-white/60">Upload and manage images for coaches, courts, and events</p>
      </div>

        <Tabs defaultValue="coaches" className="space-y-6" onValueChange={(v) => setActiveTab(v as BucketType)}>
          <TabsList className="bg-card border border-white/10">
            <TabsTrigger value="coaches">
              Coaches ({images.coaches.length})
            </TabsTrigger>
            <TabsTrigger value="courts">
              Courts ({images.courts.length})
            </TabsTrigger>
            <TabsTrigger value="events">
              Events ({images.events.length})
            </TabsTrigger>
          </TabsList>

          {/* Upload Section */}
          <Card className="p-6 bg-gradient-to-br from-card to-secondary border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-white text-lg mb-1">Upload to {activeTab}</h3>
                <p className="text-white/50 text-sm">Max file size: 50MB</p>
              </div>
              <Button
                onClick={() => fetchImages(activeTab)}
                disabled={loading}
                variant="outline"
                size="sm"
                className="border-white/20 text-white hover:bg-white/10"
              >
                <RefreshCw className={`mr-2 ${loading ? 'animate-spin' : ''}`} size={14} />
                Refresh
              </Button>
            </div>

            <div className="flex gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
                id="file-upload"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="bg-primary hover:bg-primary/90 text-white"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="animate-spin mr-2" size={18} />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2" size={18} />
                    Choose File
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Images Grid */}
          <TabsContent value={activeTab} className="space-y-4">
            {loading ? (
              <div className="text-center py-12">
                <RefreshCw className="animate-spin mx-auto mb-4 text-primary" size={32} />
                <p className="text-white/50">Loading images...</p>
              </div>
            ) : currentImages.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-white/10 rounded-lg">
                <ImageIcon className="mx-auto mb-4 text-white/30" size={48} />
                <p className="text-white/50">No images uploaded yet</p>
                <p className="text-white/30 text-sm mt-2">Upload your first image using the button above</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {currentImages.map((image, idx) => (
                  <Card key={idx} className="overflow-hidden bg-card border-white/10 hover:border-primary/30 transition-all group">
                    <div className="aspect-square relative bg-black/50">
                      <ImageWithFallback
                        src={image.url}
                        alt={image.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 space-y-2">
                      <p className="text-white/70 text-xs truncate" title={image.name}>
                        {image.name}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyToClipboard(image.url)}
                          className="flex-1 border-white/20 text-white hover:bg-white/10 text-xs"
                        >
                          {copiedUrl === image.url ? (
                            <>
                              <Check size={12} className="mr-1" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy size={12} className="mr-1" />
                              Copy URL
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Instructions */}
        <Card className="mt-8 p-6 bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
          <h3 className="text-white mb-3">📸 How to Use Uploaded Images</h3>
          <ol className="text-white/70 text-sm space-y-2 list-decimal list-inside">
            <li>Upload images using the button above</li>
            <li>Click "Copy URL" to copy the image URL to clipboard</li>
            <li>Use the URL in your code or update the centre/coach data</li>
            <li>For videos, upload them here and use the URL in video embeds</li>
          </ol>
        </Card>
    </div>
  );
}
