import { projectId, publicAnonKey } from './supabase/info';

const API_BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fd33611c`;

// Helper function to make API calls
async function apiCall(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API call failed: ${response.statusText}`);
  }

  return response.json();
}

// ==================== FORM SUBMISSIONS ====================

export interface TrialBookingData {
  name: string;
  email: string;
  phone: string;
  centre: string;
  message?: string;
}

export interface TournamentRequestData {
  name: string;
  email: string;
  phone: string;
  description: string;
}

export interface TournamentRegistrationData {
  playerName: string;
  email: string;
  phone: string;
  category: string;
  partnerName: string;
  emergencyContact: string;
}

export async function submitTrialBooking(data: TrialBookingData) {
  return apiCall('/submit-trial', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitTournamentRequest(data: TournamentRequestData) {
  return apiCall('/submit-tournament', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function submitTournamentRegistration(data: TournamentRegistrationData, paymentScreenshot: File) {
  const formData = new FormData();
  formData.append('playerName', data.playerName);
  formData.append('email', data.email);
  formData.append('phone', data.phone);
  formData.append('category', data.category);
  formData.append('partnerName', data.partnerName);
  formData.append('emergencyContact', data.emergencyContact);
  formData.append('paymentScreenshot', paymentScreenshot);

  const url = `${API_BASE_URL}/tournament-registration`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to submit registration');
  }

  return response.json();
}

export async function getTournamentSlots() {
  return apiCall('/tournament-slots');
}

// ==================== IMAGE UPLOAD ====================

export async function uploadImage(file: File, bucketType: 'coaches' | 'courts' | 'events') {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bucketType', bucketType);

  const url = `${API_BASE_URL}/upload-image`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${publicAnonKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'Failed to upload image');
  }

  return response.json();
}

export async function getImages(bucketType: 'coaches' | 'courts' | 'events') {
  return apiCall(`/images/${bucketType}`);
}

// ==================== ADMIN ====================

export async function getSubmissions(type?: 'trial_booking' | 'tournament_request') {
  const query = type ? `?type=${type}` : '';
  return apiCall(`/submissions${query}`);
}