import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ShareStats } from '@/types';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Loader2, Folder, Monitor, Database } from 'lucide-react';
import {
  getShareDetails,
  getSensitiveFileDetails,
  getHiddenFileStats,
  getRecentScans
} from '@/lib/api';

const ITEMS_PER_PAGE = 20;

interface StatsDetailsDialogProps {
  activeStat: 'shares' | 'sensitive' | 'hidden' | 'risk' | 'findings' | null;
  onClose: () => void;
  stats: ShareStats;
}

const getAccessLevelColor = (accessLevel: string) => {
  switch (accessLevel?.toLowerCase()) {
    case 'full':
      return 'bg-red-500 dark:bg-red-900';
    case 'write':
      return 'bg-yellow-500 dark:bg-yellow-900';
    case 'read':
      return 'bg-green-500 dark:bg-green-900';
    default:
      return 'bg-gray-500 dark:bg-gray-900';
  }
};

export function StatsDetailsDialog({
  activeStat,
  onClose,
  stats,
}: StatsDetailsDialogProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!activeStat) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        let response;
        switch (activeStat) {
          case 'shares':
            response = await getShareDetails(currentPage);
            break;
          case 'sensitive':
            response = await getSensitiveFileDetails(currentPage);
            break;
          case 'hidden':
            response = await getHiddenFileStats(currentPage);
            break;
          case 'findings':
            response = await getRecentScans(currentPage);
            break;
          default:
            return;
        }
        setData(response.data);
        setTotalPages(response.pagination.totalPages);
      } catch (err) {
        console.error('Failed to fetch data:', err);
        setError('Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [activeStat, currentPage]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!activeStat) {
      setCurrentPage(1);
      setData(null);
      setError(null);
    }
  }, [activeStat]);

  const paginateData = <T,>(data: T[]): T[] => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return data.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  };

  const renderPagination = (totalItems: number) => {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) return null;

    const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    const visiblePages = pages.slice(
      Math.max(0, currentPage - 2),
      Math.min(totalPages, currentPage + 1)
    );

    return (
      <Pagination className="mt-4">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
            />
          </PaginationItem>

          {currentPage > 2 && (
            <>
              <PaginationItem>
                <PaginationLink onClick={() => setCurrentPage(1)}>1</PaginationLink>
              </PaginationItem>
              {currentPage > 3 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
            </>
          )}

          {visiblePages.map((page) => (
            <PaginationItem key={page}>
              <PaginationLink
                onClick={() => setCurrentPage(page)}
                isActive={currentPage === page}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}

          {currentPage < totalPages - 1 && (
            <>
              {currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                <PaginationLink onClick={() => setCurrentPage(totalPages)}>
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            </>
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className={
                currentPage === totalPages ? 'pointer-events-none opacity-50' : ''
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  const getDialogContent = () => {
    if (loading) {
      return {
        title: 'Loading...',
        description: 'Fetching data',
        content: (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ),
      };
    }

    if (error) {
      return {
        title: 'Error',
        description: 'Failed to load data',
        content: (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {error}
          </div>
        ),
      };
    }

    switch (activeStat) {
      case 'shares':
        return {
          title: 'Network Shares Overview',
          description: 'Detailed list of all accessible network shares',
          content: (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Share</TableHead>
                    <TableHead className="text-right">Total Files</TableHead>
                    <TableHead className="text-right">Hidden Files</TableHead>
                    <TableHead className="text-right">Sensitive Files</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((share: any) => (
                    <TableRow key={share.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{share.hostname}</span>
                          <span className="text-sm text-muted-foreground">
                            {share.share_name}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {share.total_files.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={
                          share.hidden_files > 0 ? 'bg-yellow-500' : 'bg-green-500'
                        }>
                          {share.hidden_files.toLocaleString()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={
                          share.sensitive_file_count > 0 ? 'bg-red-500' : 'bg-green-500'
                        }>
                          {share.sensitive_file_count.toLocaleString()}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {renderPagination(totalPages)}
            </>
          ),
        };

      case 'sensitive':
        return {
          title: 'Sensitive Files Details',
          description: 'List of detected sensitive files across all shares',
          content: (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Detected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((file: any) => (
                    <TableRow key={file.id}>
                      <TableCell className="font-medium">
                        {file.file_name}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          <Monitor className="h-4 w-4 text-muted-foreground" />
                          <span>{file.hostname}</span>
                          <span className="text-muted-foreground">/</span>
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <span>{file.share_name}</span>
                          <span className="text-muted-foreground">/</span>
                          <Folder className="h-4 w-4 text-muted-foreground" />
                          <span className="text-primary">{file.file_path}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            file.detection_type === 'Password'
                              ? 'bg-red-500'
                              : file.detection_type === 'PII'
                              ? 'bg-yellow-500'
                              : 'bg-blue-500'
                          }
                        >
                          {file.detection_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(file.created_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {renderPagination(totalPages)}
            </>
          ),
        };

      case 'hidden':
        return {
          title: 'Hidden Files Analysis',
          description: 'Overview of hidden files and potential security risks',
          content: (
            <div className="space-y-6">
              <div className="rounded-lg border p-4">
                <h4 className="font-semibold">Distribution by Share</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Share</TableHead>
                      <TableHead className="text-right">Hidden Files</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.map((share: any) => (
                      <TableRow key={share.id}>
                        <TableCell>
                          {share.hostname}/{share.share_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {share.hidden_files.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {share.hidden_percentage}%
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {renderPagination(totalPages)}
              </div>
            </div>
          ),
        };

      case 'risk':
        return {
          title: 'Security Risk Assessment',
          description: 'Detailed breakdown of security risk factors',
          content: (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border p-4">
                  <h4 className="mb-2 font-semibold">Risk Factors</h4>
                  <ul className="space-y-2">
                    <li className="flex items-center justify-between">
                      <span>Sensitive File Exposure</span>
                      <Badge 
                        variant="secondary" 
                        className={`${
                          stats.totalSensitiveFiles > 100
                            ? 'bg-red-500 text-white'
                            : stats.totalSensitiveFiles > 50
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                        }`}
                      >
                        {stats.totalSensitiveFiles > 100 ? 'High' : stats.totalSensitiveFiles > 50 ? 'Medium' : 'Low'}
                      </Badge>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Access Control</span>
                      <Badge 
                        variant="secondary" 
                        className={`${
                          stats.riskScore > 75
                            ? 'bg-red-500 text-white'
                            : stats.riskScore > 50
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                        }`}
                      >
                        {stats.riskScore > 75 ? 'High' : stats.riskScore > 50 ? 'Medium' : 'Low'}
                      </Badge>
                    </li>
                    <li className="flex items-center justify-between">
                      <span>Hidden File Risk</span>
                      <Badge 
                        variant="secondary" 
                        className={`${
                          stats.totalHiddenFiles > 1000
                            ? 'bg-red-500 text-white'
                            : stats.totalHiddenFiles > 500
                            ? 'bg-yellow-500 text-white'
                            : 'bg-green-500 text-white'
                        }`}
                      >
                        {stats.totalHiddenFiles > 1000 ? 'High' : stats.totalHiddenFiles > 500 ? 'Medium' : 'Low'}
                      </Badge>
                    </li>
                  </ul>
                </div>
                <div className="rounded-lg border p-4">
                  <h4 className="mb-2 font-semibold">Overall Risk Score</h4>
                  <div className={`text-4xl font-bold mb-4 ${
                    stats.riskScore > 75
                      ? 'text-red-500 dark:text-red-400'
                      : stats.riskScore > 50
                      ? 'text-yellow-500 dark:text-yellow-400'
                      : 'text-green-500 dark:text-green-400'
                  }`}>
                    {stats.riskScore}%
                  </div>
                  <h4 className="mb-2 font-semibold">Recommendations</h4>
                  <ul className="list-disc space-y-2 pl-4 text-sm">
                    {stats.riskScore > 75 ? (
                      <>
                        <li className="text-red-600 dark:text-red-400">Immediate action required!</li>
                        <li>Review and revoke excessive access permissions</li>
                        <li>Implement strict file access auditing</li>
                        <li>Encrypt all sensitive data at rest</li>
                      </>
                    ) : stats.riskScore > 50 ? (
                      <>
                        <li className="text-yellow-600 dark:text-yellow-400">Action recommended</li>
                        <li>Review full access permissions on sensitive shares</li>
                        <li>Implement file access auditing</li>
                        <li>Consider encrypting sensitive data</li>
                      </>
                    ) : (
                      <>
                        <li className="text-green-600 dark:text-green-400">Good security posture</li>
                        <li>Continue regular security assessment scans</li>
                        <li>Monitor for changes in access patterns</li>
                        <li>Maintain current security controls</li>
                      </>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ),
        };

      case 'findings':
        return {
          title: 'Recent Security Findings',
          description: 'Overview of recent security findings across all scans',
          content: (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Share</TableHead>
                    <TableHead>Scan Time</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Findings</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.map((scan: any) => (
                    <TableRow key={scan.id}>
                      <TableCell className="font-medium">
                        {scan.hostname}/{scan.share_name}
                      </TableCell>
                      <TableCell>
                        {format(new Date(scan.scan_time), 'PPp')}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            scan.error_message ? 'bg-yellow-500' : 'bg-green-500'
                          }
                        >
                          {scan.error_message ? 'Partial' : 'Complete'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {scan.issues_found.toLocaleString()} issues
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {renderPagination(totalPages)}
            </>
          ),
        };

      default:
        return null;
    }
  };

  const dialogContent = getDialogContent();

  return (
    <Dialog open={activeStat !== null} onOpenChange={() => onClose()}>
      {dialogContent && (
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{dialogContent.title}</DialogTitle>
            <DialogDescription>{dialogContent.description}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="p-4">{dialogContent.content}</div>
          </ScrollArea>
        </DialogContent>
      )}
    </Dialog>
  );
}