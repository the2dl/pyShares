import { ReactNode, createContext, useContext, useState, useEffect } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { checkAuth, checkSetupStatus } from '@/lib/api';
import type { User } from '@/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider() {
  const navigate = useNavigate();
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthContextType>({
    user: null,
    isAuthenticated: false,
    loading: true,
  });

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        // First check if system is set up
        const setupStatus = await checkSetupStatus();
        
        if (!setupStatus.isCompleted && location.pathname !== '/setup') {
          navigate('/setup');
          return;
        }

        // Check auth status
        const { isAuthenticated, user } = await checkAuth();
        console.log('Auth check result:', { isAuthenticated, user });
        setAuthState({ user, isAuthenticated, loading: false });

        // If not authenticated and not on auth pages, redirect to login
        const isAuthPage = ['/login', '/register', '/setup'].includes(location.pathname);
        if (!isAuthenticated && !isAuthPage) {
          navigate('/login', { state: { from: location.pathname } });
        } else if (isAuthenticated && isAuthPage && location.pathname !== '/setup') {
          // If authenticated and on an auth page, redirect to home
          const from = location.state?.from || '/';
          navigate(from);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        setAuthState({ user: null, isAuthenticated: false, loading: false });
      }
    };

    checkAuthStatus();
  }, [navigate, location]);

  if (authState.loading) {
    return <div>Loading...</div>; // Or your loading component
  }

  return (
    <AuthContext.Provider value={authState}>
      <Outlet />
    </AuthContext.Provider>
  );
} 