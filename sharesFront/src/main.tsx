import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { App } from './App.tsx';
import { ScanDiff } from '@/components/dashboard/scan-diff';
import { NetworkMap } from '@/components/dashboard/network-map';
import { Login } from '@/components/auth/login';
import { Register } from '@/components/auth/register';
import { SetupWizard } from '@/components/auth/setup-wizard';
import { AuthProvider } from '@/components/auth/auth-provider';
import './index.css';

const router = createBrowserRouter([
  {
    path: "/",
    element: <AuthProvider />,
    children: [
      {
        path: "login",
        element: <Login />,
      },
      {
        path: "register",
        element: <Register />,
      },
      {
        path: "setup",
        element: <SetupWizard />,
      },
      {
        path: "",
        element: <App />,
      },
      {
        path: "scan-comparison",
        element: <ScanDiff />,
      },
      {
        path: "network-map",
        element: <NetworkMap />,
      },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);