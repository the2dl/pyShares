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
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle } from "lucide-react";

interface SetupData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface AzureConfig {
  clientId: string;
  tenantId: string;
  clientSecret: string;
  redirectUri: string;
  isEnabled: boolean;
}

const AzureSetupHelp: React.FC = () => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="ghost" size="icon" className="h-8 w-8">
        <HelpCircle className="h-4 w-4" />
        <span className="sr-only">Azure AD Setup Help</span>
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Azure AD Setup Guide</DialogTitle>
        <DialogDescription>
          Follow these steps to configure Azure AD authentication:
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <ol className="list-decimal list-inside space-y-3">
          <li>Go to Azure Portal &gt; Azure AD &gt; Enterprise Applications</li>
          <li>Click "Create new" and select "Register an application"</li>
          <li>Name your application (e.g., "FileShare Scanner")</li>
          <li>Configure the redirect URL:
            <div className="mt-2 p-2 bg-muted rounded-md font-mono text-sm">
              {`${import.meta.env.VITE_API_URL}/auth/azure/callback`}
            </div>
          </li>
          <li>After creation, collect these values from the Overview page:
            <ul className="list-disc list-inside ml-4 mt-2 space-y-2">
              <li>Application (client) ID</li>
              <li>Directory (tenant) ID</li>
            </ul>
          </li>
          <li>Generate a client secret:
            <ul className="list-disc list-inside ml-4 mt-2">
              <li>Go to "Certificates & secrets"</li>
              <li>Create "New client secret"</li>
              <li>Copy the secret value immediately (it won't be shown again)</li>
            </ul>
          </li>
        </ol>
      </div>
      <div className="bg-muted p-4 rounded-md mt-4">
        <p className="text-sm font-medium">Important Notes:</p>
        <ul className="list-disc list-inside text-sm mt-2 space-y-1">
          <li>Store your client secret securely - it cannot be retrieved later</li>
          <li>Update the redirect URL if your API endpoint changes</li>
          <li>Ensure your Azure AD tenant allows the application access</li>
        </ul>
      </div>
    </DialogContent>
  </Dialog>
);

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
  const [step, setStep] = useState<number>(1);
  const [azureConfig, setAzureConfig] = useState<AzureConfig>({
    clientId: '',
    tenantId: '',
    clientSecret: '',
    redirectUri: `${import.meta.env.VITE_API_URL}/auth/azure/callback`,
    isEnabled: false
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
    setLoading(true);

    if (step === 1) {
      if (data.password !== data.confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      setStep(2);
      setLoading(false);
      return;
    }

    try {
      const response = await setup({
        admin: {
          username: data.username,
          email: data.email,
          password: data.password
        },
        azure: azureConfig
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
    } finally {
      setLoading(false);
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
              <div className="flex justify-between mb-8">
                <div className={`flex-1 text-center pb-2 border-b-2 transition-colors ${
                  step === 1 ? 'border-primary text-primary' : 'border-muted text-muted-foreground'
                }`}>
                  {/* ... step indicator content ... */}
                </div>
                <div className={`flex-1 text-center pb-2 border-b-2 transition-colors ${
                  step === 2 ? 'border-primary text-primary' : 'border-muted text-muted-foreground'
                }`}>
                  {/* ... step indicator content ... */}
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="mb-6">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </div>
                </Alert>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {step === 1 ? (
                  <>
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
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between space-x-2 mb-6">
                      <div className="flex items-center space-x-2">
                        <Label htmlFor="azure-enabled">Enable Azure AD Authentication</Label>
                        <AzureSetupHelp />
                      </div>
                      <Switch
                        id="azure-enabled"
                        checked={azureConfig.isEnabled}
                        onCheckedChange={(checked) => 
                          setAzureConfig(prev => ({ ...prev, isEnabled: checked }))
                        }
                      />
                    </div>

                    {azureConfig.isEnabled && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="azure-clientId">Client ID</Label>
                          <Input
                            id="azure-clientId"
                            name="azure-clientId"
                            placeholder="Enter Azure AD Client ID"
                            value={azureConfig.clientId}
                            onChange={(e) => setAzureConfig(prev => ({ ...prev, clientId: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="azure-tenantId">Tenant ID</Label>
                          <Input
                            id="azure-tenantId"
                            name="azure-tenantId"
                            placeholder="Enter Azure AD Tenant ID"
                            value={azureConfig.tenantId}
                            onChange={(e) => setAzureConfig(prev => ({ ...prev, tenantId: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="azure-clientSecret">Client Secret</Label>
                          <Input
                            id="azure-clientSecret"
                            name="azure-clientSecret"
                            type="password"
                            placeholder="Enter Azure AD Client Secret"
                            value={azureConfig.clientSecret}
                            onChange={(e) => setAzureConfig(prev => ({ ...prev, clientSecret: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="azure-redirectUri">Redirect URI</Label>
                          <Input
                            id="azure-redirectUri"
                            name="azure-redirectUri"
                            placeholder="Enter Azure AD Redirect URI"
                            value={azureConfig.redirectUri}
                            onChange={(e) => setAzureConfig(prev => ({ ...prev, redirectUri: e.target.value }))}
                            required
                          />
                        </div>
                      </>
                    )}
                  </>
                )}

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Setting up...' : step === 1 ? 'Next' : 'Complete Setup'}
                </Button>

                {step === 2 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => setStep(1)}
                  >
                    Back
                  </Button>
                )}
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