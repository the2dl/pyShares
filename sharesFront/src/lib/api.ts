const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export async function getShares(
  search?: string, 
  detectionType?: DetectionType,
  filterType?: 'hostname' | 'share_name',
  filterValue?: string
): Promise<Share[]> {
  const params = new URLSearchParams();
  
  if (search) {
    params.append('search', search);
  }
  
  if (detectionType) {
    params.append('detection_type', detectionType);
  }

  if (filterType && filterValue) {
    params.append('filter_type', filterType);
    params.append('filter_value', filterValue);
  }
  
  console.log('Fetching shares with params:', Object.fromEntries(params));
  const response = await fetch(`${API_BASE}/shares?${params}`);
  
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

  const response = await fetch(`${API_BASE}/shares/${shareId}/sensitive-files?${params}`);
  
  if (!response.ok) {
    console.error('Failed to fetch sensitive files:', await response.text());
    throw new Error('Failed to fetch sensitive files');
  }
  
  const data = await response.json();
  console.log(`Found ${data.pagination.total} sensitive files for share ${shareId}`);
  
  return data;
}

interface ShareStats {
  totalShares: number;
  totalSensitiveFiles: number;
  totalHiddenFiles: number;
  riskScore: number;
  recentScans: number;
}

export async function getShareStats(): Promise<ShareStats> {
  const response = await fetch(`${API_BASE}/stats`);
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
  
  const response = await fetch(`${API_BASE}/shares/${shareId}/directories?${params}`);
  if (!response.ok) throw new Error('Failed to fetch directories');
  return response.json();
}

export async function getShareDetails(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/shares/details?${params}`);
  if (!response.ok) throw new Error('Failed to fetch share details');
  return response.json();
}

export async function getSensitiveFileDetails(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/sensitive-files/details?${params}`);
  if (!response.ok) throw new Error('Failed to fetch sensitive file details');
  return response.json();
}

export async function getHiddenFileStats(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/shares/hidden-stats?${params}`);
  if (!response.ok) throw new Error('Failed to fetch hidden file stats');
  return response.json();
}

export async function getRecentScans(page = 1, limit = 20) {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString()
  });
  
  const response = await fetch(`${API_BASE}/scans/recent?${params}`);
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

  const response = await fetch(`${API_BASE}/activities?${params}`);
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

  const response = await fetch(`${API_BASE}/shares/${shareId}/root-files?${params}`);
  
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
  const response = await fetch(`${API_BASE}/trends/detections`);
  
  if (!response.ok) {
    console.error('Failed to fetch detection trends:', await response.text());
    throw new Error('Failed to fetch detection trends');
  }
  
  return response.json();
} 