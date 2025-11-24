import React, { useState } from 'react';
import Logo from './Logo';
import { login } from '../services/cloudService';

interface LoginProps {
  onLogin: (payload: { username: string; token: string }) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const auth = await login(username.trim(), password);
      onLogin({ username: auth.user.username, token: auth.token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'שגיאה בהתחברות';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#040916] via-[#07142a] to-[#0c1f3c] flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-[#0b1426]/90 rounded-3xl shadow-2xl border border-white/10 p-8 backdrop-blur">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        
        <h2 className="text-2xl font-bold text-center text-white mb-2">כניסה למערכת</h2>
        <div className="text-center text-slate-300 mb-6 text-sm leading-relaxed">
          <p>ניהול תזרים וגבייה</p>
          <p>משרד עו"ד ליאור פרי</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">שם משתמש</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-white/10 rounded-xl focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all bg-white/5 text-white placeholder-slate-400"
              placeholder="הזן שם משתמש"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-200 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-white/10 rounded-xl focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all bg-white/5 text-white placeholder-slate-400"
              placeholder="הזן סיסמה"
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-500/10 text-red-200 text-sm rounded-xl text-center font-medium animate-pulse border border-red-500/30">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 bg-gradient-to-l from-[#d4af37] to-[#b4881c] text-slate-900 font-bold rounded-2xl transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 ${
              isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:brightness-110'
            }`}
          >
            {isLoading ? 'מתחבר...' : 'התחבר'}
          </button>
        </form>
        
        <div className="mt-8 text-center text-xs text-slate-400">
          &copy; {new Date().getFullYear()} Lior Perry Law Office
        </div>
      </div>
    </div>
  );
};

export default Login;