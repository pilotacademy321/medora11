import React from 'react';

/**
 * AppBackground
 * Official MEDORA Pure White Platform Canvas (#FFFFFF)
 * Clean, medical, high-contrast and responsive for all device viewports.
 */
export const AppBackground: React.FC = () => {
  return (
    <div 
      aria-hidden="true"
      className="fixed inset-0 -z-10 w-full h-full overflow-hidden pointer-events-none select-none bg-white"
    >
      <div className="absolute inset-0 bg-white" />
    </div>
  );
};
