import React from 'react';

interface LogoProps {
  className?: string;
  collapsed?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", collapsed = false }) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Firm logo */}
      <div className="relative w-20 h-20 mb-2">
        <img 
          src="/logo-lior.png" 
          alt="LegalFlow - Lior Perry Law Office" 
          className="w-full h-full object-contain drop-shadow-lg rounded-lg bg-white/70 p-1"
          loading="lazy"
        />
      </div>

      {/* Text */}
      {!collapsed && (
        <div className="text-center">
          <h1 className="text-xl font-bold tracking-wide text-[#d4af37] font-sans leading-none" style={{ fontFamily: 'Heebo, sans-serif' }}>
            Lior Perry
          </h1>
          <p className="text-[0.65rem] tracking-[0.2em] text-slate-300 mt-1 font-light uppercase">
            Law Office
          </p>
        </div>
      )}
    </div>
  );
};

export default Logo;