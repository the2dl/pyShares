const SCAN_API_BASE = import.meta.env.VITE_SCAN_API_URL || 'http://localhost:5000/api';
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000; // 2 seconds

interface ScanCredentials {
  dc: string;
  domain: string;
  username: string;
  password: string;
  ldap_port?: number;
  threads?: number;
  ou?: string;
  filter?: string;
  batch_size?: number;
  max_depth?: number;
  scan_timeout?: number;
  host_timeout?: number;
  max_computers?: number;
}

interface ScanResponse {
  scan_id: string;
  status: string;
  message?: string;
}

interface ScanStatus {
  status: 'running' | 'completed' | 'failed';
  progress?: {
    total_hosts?: number;
    processed_hosts?: number;
    current_host?: string;
  };
  error?: string;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options?: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  try {
    const response = await fetch(url, options);
    if (response.ok) {
      return response;
    }
    
    // Only retry on specific status codes
    if (response.status === 404 && retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    
    throw new Error(`HTTP error! status: ${response.status}`);
  } catch (error) {
    if (retries > 0) {
      await delay(RETRY_DELAY);
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

export async function startScan(credentials: ScanCredentials): Promise<ScanResponse> {
  try {
    const response = await fetchWithRetry(`${SCAN_API_BASE}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...credentials,
        ldap_port: credentials.ldap_port || 389,
        threads: credentials.threads || 10,
        filter: credentials.filter || 'all',
        batch_size: credentials.batch_size || 1000,
        max_depth: credentials.max_depth || 5,
        scan_timeout: credentials.scan_timeout || 30,
        host_timeout: credentials.host_timeout || 300,
        max_computers: credentials.max_computers || 800000,
      }),
    });

    return response.json();
  } catch (error) {
    console.error('Scan API error:', error);
    throw error;
  }
}

export async function getScanStatus(scanId: string): Promise<ScanResponse> {
  try {
    const response = await fetch(`${SCAN_API_BASE}/scan/${scanId}`);

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || 'Failed to get scan status');
    }

    return response.json();
  } catch (error) {
    console.error('Scan API error:', error);
    throw error;
  }
}

export async function pollScanStatus(scanId: string, onUpdate: (status: ScanStatus) => void) {
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 3;
  
  const pollInterval = setInterval(async () => {
    try {
      const response = await fetch(`${SCAN_API_BASE}/scan/${scanId}`);
      
      if (!response.ok) {
        consecutiveErrors++;
        
        if (response.status === 404) {
          console.warn(`Scan ${scanId} not found`);
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            clearInterval(pollInterval);
            onUpdate({
              status: 'failed',
              error: 'Scan not found or expired'
            });
          }
          return;
        }
        
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Reset error counter on successful response
      consecutiveErrors = 0;
      const data: ScanStatus = await response.json();
      
      onUpdate(data);
      
      if (data.status === 'completed' || data.status === 'failed') {
        clearInterval(pollInterval);
      }
    } catch (error) {
      console.error('Failed to poll scan status:', error);
      consecutiveErrors++;
      
      // Only stop polling if we've had too many consecutive errors
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        clearInterval(pollInterval);
        onUpdate({
          status: 'failed',
          error: 'Connection to scan service lost'
        });
      }
    }
  }, 5000); // Poll every 5 seconds

  return () => clearInterval(pollInterval);
} 