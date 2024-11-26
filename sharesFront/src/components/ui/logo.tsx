import { Network, Share2, Shield } from 'lucide-react';

export function Logo() {
  return (
    <div className="relative flex items-center">
      <Network className="h-6 w-6 text-primary" />
      <Share2 className="absolute left-3 h-4 w-4 text-primary opacity-70" />
      <Shield className="absolute left-4 h-3 w-3 text-primary opacity-40" />
    </div>
  );
}