import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { ThemeProvider } from './context/ThemeContext';
import {WishlistProvider } from './context/WishlistContext';
 
import ErrorBoundary from './components/ErrorBoundary';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import PageTransition from './components/PageTransition';
import Preloader from './components/Preloader';

import { usePageTracker } from './hooks/usePageTracker';
import useScrollToTop from './hooks/useScrollToTop';

// Pages
import Home from './pages/Home';
import Shop from './pages/Shop';
import Customize from './pages/Customize';
import Cart from './pages/Cart';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';
import SplitPosters from './pages/SplitPosters';
import BulkInquiry from './pages/BulkInquiry';
import BulkInquiryForm from './pages/Bulkinquiryform ';
import AuthCallback from './pages/AuthCallback';
import Reviews from './pages/Reviews ';
import SetPassword from './pages/SetPassword';
import ForgotPassword from './pages/ForgotPassword';
import MetallicPosters from './pages/Metallicposters ';
import Help from './pages/Help';
import Frames from './pages/Frames';
import Payment from "./pages/Payment";


const ProtectedRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user) return <Navigate to="/" />;

  return <>{children}</>;
};


const AdminRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;

  if (!user) return <Navigate to="/" />;

  if (!user.is_admin) return <Navigate to="/dashboard" />;

  return <>{children}</>;
};


function AppContent() {
  usePageTracker();
  useScrollToTop();

  return (
    <div className="flex flex-col min-h-screen">

      <Navbar />

      <main className="flex-grow">

        <PageTransition>

          <Routes>

            <Route
              path="/bulk-inquiry"
              element={<BulkInquiry />}
            />

            <Route
              path="/bulk-inquiry/form"
              element={<BulkInquiryForm />}
            />

            <Route
              path="/"
              element={<Home />}
            />

            <Route
              path="/collection"
              element={<Shop />}
            />

            <Route
              path="/shop"
              element={<Navigate to="/collection" />}
            />

            <Route
              path="/customize"
              element={<Customize />}
            />

            <Route
              path="/story"
              element={<Navigate to="/" />}
            />

            <Route
              path="/help"
              element={<Help />}
            />

            <Route
              path="/split-posters"
              element={<SplitPosters />}
            />

            <Route
              path="/reviews"
              element={<Reviews />}
            />

            <Route
              path="/frames"
              element={<Frames />}
            />

            <Route
              path="/faqs"
              element={<Help />}
            />

            <Route
              path="/metalic-posters"
              element={<MetallicPosters />}
            />

            <Route
              path="/cart"
              element={<Cart />}
            />

            <Route
              path="/login"
              element={<Login />}
            />

            <Route
              path="/signup"
              element={<Signup />}
            />

            <Route
              path="/auth/callback"
              element={<AuthCallback />}
            />

            <Route
              path="/set-password"
              element={<SetPassword />}
            />

            <Route
              path="/forgot-password"
              element={<ForgotPassword />}
            />

            <Route path="/payment" element={<Payment />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />

            <Route
              path="*"
              element={<Navigate to="/" />}
            />

          </Routes>

        </PageTransition>

      </main>

      <Footer />

    </div>
  );
}


export default function App() {

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {

    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500);

    return () => clearTimeout(timer);

  }, []);


  return (
    <ErrorBoundary>

      <ThemeProvider>

        <AuthProvider>

          <CartProvider>
            <WishlistProvider>

            <Router>

              <Preloader isLoading={isLoading} />

              <AppContent />

            </Router>
            </WishlistProvider>

          </CartProvider>

        </AuthProvider>

      </ThemeProvider>

    </ErrorBoundary>
  );
}