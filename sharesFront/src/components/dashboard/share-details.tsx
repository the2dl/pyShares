import { Share, SensitiveFile, DetectionType } from '@/types';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  FileWarning,
  FolderTree,
  History,
  Shield,
  AlertTriangle,
  File,
  Server,
  Loader2,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useState, useEffect } from 'react';
import { getSensitiveFiles, getRootFiles } from '@/lib/api';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ShareDetailsProps {
  share: Share | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchQuery: string;
  detectionFilter: DetectionType | 'all';
}

function formatFileSize(bytes: number | string): string {
  const size = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  
  if (isNaN(size) || size === null) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let convertedSize = size;
  let unitIndex = 0;

  while (convertedSize >= 1024 && unitIndex < units.length - 1) {
    convertedSize /= 1024;
    unitIndex++;
  }

  return `${convertedSize.toFixed(2)} ${units[unitIndex]}`;
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

const getAccessLevelBadge = (level: string) => {
  const levelConfig: Record<string, { color: string; description: string }> = {
    'Access Denied': { 
      color: 'bg-gray-600', 
      description: 'No access permitted' 
    },
    'Read Only': { 
      color: 'bg-green-600', 
      description: 'Read-only access to files and folders' 
    },
    'Read/Write': { 
      color: 'bg-yellow-500', 
      description: 'Can read and modify files' 
    },
    'Full Access': { 
      color: 'bg-red-600', 
      description: 'Complete access - High risk' 
    },
    'List': { 
      color: 'bg-blue-600', 
      description: 'Can only list directory contents' 
    },
    'Special': { 
      color: 'bg-purple-600', 
      description: 'Custom permissions set' 
    }
  };

  const config = levelConfig[level] || { 
    color: 'bg-gray-400', 
    description: `Unknown access level: ${level}` 
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Badge variant="secondary" className={`${config.color} text-white`}>
            {level}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {config.description}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export function ShareDetails({
  share,
  open,
  onOpenChange,
  searchQuery,
  detectionFilter,
}: ShareDetailsProps) {
  const [rootFiles, setRootFiles] = useState<RootFile[]>([]);
  const [sensitiveFiles, setSensitiveFiles] = useState<SensitiveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSensitive, setLoadingSensitive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSensitive, setErrorSensitive] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sensitivePage, setSensitivePage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [hasMoreSensitive, setHasMoreSensitive] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('root');

  // Fetch root files
  useEffect(() => {
    if (!share?.id || !open) return;

    const fetchRootFiles = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getRootFiles(share.id, page, 20);
        
        if (page === 1) {
          setRootFiles(response.data);
        } else {
          setRootFiles(prev => [...prev, ...response.data]);
        }
        
        setHasMore(response.pagination.page < response.pagination.totalPages);
      } catch (err) {
        console.error('Failed to fetch root files:', err);
        setError('Failed to load files');
      } finally {
        setLoading(false);
      }
    };

    fetchRootFiles();
  }, [share?.id, open, page]);

  // Fetch sensitive files
  useEffect(() => {
    if (!share?.id || !open) return;

    const fetchSensitiveFiles = async () => {
      try {
        setLoadingSensitive(true);
        setErrorSensitive(null);
        const response = await getSensitiveFiles(share.id, sensitivePage, 20, detectionFilter);
        
        if (sensitivePage === 1) {
          setSensitiveFiles(response.data);
        } else {
          setSensitiveFiles(prev => [...prev, ...response.data]);
        }
        
        setHasMoreSensitive(response.pagination.page < response.pagination.totalPages);
      } catch (err) {
        console.error('Failed to fetch sensitive files:', err);
        setErrorSensitive('Failed to load sensitive files');
      } finally {
        setLoadingSensitive(false);
      }
    };

    fetchSensitiveFiles();
  }, [share?.id, open, sensitivePage, detectionFilter]);

  // Reset state when share changes or drawer closes
  useEffect(() => {
    if (!open) {
      setPage(1);
      setSensitivePage(1);
      setRootFiles([]);
      setSensitiveFiles([]);
      setError(null);
      setErrorSensitive(null);
      setHasMore(true);
      setHasMoreSensitive(true);
    }
  }, [open, share?.id]);

  // Update the tab when data changes
  useEffect(() => {
    if (!loading && !loadingSensitive) {
      const newTab = sensitiveFiles.length === 0 && rootFiles.length > 0 ? 'root' : 'sensitive';
      setActiveTab(newTab);
    }
  }, [loading, loadingSensitive, rootFiles.length, sensitiveFiles.length]);

  if (!share) return null;

  const getAttributesBadge = (attributes: string[]) => {
    const color = attributes.includes('hidden') || attributes.includes('system') 
      ? 'bg-yellow-500' 
      : attributes.includes('readonly')
      ? 'bg-blue-500'
      : 'bg-green-500';
    
    return <Badge variant="secondary" className={color}>{attributes.join(', ')}</Badge>;
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[800px] sm:w-[900px] sm:max-w-full">
        <ScrollArea className="h-[calc(100vh-80px)] pr-4">
          <SheetHeader className="pb-4">
            <SheetTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              {share.hostname}
            </SheetTitle>
            <SheetDescription>
              Share: <span className="font-medium">{share.share_name}</span>
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-6">
            {/* Overview stats */}
            <div className="grid gap-2">
              <div className="flex items-center space-x-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {share.total_dirs.toLocaleString()} Directories
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <File className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {share.total_files.toLocaleString()} Files
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Access Level: {getAccessLevelBadge(share.access_level)}</span>
              </div>
              <div className="flex items-center space-x-2">
                <History className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  Last Scan: {format(new Date(share.scan_time), 'PPp')}
                </span>
              </div>
            </div>

            <Separator />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <TabsTrigger 
                        value="root" 
                        className="flex items-center gap-2 w-full"
                        disabled={!loading && rootFiles.length === 0}
                        data-state={activeTab === 'root' ? 'active' : 'inactive'}
                      >
                        <File className="h-4 w-4" />
                        Root Files
                        {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                      </TabsTrigger>
                    </TooltipTrigger>
                    {!loading && rootFiles.length === 0 && (
                      <TooltipContent>
                        No root files found in this share
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
                <TabsTrigger 
                  value="sensitive" 
                  className="flex items-center gap-2"
                  data-state={activeTab === 'sensitive' ? 'active' : 'inactive'}
                >
                  <FileWarning className="h-4 w-4" />
                  Sensitive Files
                  {loadingSensitive && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="root" className="mt-4">
                {error ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    {error}
                  </div>
                ) : rootFiles.length === 0 && !loading ? (
                  <p className="text-sm text-muted-foreground">
                    No files found
                  </p>
                ) : (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Size</TableHead>
                            <TableHead>Attributes</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead>Modified</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rootFiles.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center space-x-2">
                                  <File className="h-4 w-4 text-muted-foreground" />
                                  <span>{file.file_name}</span>
                                </div>
                              </TableCell>
                              <TableCell>{file.file_type}</TableCell>
                              <TableCell>{formatFileSize(file.file_size)}</TableCell>
                              <TableCell>{getAttributesBadge(file.attributes)}</TableCell>
                              <TableCell>{format(new Date(file.created_time), 'MMM d, yyyy HH:mm')}</TableCell>
                              <TableCell>{format(new Date(file.modified_time), 'MMM d, yyyy HH:mm')}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {hasMore && (
                      <button
                        onClick={() => setPage(p => p + 1)}
                        disabled={loading}
                        className="mt-4 w-full rounded-md border p-2 text-sm text-muted-foreground hover:bg-accent"
                      >
                        {loading ? (
                          <div className="flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="ml-2">Loading...</span>
                          </div>
                        ) : (
                          'Load More'
                        )}
                      </button>
                    )}
                  </>
                )}
              </TabsContent>

              <TabsContent value="sensitive" className="mt-4">
                {errorSensitive ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                    {errorSensitive}
                  </div>
                ) : sensitiveFiles.length === 0 && !loadingSensitive ? (
                  <p className="text-sm text-muted-foreground">
                    No sensitive files found
                  </p>
                ) : (
                  <>
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Path</TableHead>
                            <TableHead>Types</TableHead>
                            <TableHead>Detection Time</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sensitiveFiles.map((file) => (
                            <TableRow key={file.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center space-x-2">
                                  <FileWarning className="h-4 w-4 text-yellow-500" />
                                  <span>{file.file_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">
                                {file.file_path}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {(Array.isArray(file.detection_types) 
                                    ? file.detection_types 
                                    : typeof file.detection_types === 'string' 
                                      ? JSON.parse(file.detection_types) 
                                      : []
                                  ).map((type: string) => (
                                    <Badge key={type} variant="outline">
                                      {type}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {format(new Date(file.created_at), 'MMM d, yyyy HH:mm')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {hasMoreSensitive && (
                      <button
                        onClick={() => setSensitivePage(p => p + 1)}
                        disabled={loadingSensitive}
                        className="mt-4 w-full rounded-md border p-2 text-sm text-muted-foreground hover:bg-accent"
                      >
                        {loadingSensitive ? (
                          <div className="flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="ml-2">Loading...</span>
                          </div>
                        ) : (
                          'Load More Sensitive Files'
                        )}
                      </button>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}