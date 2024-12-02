import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { register, checkSetupStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';

interface SetupData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function SetupWizard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SetupData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  
  const navigate = useNavigate();

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const status = await checkSetupStatus();
        if (status.isCompleted) {
          navigate('/login');
        }
      } catch (error) {
        console.error('Failed to check setup status:', error);
      }
    };
    
    checkSetup();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (data.password !== data.confirmPassword) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Passwords don't match",
      });
      return;
    }

    setLoading(true);
    try {
      await register({
        username: data.username,
        email: data.email,
        password: data.password,
      });
      toast({
        title: "Success",
        description: "Your admin account has been created. Please log in.",
      });
      navigate('/login');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to create admin account",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemeProvider>
      <div className="min-h-screen flex flex-col items-center justify-center">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <Card className="w-[400px]">
          <CardHeader>
            <CardTitle>Initial Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="username">Admin Username</label>
                <Input
                  id="username"
                  value={data.username}
                  onChange={(e) => setData(prev => ({ ...prev, username: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="email">Admin Email</label>
                <Input
                  id="email"
                  type="email"
                  value={data.email}
                  onChange={(e) => setData(prev => ({ ...prev, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password">Password</label>
                <Input
                  id="password"
                  type="password"
                  value={data.password}
                  onChange={(e) => setData(prev => ({ ...prev, password: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="confirmPassword">Confirm Password</label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={data.confirmPassword}
                  onChange={(e) => setData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full"
                disabled={loading}
              >
                {loading ? 'Setting up...' : 'Complete Setup'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </ThemeProvider>
  );
} 