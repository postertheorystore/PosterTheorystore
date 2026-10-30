import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

export default function Signup() {
  const [step, setStep] = useState<'form' | 'otp'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpExhausted, setOtpExhausted] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/signup', { name, email, password });
      setMessage(res.data.message);
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await api.post('/api/auth/verify-otp', { email, code: otp });
      login(res.data.token, res.data.user);
      navigate(redirect);
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.exhausted) setOtpExhausted(true);
      setError(data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setError('');
    setMessage('');
    setOtpExhausted(false);
    setOtp('');
    try {
      await api.post('/api/auth/resend-otp', { email });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-32">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-z-paper p-12 border-2 border-z-border shadow-[16px_16px_0px_0px_rgba(0,0,0,1)] dark:shadow-[16px_16px_0px_0px_rgba(255,255,255,0.2)] relative"
      >
        <div className="tape -top-4 -right-8 w-32 -rotate-12" />
        
        <div className="text-center mb-12 relative z-10">
          <p className="text-[10px] font-mono font-bold text-z-ink uppercase mb-4 tracking-[0.4em] underline leading-none decoration-2">
            {step === 'form' ? 'CREATE_ACCOUNT' : 'VERIFY_EMAIL'}
          </p>
          <h1 className="font-display font-black text-5xl uppercase tracking-tighter  leading-none text-z-ink">
            {step === 'form' ? <>SIGN UP</> : <>ENTER <span className=" ">OTP</span></>}
          </h1>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-8 border-2 border-red-300 text-center">{error}</div>}

        {step === 'form' ? (
          <form onSubmit={handleSignup} className="space-y-8 relative z-10">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">YOUR NAME</label>
              <input 
                required type="text" value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold uppercase tracking-tight"
                placeholder="JOHN DOE"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">EMAIL</label>
              <input 
                required type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold uppercase tracking-tight"
                placeholder="YOU@GMAIL.COM"
              />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">PASSWORD</label>
              <div className="relative">
                <input 
                  required type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold pr-10"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-0 top-1/2 -translate-y-1/2 text-z-muted hover:text-z-ink transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[9px] font-mono text-z-muted mt-2 uppercase">Min 8 chars, 1 uppercase, 1 number, 1 special char</p>
            </div>
            <button type="submit" disabled={loading} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
              {loading ? 'SENDING OTP...' : 'SIGN UP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-8 relative z-10">
            <p className="text-[11px] font-mono text-z-muted uppercase text-center leading-relaxed">
              We sent a 6-digit code to <span className="font-black text-z-ink">{email}</span>
            </p>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">VERIFICATION CODE</label>
              <input 
                required type="text" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                className="w-full bg-transparent border-b-2 border-z-border py-4 text-2xl text-z-ink focus:outline-none focus:border-z-ink transition-all font-mono font-bold text-center tracking-[0.5em]"
                placeholder="000000"
              />
            </div>
            <button type="submit" disabled={loading || otp.length !== 6 || otpExhausted} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
              {loading ? 'VERIFYING...' : 'VERIFY & JOIN'}
            </button>
            <button type="button" onClick={handleResendOtp} className={`w-full text-center text-[11px] font-mono font-bold uppercase tracking-widest transition-all ${otpExhausted ? 'text-red-600 underline decoration-2' : 'text-z-muted hover:text-z-ink'}`}>
              RESEND CODE
            </button>
          </form>
        )}

        <div className="mt-10 text-center relative z-10">
          <p className="text-[11px] font-mono font-bold text-z-muted uppercase tracking-widest">
            Already a member? <Link to="/login" className="text-z-ink underline decoration-2 underline-offset-4 hover:bg-z-ink hover:text-white transition-all">Sign In</Link>
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
              } catch { setError('Failed to initiate Google sign-in'); }
            }}
            className="sticker-btn w-full py-5 text-[11px] bg-z-paper text-z-ink flex items-center justify-center gap-3"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            CONTINUE WITH GOOGLE
          </button>
        </div>
      </motion.div>
    </div>
  );
}
