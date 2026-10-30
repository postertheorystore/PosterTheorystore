import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'otp' | 'reset'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const navigate = useNavigate();

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setMessage(res.data.message);
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 'otp') {
      setStep('reset');
      return;
    }
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/auth/reset-password', { email, code: otp, password });
      setMessage(res.data.message);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setMessage('');
    try {
      const res = await api.post('/api/auth/forgot-password', { email });
      setMessage(res.data.message);
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
        <div className="text-center mb-12 relative z-10">
          <p className="text-[10px] font-mono font-bold text-z-ink uppercase mb-4 tracking-[0.4em] underline leading-none decoration-2">
            {step === 'email' ? 'ACCOUNT_RECOVERY' : step === 'otp' ? 'VERIFY_IDENTITY' : 'NEW_PASSWORD'}
          </p>
          <h1 className="font-display font-black text-5xl uppercase tracking-tighter   leading-none text-z-ink">
            {step === 'email' ? <>FORGOT_<span className=" ">PWD</span></> : step === 'otp' ? <>ENTER_<span className=" ">OTP</span></> : <>RESET_<span className=" ">PWD</span></>}
          </h1>
        </div>

        {error && <div className="bg-red-50 text-red-600 p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-8 border-2 border-red-300 text-center">{error}</div>}
        {message && <div className="bg-green-50 text-green-800 p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-8 border-2 border-green-300 text-center">{message}</div>}

        {step === 'email' && (
          <form onSubmit={handleSendOtp} className="space-y-8 relative z-10">
            <p className="text-[11px] font-mono text-z-muted uppercase text-center leading-relaxed">
              Enter your email and we'll send a verification code if the account exists.
            </p>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">EMAIL</label>
              <input
                required type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold uppercase tracking-tight"
                placeholder="YOU@GMAIL.COM"
              />
            </div>
            <button type="submit" disabled={loading} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
              {loading ? 'SENDING...' : 'SEND CODE'}
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form onSubmit={handleVerifyAndReset} className="space-y-8 relative z-10">
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
            <button type="submit" disabled={otp.length !== 6} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
              VERIFY
            </button>
            <button type="button" onClick={handleResend} className="w-full text-center text-[11px] font-mono font-bold text-z-muted uppercase tracking-widest hover:text-z-ink transition-all">
              RESEND CODE
            </button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleVerifyAndReset} className="space-y-8 relative z-10">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">NEW PASSWORD</label>
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
            <div>
              <label className="text-[10px] font-mono uppercase tracking-[0.3em] text-z-muted mb-2 block font-black">CONFIRM PASSWORD</label>
              <div className="relative">
                <input
                  required type={showConfirm ? 'text' : 'password'} value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-transparent border-b-2 border-z-border py-3 text-sm text-z-ink focus:outline-none focus:border-z-ink transition-all font-display font-bold pr-10"
                  placeholder="••••••••"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-0 top-1/2 -translate-y-1/2 text-z-muted hover:text-z-ink transition-colors">
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="sticker-btn w-full py-5 text-lg bg-z-ink text-white">
              {loading ? 'RESETTING...' : 'RESET PASSWORD'}
            </button>
          </form>
        )}

        <div className="mt-10 text-center relative z-10">
          <p className="text-[11px] font-mono font-bold text-z-muted uppercase tracking-widest">
            Remember it? <Link to="/login" className="text-z-ink underline decoration-2 underline-offset-4 hover:bg-z-ink hover:text-white transition-all">Sign In</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
