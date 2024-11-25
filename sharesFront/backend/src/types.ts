export interface Share {
  id: number;
  hostname: string;
  share_name: string;
  access_level: string;
  error_message: string | null;
  total_files: number;
  total_dirs: number;
  hidden_files: number;
  scan_time: Date;
}

export interface SensitiveFile {
  id: number;
  share_id: number;
  file_path: string;
  file_name: string;
  detection_type: string;
  created_at: Date;
}

export interface RootFile {
  id: number;
  share_id: number;
  file_name: string;
  file_type: string;
  file_size: bigint;
  attributes: string[];
  created_time: Date;
  modified_time: Date;
}

export interface SharePermission {
  id: number;
  share_id: number;
  permission: string;
}

export interface Activity {
  id: number;
  type: 'sensitive' | 'scan' | 'access' | 'alert' | 'info';
  message: string;
  details: string;
  location: string;
  timestamp: string;
  severity: 'high' | 'medium' | 'low' | 'info';
}

export type DetectionType = 'Password' | 'PII' | 'Config' | 'Key' | 'Certificate';

export interface ScanSession {
  id: number;
  domain: string;
  start_time: Date;
  end_time: Date | null;
  total_hosts: number;
  total_shares: number;
  total_sensitive_files: number;
  scan_status: 'running' | 'completed' | 'failed';
}

export interface ScanDiff {
  summary: {
    session1: ScanSession;
    session2: ScanSession;
    added_shares: number;
    removed_shares: number;
    added_sensitive_files: number;
    removed_sensitive_files: number;
  };
  changes: {
    shares: {
      added: Share[];
      removed: Share[];
      modified: Array<{
        share: Share;
        changes: {
          field: string;
          old_value: any;
          new_value: any;
        }[];
      }>;
    };
    sensitive_files: {
      added: Array<SensitiveFile & { share_name: string; hostname: string }>;
      removed: Array<SensitiveFile & { share_name: string; hostname: string }>;
    };
  };
} 