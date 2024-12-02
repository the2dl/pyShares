import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSetupStatus, setup } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';

interface SetupData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export function SetupWizard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    setError('');

    if (data.password !== data.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const response = await setup({
        username: data.username,
        email: data.email,
        password: data.password,
      });
      
      if (response.user) {
        toast({
          title: "Success",
          description: "Setup completed successfully. Redirecting to dashboard...",
        });
        navigate('/');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Setup failed');
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to complete setup",
      });
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData(prev => ({ ...prev, [name]: value }));
  };

  return (
    <ThemeProvider>
      <div className="container relative flex h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-1 lg:px-0">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[450px]">
          <Card>
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold tracking-tight text-center">
                Welcome to FileShare Scanner
              </CardTitle>
              <CardDescription className="text-center">
                Let's set up your admin account
              </CardDescription>
            </CardHeader>

            <CardContent className="pt-6">
              {error && (
                <Alert variant="destructive" className="mb-6">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </div>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input
                    id="username"
                    name="username"
                    placeholder="Enter admin username"
                    value={data.username}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="Enter admin email"
                    value={data.email}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    placeholder="Create a secure password"
                    value={data.password}
                    onChange={handleInputChange}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    name="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={data.confirmPassword}
                    onChange={handleInputChange}
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Setting up...' : 'Complete Setup'}
                </Button>
              </form>
            </CardContent>

            <CardFooter className="text-sm text-muted-foreground text-center">
              This is a one-time setup process to configure FileShare Scanner
            </CardFooter>
          </Card>
        </div>
      </div>
    </ThemeProvider>
  );
} 