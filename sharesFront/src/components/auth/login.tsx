import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { login, checkSetupStatus, getAzureConfig, loginWithAzure, handleAzureCallback } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useAuth } from './auth-provider';
import { useToast } from "@/hooks/use-toast";
import { PublicClientApplication, EventType } from '@azure/msal-browser';
import { Logo } from '@/components/ui/logo';

export function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setupCompleted, setSetupCompleted] = useState<boolean | null>(null);
  const [azureConfig, setAzureConfig] = useState<AzureConfig | null>(null);
  const [msalInstance, setMsalInstance] = useState<PublicClientApplication | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
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

  useEffect(() => {
    // Load Azure configuration
    const loadAzureConfig = async () => {
      try {
        const config = await getAzureConfig();
        setAzureConfig(config);
        
        if (config.isEnabled && config.clientId && config.tenantId) {
          const msalConfig = {
            auth: {
              clientId: config.clientId,
              authority: `https://login.microsoftonline.com/${config.tenantId}`,
              redirectUri: window.location.origin,
              postLogoutRedirectUri: window.location.origin,
              navigateToLoginRequestUrl: true
            },
            cache: {
              cacheLocation: 'sessionStorage',
              storeAuthStateInCookie: false
            }
          };
          
          const msalInstance = new PublicClientApplication(msalConfig);
          await msalInstance.initialize();
          setMsalInstance(msalInstance);
        }
      } catch (error) {
        console.error('Failed to load Azure config:', error);
      }
    };
    loadAzureConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const { user, token } = await login({ username, password });
      
      if (user) {
        toast({
          title: "Login Successful",
          description: `Welcome back, ${user.username}!`,
        });
        
        navigate('/', { replace: true });
      } else {
        setError('Invalid username or password');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : "An error occurred during login");
      
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: error instanceof Error ? error.message : "An error occurred during login",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAzureLogin = async () => {
    if (!msalInstance) return;
    
    try {
      console.log('Starting Azure login...');
      const response = await msalInstance.loginPopup({
        scopes: ['openid', 'profile', 'email', 'User.Read'],
        prompt: 'select_account'
      });

      console.log('Azure login response:', response);
      
      if (response?.accessToken) {
        try {
          console.log('Sending token to backend...');
          const { user } = await loginWithAzure(response.accessToken);
          
          if (user) {
            toast({
              title: "Login Successful",
              description: `Welcome back, ${user.username}!`,
            });
            navigate('/', { replace: true });
          }
        } catch (error) {
          console.error('Backend login failed:', error);
          toast({
            variant: "destructive",
            title: "Login Failed",
            description: "Failed to authenticate with the server",
          });
        }
      }
    } catch (error) {
      console.error('Azure login failed:', error);
      toast({
        variant: "destructive",
        title: "Login Failed",
        description: error instanceof Error ? error.message : "Failed to login with Microsoft",
      });
    }
  };

  return (
    <div className="container relative flex h-screen flex-col items-center justify-center md:grid lg:max-w-none lg:grid-cols-1 lg:px-0">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <Card>
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center gap-2 mb-2">
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.15 8.72-7 9.82-3.85-1.1-7-5.3-7-9.82V8l7-3.82z"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M12 7L8 11l4 4 4-4-4-4z"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <CardTitle className="text-2xl font-semibold tracking-tight">
                ShareSentry
              </CardTitle>
            </div>
            <CardDescription>
              Enter your credentials to access ShareSentry
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
            
            {azureConfig?.isEnabled && (
              <>
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue with
                    </span>
                  </div>
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleAzureLogin}
                >
                  <svg
                    className="mr-2 h-4 w-4"
                    aria-hidden="true"
                    focusable="false"
                    data-prefix="fab"
                    data-icon="microsoft"
                    role="img"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 448 448"
                  >
                    <path
                      fill="currentColor"
                      d="M0 32h214.6v214.6H0V32zm233.4 0H448v214.6H233.4V32zM0 265.4h214.6V480H0V265.4zm233.4 0H448V480H233.4V265.4z"
                    />
                  </svg>
                  Sign in with Microsoft
                </Button>
              </>
            )}
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <div className="text-sm text-muted-foreground text-center">
              ShareSentry Admin Portal
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
} 