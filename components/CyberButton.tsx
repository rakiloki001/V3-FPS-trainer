import React from 'react';

interface CyberButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  variant?: 'primary' | 'secondary';
}

export const CyberButton: React.FC<CyberButtonProps> = ({ 
  onClick, 
  children, 
  disabled = false, 
  className = '',
  variant = 'primary'
}) => {
  const baseStyles = "relative px-8 py-3 font-cyber font-bold uppercase tracking-widest transition-all duration-200 clip-path-polygon";
  const primaryStyles = "bg-neon-blue text-neon-dark hover:bg-white hover:text-neon-pink shadow-[0_0_15px_rgba(0,255,255,0.5)]";
  const secondaryStyles = "bg-transparent border-2 border-neon-pink text-neon-pink hover:bg-neon-pink hover:text-neon-dark shadow-[0_0_10px_rgba(255,0,255,0.3)]";
  
  const disabledStyles = "opacity-50 cursor-not-allowed filter grayscale";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        ${baseStyles}
        ${variant === 'primary' ? primaryStyles : secondaryStyles}
        ${disabled ? disabledStyles : 'transform hover:scale-105'}
        ${className}
      `}
      style={{
        clipPath: 'polygon(10% 0, 100% 0, 100% 70%, 90% 100%, 0 100%, 0 30%)'
      }}
    >
      {children}
      {/* Decorative lines */}
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white opacity-50"></div>
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white opacity-50"></div>
    </button>
  );
};