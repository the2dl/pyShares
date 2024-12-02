import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, checkSetupStatus } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAuth } from './auth-provider';
import { useToast } from "@/hooks/use-toast";

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    // Check setup status when component mounts
    const checkSetup = async () => {
      try {
        const status = await checkSetupStatus();
        console.log('Setup status:', status);
        setSetupCompleted(status.isCompleted);
      } catch (error) {
        console.error('Failed to check setup status:', error);
      }
    };
    checkSetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const result = await login({ username, password });
      if (result.user) {
        window.location.href = '/';
      } else {
        setError('Invalid username or password');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : "An error occurred during login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container relative flex h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-1 lg:px-0">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              Login
            </CardTitle>
            <CardDescription>
              Enter your credentials to access FileShare Scanner
            </CardDescription>
            {setupCompleted === false && (
              <div className="text-sm text-center pt-2">
                <span>Need to set up? </span>
                <Button
                  variant="link"
                  className="px-2 py-0 text-primary"
                  onClick={() => navigate('/register')}
                >
                  Register here
                </Button>
              </div>
            )}
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
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-muted-foreground text-center">
              FileShare Scanner Admin Portal
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 