import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  companyName?: string;
}

export const NusantaraLogo: React.FC<LogoProps> = ({ className = '', size = 'md', companyName }) => {
  const dimensions = {
    sm: 'h-14 w-auto max-w-[150px]',
    md: 'h-24 w-auto max-w-[240px]',
    lg: 'h-32 w-auto max-w-[320px]',
  };

  const dimClass = dimensions[size];

  // Official corporate company logo provided by the user
  const logoUrl = 'https://i.ibb.co.com/TqgprgPT/Logo-Nusantara-Mineral-Abadi.webp';

  return (
    <div className={`flex items-center select-none ${className}`}>
      <img
        src={logoUrl}
        alt={companyName || 'PT Nusantara Mineral Sukses Abadi'}
        className={`${dimClass} object-contain`}
        referrerPolicy="no-referrer"
      />
    </div>
  );
};

