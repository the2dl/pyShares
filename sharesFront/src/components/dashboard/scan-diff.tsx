import { useState, useEffect, Fragment } from 'react';
import { getScanSessions, compareScanSessions } from '@/lib/api';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
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
import { Loader2, Plus, Minus, FileEdit, Server, Database } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

interface ScanSession {
  id: number;
  start_time: string;
  end_time: string;
  total_hosts: number;
  total_shares: number;
  total_sensitive_files: number;
  scan_status: string;
}

export function ScanDiff() {
  const [sessions, setSessions] = useState<ScanSession[]>([]);
  const [session1, setSession1] = useState<string>('');
  const [session2, setSession2] = useState<string>('');
  const [diffData, setDiffData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        const data = await getScanSessions();
        setSessions(data.filter(s => s.scan_status === 'completed'));
      } catch (error) {
        console.error('Failed to fetch sessions:', error);
      }
    };
    fetchSessions();
  }, []);

  const handleCompare = async () => {
    if (!session1 || !session2) return;
    
    setLoading(true);
    try {
      const data = await compareScanSessions(
        parseInt(session1), 
        parseInt(session2)
      );
      setDiffData(data);
    } catch (error) {
      console.error('Failed to compare sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSession1('');
    setSession2('');
    setDiffData(null);
  };

  const getChangeTypeIcon = (changeType: string) => {
    switch (changeType) {
      case 'added':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'removed':
        return <Minus className="h-4 w-4 text-red-500" />;
      case 'modified':
        return <FileEdit className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getChangeTypeBadge = (changeType: string) => {
    const variants = {
      added: 'bg-green-500',
      removed: 'bg-red-500',
      modified: 'bg-yellow-500',
    };
    return (
      <Badge variant="secondary" className={variants[changeType as keyof typeof variants]}>
        {changeType}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scan Comparison</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex gap-4">
            <Select value={session1} onValueChange={setSession1}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select first scan" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id.toString()}>
                    {format(new Date(session.start_time), 'PPpp')} 
                    ({session.total_shares} shares)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={session2} onValueChange={setSession2}>
              <SelectTrigger className="w-[300px]">
                <SelectValue placeholder="Select second scan" />
              </SelectTrigger>
              <SelectContent>
                {sessions.map((session) => (
                  <SelectItem key={session.id} value={session.id.toString()}>
                    {format(new Date(session.start_time), 'PPpp')}
                    ({session.total_shares} shares)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button 
              onClick={handleCompare}
              disabled={!session1 || !session2 || loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Comparing...
                </>
              ) : (
                'Compare Scans'
              )}
            </Button>

            <Button 
              variant="outline"
              onClick={handleReset}
              disabled={loading}
            >
              Reset
            </Button>
          </div>

          {diffData && (
            <div className="space-y-4">
              {/* Session Summary */}
              <div className="grid grid-cols-2 gap-4">
                {diffData.sessions.map((session: any) => (
                  <Card key={session.id}>
                    <CardContent className="pt-6">
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">
                          {format(new Date(session.start_time), 'PPpp')}
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <div className="text-2xl font-bold">{session.total_hosts}</div>
                            <div className="text-xs text-muted-foreground">Hosts</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold">{session.total_shares}</div>
                            <div className="text-xs text-muted-foreground">Shares</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold">{session.total_sensitive_files}</div>
                            <div className="text-xs text-muted-foreground">Sensitive Files</div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Separator />

              {/* Changes Summary */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold">{diffData.summary.total_differences}</div>
                    <div className="text-xs text-muted-foreground">Total Changes</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-green-500">{diffData.summary.added}</div>
                    <div className="text-xs text-muted-foreground">Added</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-red-500">{diffData.summary.removed}</div>
                    <div className="text-xs text-muted-foreground">Removed</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-2xl font-bold text-yellow-500">{diffData.summary.modified}</div>
                    <div className="text-xs text-muted-foreground">Modified</div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Changes */}
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Change</TableHead>
                      <TableHead>Share Location</TableHead>
                      <TableHead className="text-right">Sensitive Files</TableHead>
                      <TableHead className="text-right">Hidden Files</TableHead>
                      <TableHead className="text-right">Total Files</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diffData.differences.map((diff: any, index: number) => (
                      <Fragment key={index}>
                        <TableRow>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getChangeTypeIcon(diff.change_type)}
                              {getChangeTypeBadge(diff.change_type)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Server className="h-4 w-4 text-muted-foreground" />
                              <span>{diff.hostname}</span>
                              <span className="text-muted-foreground">/</span>
                              <Database className="h-4 w-4 text-muted-foreground" />
                              <span>{diff.share_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            {diff.change_type === 'modified' && (
                              <span className="text-muted-foreground">
                                {diff.session1_sensitive_files} → {diff.session2_sensitive_files}
                              </span>
                            )}
                            {diff.change_type !== 'modified' && diff.session2_sensitive_files}
                          </TableCell>
                          <TableCell className="text-right">
                            {diff.change_type === 'modified' && (
                              <span className="text-muted-foreground">
                                {diff.session1_hidden_files} → {diff.session2_hidden_files}
                              </span>
                            )}
                            {diff.change_type !== 'modified' && diff.session2_hidden_files}
                          </TableCell>
                          <TableCell className="text-right">
                            {diff.change_type === 'modified' && (
                              <span className="text-muted-foreground">
                                {diff.session1_total_files} → {diff.session2_total_files}
                              </span>
                            )}
                            {diff.change_type !== 'modified' && diff.session2_total_files}
                          </TableCell>
                        </TableRow>
                        {diff.file_changes && diff.file_changes.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-muted/50">
                              <div className="pl-8">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Change</TableHead>
                                      <TableHead>File Path</TableHead>
                                      <TableHead>Detection Type</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {diff.file_changes.map((file: any, fileIndex: number) => (
                                      <TableRow key={fileIndex}>
                                        <TableCell>
                                          <div className="flex items-center gap-2">
                                            {getChangeTypeIcon(file.change_type)}
                                            {getChangeTypeBadge(file.change_type)}
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <span className="font-mono text-sm">
                                            {file.file_path}/{file.file_name}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          {file.change_type === 'modified' ? (
                                            <span className="text-muted-foreground">
                                              {file.old_detection_type} → {file.new_detection_type}
                                            </span>
                                          ) : file.change_type === 'added' ? (
                                            file.new_detection_type
                                          ) : (
                                            file.old_detection_type
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
} 