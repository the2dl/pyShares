import { Share, SensitiveFile, ShareStats, RootFile } from '@/types';

export const mockShares: Share[] = [
  {
    id: 1,
    hostname: 'DC01.contoso.local',
    shareName: 'Finance',
    accessLevel: 'Write',
    errorMessage: null,
    totalFiles: 15234,
    totalDirs: 456,
    hiddenFiles: 23,
    scanTime: '2024-03-20T10:30:00Z',
  },
  {
    id: 2,
    hostname: 'FS01.contoso.local',
    shareName: 'HR',
    accessLevel: 'Full',
    errorMessage: null,
    totalFiles: 8976,
    totalDirs: 234,
    hiddenFiles: 12,
    scanTime: '2024-03-20T11:15:00Z',
  },
  {
    id: 3,
    hostname: 'APP02.contoso.local',
    shareName: 'Public',
    accessLevel: 'Read',
    errorMessage: 'Partial scan completed',
    totalFiles: 3421,
    totalDirs: 89,
    hiddenFiles: 5,
    scanTime: '2024-03-20T09:45:00Z',
  },
];

export const mockSensitiveFiles: SensitiveFile[] = [
  {
    id: 1,
    shareId: 1,
    filePath: '\\Finance\\2024\\Q1',
    fileName: 'passwords.xlsx',
    detectionType: 'Password',
    createdAt: '2024-03-20T10:31:00Z',
  },
  {
    id: 2,
    shareId: 2,
    filePath: '\\HR\\Employees',
    fileName: 'employee_data.csv',
    detectionType: 'PII',
    createdAt: '2024-03-20T11:16:00Z',
  },
];

export const mockRootFiles: RootFile[] = [
  {
    id: 1,
    shareId: 1,
    fileName: 'database_backup.bak',
    filePath: '\\',
    fileSizeBytes: 5368709120, // 5GB
    createdAt: '2024-03-19T00:00:00Z',
    modifiedAt: '2024-03-20T00:00:00Z',
  },
  {
    id: 2,
    shareId: 1,
    fileName: 'large_export.zip',
    filePath: '\\',
    fileSizeBytes: 2147483648, // 2GB
    createdAt: '2024-03-18T00:00:00Z',
    modifiedAt: '2024-03-18T12:00:00Z',
  },
  {
    id: 3,
    shareId: 2,
    fileName: 'employee_photos.zip',
    filePath: '\\',
    fileSizeBytes: 1073741824, // 1GB
    createdAt: '2024-03-17T00:00:00Z',
    modifiedAt: '2024-03-17T12:00:00Z',
  },
];

export const mockStats: ShareStats = {
  totalShares: 156,
  totalSensitiveFiles: 423,
  totalHiddenFiles: 89,
  riskScore: 78,
  recentScans: 34,
};