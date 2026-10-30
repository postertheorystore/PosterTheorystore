import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';
  
  const sessionExpired = searchParams.get('expired') === '1';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/login', { email, password });
      login(res.data.token, res.data.user);
      navigate(redirect);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-32">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-z-paper p-12 border-2 border-z-border shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] dark:shadow-[16px_16px_0px_0px_rgba(255,255,255,0.2)] relative overflow-visible"
      >
        <div className="tape -top-6 left-1/2 -translate-x-1/2 w-40 z-20 opacity-50" />
        
        <div className="text-center mb-16 relative z-10">
          <p className="text-[10px] font-mono font-bold text-z-ink uppercase mb-4 tracking-[0.4em] underline leading-none decoration-2">WELCOME BACK</p>
          <h1 className="font-display font-black text-5xl uppercase tracking-tighter   leading-none text-z-ink">SIGN_<span className=" ">IN</span></h1>
        </div>

        {sessionExpired && !error && <div className="bg-yellow-50 text-yellow-700 p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-10 border-2 border-yellow-300 text-center">Session expired. Please sign in again.</div>}

        {error && <div className="bg-red-50 text-red-600 p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-10 border-2 border-red-300 text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-10 relative z-10">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-4 block font-black">EMAIL</label>
            <input 
              required type="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent border-b-2 border-z-border py-4 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold uppercase tracking-tight"
              placeholder="YOU@GMAIL.COM"
            />
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-4 block font-black">PASSWORD</label>
            <div className="relative">
              <input 
                required type={showPassword ? 'text' : 'password'} value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-transparent border-b-2 border-z-border py-4 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold pr-10"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-z-muted hover:text-z-ink transition-colors">
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
            {loading ? 'SIGNING IN...' : 'SIGN IN'}
          </button>
          <div className="text-right">
            <Link to="/forgot-password" className="text-[10px] font-mono font-bold text-z-muted uppercase tracking-widest hover:text-z-ink transition-all">FORGOT PASSWORD?</Link>
          </div>
        </form>

        <div className="mt-12 text-center relative z-10">
          <p className="text-[11px] font-mono font-bold text-z-muted uppercase tracking-widest">
            New here? <Link to={`/signup${redirect !== '/dashboard' ? `?redirect=${encodeURIComponent(redirect)}` : ''}`} className="text-z-ink underline decoration-2 underline-offset-4 hover:bg-z-ink hover:text-white transition-all">Create Account</Link>
          </p>
        </div>

        <div className="mt-8 relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 border-t-2 border-dashed border-z-border"></div>
            <span className="text-[10px] font-mono font-bold text-z-muted uppercase">OR</span>
            <div className="flex-1 border-t-2 border-dashed border-z-border"></div>
          </div>
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await api.get('/api/auth/google');
                window.location.href = res.data.url;
              } catch {
                setError('Failed to initiate Google sign-in');
              }
            }}
            className="sticker-btn w-full py-5 text-[11px] bg-z-paper text-z-ink flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            CONTINUE WITH GOOGLE
          </button>
        </div>

        <div className="absolute -bottom-10 -right-10 w-24 h-24 bg-z-ink rounded-full border-2 border-z-border flex items-center justify-center -rotate-12 z-0">
          <p className="text-z-paper font-mono text-[8px] font-bold uppercase leading-tight text-center">Identity<br/>Verified</p>
        </div>
      </motion.div>
    </div>
  );
}
