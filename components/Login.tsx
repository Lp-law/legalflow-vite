import React, { useState } from 'react';
import Logo from './Logo';

interface LoginProps {
  onLogin: (user: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Hardcoded credentials as requested
    if (username.toLowerCase() === 'lior' && password === 'lior123') {
      onLogin(username);
    } else {
      setError('שם משתמש או סיסמה שגויים');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
        <div className="flex justify-center mb-8">
          <Logo />
        </div>
        
        <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">כניסה למערכת</h2>
        <p className="text-center text-slate-500 mb-6 text-sm">ניהול תזרים - משרד עו"ד ליאור פרי</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם משתמש</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="הזן שם משתמש"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">סיסמה</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-[#d4af37] focus:border-transparent outline-none transition-all bg-slate-50 focus:bg-white"
              placeholder="הזן סיסמה"
            />
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg text-center font-medium animate-pulse">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            className="w-full py-3 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
          >
            התחבר
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