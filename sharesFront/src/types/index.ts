export type DetectionType = string;

export interface Share {
  id: number;
  hostname: string;
  shareName: string;
  accessLevel: 'Read' | 'Write' | 'Full' | 'Denied';
  errorMessage: string | null;
  totalFiles: number;
  totalDirs: number;
  hiddenFiles: number;
  scanTime: string;
  sensitive_file_count: number;
}

export interface SensitiveFile {
  id: number;
  shareId: number;
  filePath: string;
  fileName: string;
  detectionType: DetectionType;
  createdAt: string;
}

export interface RootFile {
  id: number;
  shareId: number;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  createdAt: string;
  modifiedAt: string;
}

export interface ShareStats {
  totalShares: number;
  totalSensitiveFiles: number;
  totalHiddenFiles: number;
  riskScore: number;
  recentScans: number;
  totalFindings?: number;
}

export interface SensitivePattern {
  id: number;
  pattern: string;
  type: string;
  description: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}