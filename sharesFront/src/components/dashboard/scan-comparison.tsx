import { ScanDiff } from '@/components/dashboard/scan-diff';

export function ScanComparisonPage() {
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Scan Comparison</h1>
      <ScanDiff />
    </div>
  );
}