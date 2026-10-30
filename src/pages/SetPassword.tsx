import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { motion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

export default function SetPassword() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { token, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tempToken = searchParams.get('token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return setError('Passwords do not match');
    setLoading(true);
    setError('');
    try {
      await api.post('/api/auth/set-password', { password }, {
        headers: { Authorization: `Bearer ${tempToken || token}` }
      });
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to set password');
    } finally {
      setLoading(false);
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
            ALMOST_THERE
          </p>
          <h1 className="font-display font-black text-5xl uppercase tracking-tighter   leading-none text-z-ink">
            SET_<span className=" ">PASSWORD</span>
          </h1>
        </div>

        <p className="text-[11px] font-mono text-z-muted uppercase text-center leading-relaxed mb-8">
          Create a password so you can also sign in without Google.
        </p>

        {error && <div className="bg-z-ink text-white p-4 text-[10px] font-mono font-bold uppercase tracking-widest mb-8 border-2 border-z-border text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-8 relative z-10">
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
            {loading ? 'SAVING...' : 'SET PASSWORD'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
