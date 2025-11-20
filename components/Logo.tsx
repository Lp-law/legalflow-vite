import React from 'react';

interface LogoProps {
  className?: string;
  collapsed?: boolean;
}

const Logo: React.FC<LogoProps> = ({ className = "", collapsed = false }) => {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* Icon / Monogram */}
      <div className="relative w-12 h-12 mb-2">
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
          {/* L Shape - Gold */}
          <path 
            d="M25 20 V80 H75" 
            fill="none" 
            stroke="#d4af37" 
            strokeWidth="8" 
            strokeLinecap="square"
          />
          {/* P Shape - Silver/Light Blue overlap */}
          <path 
            d="M25 20 H65 C75 20 80 30 80 40 C80 55 70 60 60 60 H25" 
            fill="none" 
            stroke="#94a3b8" 
            strokeWidth="8" 
            strokeLinecap="square"
            className="opacity-80"
          />
        </svg>
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