import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import Settings from './pages/Settings';
import Dashboard from './pages/Dashboard';
import Estimates from './pages/Estimates';
import Orders from './pages/Orders';
import Reps from './pages/Reps';
import Calculator from './pages/Calculator';
import Login from './pages/Login';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError } = useAuth();
  const isLoginRoute = typeof window !== 'undefined' && window.location.pathname === '/login';

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-border border-t-foreground rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors — but let /login render so reps can sign in.
  if (authError && !isLoginRoute) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      const from = encodeURIComponent(window.location.pathname + window.location.search);
      return <Navigate to={`/login?from=${from}`} replace />;
    }
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Portal opens on the Dashboard for both admins and reps. The Configurator
          has its own /configurator path. The auto-registered routes below remain
          so existing deep-links keep working. */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/configurator" element={<LayoutWrapper currentPageName="Calculator"><Calculator /></LayoutWrapper>} />
      <Route path="/settings" element={<LayoutWrapper currentPageName="Settings"><Settings /></LayoutWrapper>} />
      <Route path="/dashboard" element={<LayoutWrapper currentPageName="Dashboard"><Dashboard /></LayoutWrapper>} />
      <Route path="/estimates" element={<LayoutWrapper currentPageName="Estimates"><Estimates /></LayoutWrapper>} />
      <Route path="/orders" element={<LayoutWrapper currentPageName="Orders"><Orders /></LayoutWrapper>} />
      <Route path="/reps" element={<LayoutWrapper currentPageName="Reps"><Reps /></LayoutWrapper>} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="bottom-left" richColors closeButton />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App