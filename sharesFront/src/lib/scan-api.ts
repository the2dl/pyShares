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
    total_shares?: number;
    total_sensitive?: number;
  };
  results?: {
    total_shares: number;
    total_hosts: number;
    total_sensitive: number;
  };
  error?: string;
}

interface ScheduleConfig {
  trigger_type: 'cron';
  schedule_config: {
    day_of_week: string;
    hour: number;
    minute: number;
  };
}

interface ScheduleResponse {
  status: string;
  job_id?: string;
  next_run?: string;
  error?: string;
}

interface ScheduledJob {
  id: string;
  name: string;
  trigger: string;
  next_run: string | null;
  args: any[];
  kwargs: any;
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
        dc: credentials.dc,
        domain: credentials.domain,
        username: credentials.username,
        password: credentials.password,
        ldap_port: credentials.ldap_port ?? 389,
        threads: credentials.threads ?? 10,
        ou: credentials.ou,
        filter: credentials.filter ?? 'all',
        batch_size: credentials.batch_size ?? 1000,
        max_depth: credentials.max_depth ?? 5,
        scan_timeout: credentials.scan_timeout ?? 30,
        host_timeout: credentials.host_timeout ?? 300,
        max_computers: credentials.max_computers ?? 800000,
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

export async function createSchedule(
  credentials: ScanCredentials, 
  scheduleConfig: ScheduleConfig
): Promise<ScheduleResponse> {
  try {
    const response = await fetchWithRetry(`${SCAN_API_BASE}/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dc: credentials.dc,
        domain: credentials.domain,
        username: credentials.username,
        password: credentials.password,
        ldap_port: credentials.ldap_port ?? 389,
        threads: credentials.threads ?? 10,
        ou: credentials.ou,
        filter: credentials.filter ?? 'all',
        batch_size: credentials.batch_size ?? 1000,
        max_depth: credentials.max_depth ?? 5,
        scan_timeout: credentials.scan_timeout ?? 30,
        host_timeout: credentials.host_timeout ?? 300,
        max_computers: credentials.max_computers ?? 800000,
        
        trigger_type: scheduleConfig.trigger_type,
        schedule_config: scheduleConfig.schedule_config,
        name: `Scheduled Scan - ${credentials.domain}`
      }),
    });

    return response.json();
  } catch (error) {
    console.error('Schedule API error:', error);
    throw error;
  }
}

export async function getSchedules(): Promise<ScheduledJob[]> {
  try {
    const response = await fetchWithRetry(`${SCAN_API_BASE}/schedules`);
    return response.json();
  } catch (error) {
    console.error('Get schedules error:', error);
    throw error;
  }
}

export async function deleteSchedule(jobId: string): Promise<ScheduleResponse> {
  try {
    const response = await fetchWithRetry(`${SCAN_API_BASE}/schedule/${jobId}`, {
      method: 'DELETE',
    });
    return response.json();
  } catch (error) {
    console.error('Delete schedule error:', error);
    throw error;
  }
}

export function subscribeToEvents(callback: (event: any) => void) {
  console.log('Subscribing to events...');
  let eventSource: EventSource | null = null;
  let retryCount = 0;
  const MAX_RETRIES = 5;
  const RETRY_DELAY = 5000;

  const connect = () => {
    if (eventSource) {
      eventSource.close();
    }

    eventSource = new EventSource(`${SCAN_API_BASE}/events`);
    
    console.log('EventSource created, readyState:', eventSource.readyState);

    eventSource.onmessage = (event) => {
      console.log('Received event:', event.data, 'readyState:', eventSource?.readyState);
      try {
        const data = JSON.parse(event.data);
        if (data.type !== 'heartbeat') {  // Only process non-heartbeat events
          callback(data);
        }
      } catch (error) {
        console.error('Failed to parse event data:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('EventSource failed:', error, 'readyState:', eventSource?.readyState);
      eventSource?.close();
      
      // Always try to reconnect
      setTimeout(connect, RETRY_DELAY);
    };

    eventSource.onopen = () => {
      console.log('EventSource connection opened, readyState:', eventSource?.readyState);
      retryCount = 0;
    };
  };

  connect();

  // Set up periodic connection check
  const connectionCheck = setInterval(() => {
    if (!eventSource || eventSource.readyState === EventSource.CLOSED) {
      console.log('Connection check: reconnecting...');
      connect();
    }
  }, 30000);

  return () => {
    if (eventSource) {
      console.log('Closing event subscription, final readyState:', eventSource.readyState);
      eventSource.close();
    }
    clearInterval(connectionCheck);
  };
} 