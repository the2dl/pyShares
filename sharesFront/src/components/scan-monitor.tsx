import { useEffect } from 'react';
import { useAtom } from 'jotai';
import { activeScanAtom, scanStatusAtom } from './dashboard/quick-actions';
import { pollScanStatus } from '@/lib/scan-api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';

export function ScanMonitor() {
  const [activeScanId] = useAtom(activeScanAtom);
  const [, setScanStatus] = useAtom(scanStatusAtom);
  const { toast } = useToast();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    if (activeScanId) {
      cleanup = pollScanStatus(activeScanId, (status) => {
        setScanStatus(status);
        
        if (status.status === 'completed' || status.status === 'failed') {
          // Show system notification with appropriate icon
          if (Notification.permission === 'granted') {
            new Notification(
              status.status === 'completed' ? 'Scan Completed' : 'Scan Failed',
              {
                body: status.status === 'completed' 
                  ? 'Network scan has finished successfully'
                  : status.error || "An error occurred during the scan"
              }
            );
          }

          // Show persistent toast notification with Lucide icons
          toast({
            title: (
              <div className="flex items-center gap-2">
                {status.status === 'completed' 
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <AlertCircle className="h-5 w-5 text-red-500" />
                }
                {status.status === 'completed' ? 'Scan Completed' : 'Scan Failed'}
              </div>
            ),
            description: status.status === 'completed'
              ? 'Network scan has finished successfully'
              : status.error || "An error occurred during the scan",
            variant: status.status === 'completed' ? 'default' : 'destructive',
            duration: Infinity,
            action: (
              <Button 
                variant="outline" 
                size="icon"
                onClick={() => document.querySelector(`[data-toast-id]`)?.remove()}
              >
                <X className="h-4 w-4" />
              </Button>
            ),
          });
        }
      });
    }

    return () => {
      if (cleanup && typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, [activeScanId]);

  return null;
} 