import type { DetectionType, SensitivePattern, Share, SensitiveFile } from '@/types';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface User {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
}

interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
}

let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
  if (token) {
    localStorage.setItem('authToken', token);
  } else {
    localStorage.removeItem('authToken');
  }
};

const defaultFetchOptions: RequestInit = {
  headers: {
    'Content-Type': 'application/json'
  }
};

export const getStoredToken = () => {
  const token = localStorage.getItem('authToken');
  if (token) {
    setAuthToken(token);
  }
  return token;
};

const getAuthHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = { ...defaultFetchOptions.headers as Record<string, string> };
  const token = authToken || getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export async function getShares(
  search?: string, 
  detectionType?: DetectionType,
  filterType?: 'hostname' | 'share_name' | 'all',
  filterValue?: string,
  sessionId?: string,
  page?: number,
  limit?: number
): Promise<Share[]> {
  const params = new URLSearchParams();
  
  if (search) {
    params.append('search', search);
  }
  
  if (detectionType && detectionType !== 'all') {
    params.append('detection_type', detectionType);
  }

  if (filterType && filterType !== 'all' && filterValue) {
    params.append('filter_type', filterType);
    params.append('filter_value', filterValue);
  }

  if (sessionId && sessionId !== 'all') {
    params.append('session_id', sessionId);
  }

  if (page !== undefined) {
    params.append('page', page.toString());
  }
  if (limit !== undefined) {
    params.append('limit', limit.toString());
  }
  
  console.log('Fetching shares with params:', Object.fromEntries(params));
  const response = await fetch(`${API_BASE}/shares?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    console.error('Failed to fetch shares:', await response.text());
    throw new Error('Failed to fetch shares');
  }
  
  const data = await response.json();
  console.log(`Found ${data.length} shares`);
  return data;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export async function getSensitiveFiles(
  shareId: number,
  page = 1,
  limit = 20,
  detectionType?: DetectionType
): Promise<{ data: SensitiveFile[]; pagination: { total: number; page: number; limit: number } }> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  if (detectionType) {
    params.append('detection_type', detectionType);
  }

  console.log(`Fetching sensitive files for share ${shareId}:`, 
    Object.fromEntries(params.entries())
  );

  const response = await fetch(`${API_BASE}/shares/${shareId}/sensitive-files?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    console.error('Failed to fetch sensitive files:', await response.text());
    throw new Error('Failed to fetch sensitive files');
  }
  
  const data = await response.json();
  console.log(`Found ${data.pagination.total} sensitive files for share ${shareId}`);
  
  return data;
}

interface ShareStats {
  uniqueShares: number;
  totalShares: number;
  uniqueSensitiveFiles: number;
  totalSensitiveFiles: number;
  uniqueHiddenFiles: number;
  totalHiddenFiles: number;
  riskScore: number;
}

export async function getShareStats(): Promise<ShareStats> {
  const response = await fetch(`${API_BASE}/stats`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch stats');
  return response.json();
}

interface Directory {
  id: number;
  share_id: number;
  path: string;
  name: string;
  created_at: string;
}

export async function getShareDirectories(
  shareId: number,
  page = 1,
  limit = 100
): Promise<PaginatedResponse<Directory>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/shares/${shareId}/directories?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch directories');
  return response.json();
}

export async function getShareDetails(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/shares/details?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch share details');
  return response.json();
}

export async function getSensitiveFileDetails(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/sensitive-files/details?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch sensitive file details');
  return response.json();
}

export async function getHiddenFileStats(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/shares/hidden-stats?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch hidden file stats');
  return response.json();
}

export async function getRecentScans(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/scans/recent?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch recent scans');
  return response.json();
}

export async function getActivities(
  page = 1,
  limit = 5
): Promise<PaginatedResponse<Activity>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE}/activities?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch activities');
  return response.json();
}

interface RootFile {
  id: number;
  share_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  attributes: string[];
  created_time: string;
  modified_time: string;
}

export async function getRootFiles(
  shareId: number,
  page = 1,
  limit = 20
): Promise<PaginatedResponse<RootFile>> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  console.log(`Fetching root files for share ${shareId}:`, 
    Object.fromEntries(params.entries())
  );

  const response = await fetch(`${API_BASE}/shares/${shareId}/root-files?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    console.error('Failed to fetch root files:', await response.text());
    throw new Error('Failed to fetch root files');
  }
  
  const data = await response.json();
  console.log(`Found ${data.pagination.total} root files for share ${shareId}`);
  
  return data;
}

interface TrendData {
  date: string;
  credential: number;
  pii: number;
  financial: number;
  hr: number;
  security: number;
  sensitive: number;
}

export async function getDetectionTrends(): Promise<TrendData[]> {
  const response = await fetch(`${API_BASE}/trends/detections`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    console.error('Failed to fetch detection trends:', await response.text());
    throw new Error('Failed to fetch detection trends');
  }
  
  return response.json();
}

interface ScanSession {
  id: number;
  domain: string;
  start_time: string;
  end_time: string | null;
  total_hosts: number;
  total_shares: number;
  total_sensitive_files: number;
  scan_status: 'running' | 'completed' | 'failed';
}

export async function getScanSessions(): Promise<ScanSession[]> {
  const response = await fetch(`${API_BASE}/scan-sessions`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    console.error('Failed to fetch scan sessions:', await response.text());
    throw new Error('Failed to fetch scan sessions');
  }
  
  return response.json();
}

interface FileChange {
  file_name: string;
  file_path: string;
  old_detection_type: string | null;
  new_detection_type: string | null;
  change_type: 'added' | 'removed' | 'modified';
}

interface ShareDifference {
  hostname: string;
  share_name: string;
  session1_access_level: string;
  session2_access_level: string;
  session1_sensitive_files: number;
  session2_sensitive_files: number;
  session1_hidden_files: number;
  session2_hidden_files: number;
  session1_total_files: number;
  session2_total_files: number;
  change_type: 'added' | 'removed' | 'modified';
  file_changes?: FileChange[];
}

interface ScanComparison {
  sessions: ScanSession[];
  differences: ShareDifference[];
  summary: {
    total_differences: number;
    added: number;
    removed: number;
    modified: number;
    files_added: number;
    files_removed: number;
    files_modified: number;
  };
}

export async function compareScanSessions(
  sessionId1: number, 
  sessionId2: number
): Promise<ScanComparison> {
  const response = await fetch(
    `${API_BASE}/scan-sessions/compare?session1=${sessionId1}&session2=${sessionId2}`, {
      ...defaultFetchOptions,
      headers: getAuthHeaders()
    }
  );
  
  if (!response.ok) {
    console.error('Failed to compare sessions:', await response.text());
    throw new Error('Failed to compare sessions');
  }
  
  return response.json();
}

interface ShareStructure {
  files: {
    id: number;
    file_name: string;
    file_path: string;
    is_sensitive: boolean;
    detection_types: string[];
    file_size: number;
    created_time: string;
  }[];
  total_files: number;
  total_sensitive: number;
}

export async function getShareStructure(
  shareId: number,
  page = 1,
  limit = 10
): Promise<ShareStructure> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  const response = await fetch(`${API_BASE}/shares/${shareId}/structure?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch share structure');
  return response.json();
}

interface Activity {
  type: string;
  message: string;
  details: string;
  severity: string;
  location: string;
}

export async function postActivity(activity: Activity): Promise<void> {
  const response = await fetch(`${API_BASE}/activities`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });

  if (!response.ok) {
    throw new Error('Failed to post activity');
  }
}

export async function getSensitivePatterns(): Promise<SensitivePattern[]> {
  console.log('Fetching patterns from:', `${API_BASE}/settings/sensitive-patterns`);
  const response = await fetch(`${API_BASE}/settings/sensitive-patterns`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) {
    console.error('Failed to fetch patterns:', await response.text());
    throw new Error('Failed to fetch sensitive patterns');
  }
  const data = await response.json();
  console.log('Received patterns:', data);
  return data;
}

export async function addSensitivePattern(pattern: Pick<SensitivePattern, 'pattern' | 'type' | 'description'>): Promise<SensitivePattern> {
  const response = await fetch(`${API_BASE}/settings/sensitive-patterns`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to add sensitive pattern');
  return response.json();
}

export async function updateSensitivePattern(
  id: number,
  pattern: Pick<SensitivePattern, 'pattern' | 'type' | 'description' | 'enabled'>
): Promise<SensitivePattern> {
  const response = await fetch(`${API_BASE}/settings/sensitive-patterns/${id}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to update sensitive pattern');
  return response.json();
}

export async function deleteSensitivePattern(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/settings/sensitive-patterns/${id}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete sensitive pattern');
}

interface ExportOptions {
  sessionId: number;
  includeSensitive: boolean;
  includeRoot: boolean;
  includeShares: boolean;
}

export async function exportData(options: ExportOptions): Promise<void> {
  const params = new URLSearchParams({
    session_id: options.sessionId.toString(),
    include_sensitive: options.includeSensitive.toString(),
    include_root: options.includeRoot.toString(),
    include_shares: options.includeShares.toString(),
  });

  const response = await fetch(`${API_BASE}/export?${params}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    throw new Error('Failed to export data');
  }

  // Trigger file download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `export_${options.sessionId}_${new Date().toISOString()}.zip`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

export async function login(credentials: { username: string; password: string }): Promise<{ user: User; token: string }> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    ...defaultFetchOptions,
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(credentials)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Login failed');
  }

  const data = await response.json();
  setAuthToken(data.token);
  return data;
}

export async function register(data: RegisterData): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) throw new Error('Registration failed');
  return response.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, {
    ...defaultFetchOptions,
    method: 'POST',
    headers: getAuthHeaders()
  });
  setAuthToken(null);
}

export async function checkAuth(): Promise<{ isAuthenticated: boolean; user: User | null }> {
  try {
    if (!authToken) {
      return { isAuthenticated: false, user: null };
    }

    const response = await fetch(`${API_BASE}/auth/status`, {
      ...defaultFetchOptions,
      headers: getAuthHeaders()
    });
    
    if (!response.ok) {
      setAuthToken(null);
      return { isAuthenticated: false, user: null };
    }
    
    const data = await response.json();
    return {
      isAuthenticated: Boolean(data.isAuthenticated),
      user: data.user
    };
  } catch (error) {
    console.error('Auth check error:', error);
    setAuthToken(null);
    return { isAuthenticated: false, user: null };
  }
}

export async function checkSetupStatus(): Promise<{ isCompleted: boolean }> {
  const response = await fetch(`${API_BASE}/setup/status`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to check setup status');
  return response.json();
}

export async function setup(data: { 
  admin: {
    username: string;
    email: string;
    password: string;
  };
  azure: {
    clientId: string;
    tenantId: string;
    clientSecret: string;
    redirectUri: string;
    isEnabled: boolean;
    allowedGroups: string;
  };
}): Promise<{ user: User }> {
  const response = await fetch(`${API_BASE}/setup`, {
    ...defaultFetchOptions,
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(data)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Setup failed');
  }
  
  return response.json();
}

interface AzureConfig {
  isEnabled: boolean;
  clientId?: string;
  tenantId?: string;
  redirectUri?: string;
  allowedGroups?: string;
}

export async function getAzureConfig(): Promise<AzureConfig> {
  const response = await fetch(`${API_BASE}/auth/azure/config`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch Azure configuration');
  return response.json();
}

export const loginWithAzure = async (accessToken: string) => {
  const response = await fetch(`${API_BASE}/auth/azure/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessToken })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Azure login failed');
  }

  const data = await response.json();
  setAuthToken(data.token);
  return data;
};

export async function handleAzureCallback(code: string): Promise<{ user: User; token: string }> {
  const response = await fetch(`${API_BASE}/auth/azure/callback?code=${code}`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Azure authentication failed');
  }

  const data = await response.json();
  setAuthToken(data.token);
  return data;
}

interface StoredCredential {
  id: number;
  domain: string;
  username: string;
  dc_ip: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export async function getStoredCredentials(): Promise<StoredCredential[]> {
  const response = await fetch(`${API_BASE}/settings/credentials`, {
    ...defaultFetchOptions,
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to fetch stored credentials');
  return response.json();
}

export async function addStoredCredential(credential: Pick<StoredCredential, 'domain' | 'username' | 'dc_ip' | 'description'>): Promise<StoredCredential> {
  const response = await fetch(`${API_BASE}/settings/credentials`, {
    ...defaultFetchOptions,
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(credential)
  });
  if (!response.ok) throw new Error('Failed to add credential');
  return response.json();
}

export async function deleteStoredCredential(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/settings/credentials/${id}`, {
    ...defaultFetchOptions,
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  if (!response.ok) throw new Error('Failed to delete credential');
}