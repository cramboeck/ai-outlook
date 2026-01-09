import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { msalConfig } from './config/msalConfig';
import { Layout } from './components/layout/Layout';
import { Landing } from './pages/Landing';
import { Dashboard } from './pages/Dashboard';
import { MailClient } from './pages/MailClient';
import { Settings } from './pages/Settings';
import { AdminConsent } from './pages/AdminConsent';
import { Onboarding } from './pages/Onboarding';
import { ToastProvider } from './components/ui/Toast';
import { Privacy } from './pages/Privacy';
import { Terms } from './pages/Terms';

// Initialize MSAL
const msalInstance = new PublicClientApplication(msalConfig);

// Initialize React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      retry: 1,
    },
  },
});

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  return (
    <>
      <AuthenticatedTemplate>{children}</AuthenticatedTemplate>
      <UnauthenticatedTemplate>
        <Navigate to="/" replace />
      </UnauthenticatedTemplate>
    </>
  );
};

function App() {
  return (
    <MsalProvider instance={msalInstance}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
            {/* Public landing page */}
            <Route path="/" element={<Landing />} />

            {/* Admin consent callback (public) */}
            <Route path="/admin-consent" element={<AdminConsent />} />

            {/* Legal pages (public) */}
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />

            {/* Onboarding (protected, no layout) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            {/* Protected routes with layout */}
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/mail" element={<MailClient />} />
              <Route path="/inbox" element={<Navigate to="/mail" replace />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            {/* Fallback redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </MsalProvider>
  );
}

export default App;
