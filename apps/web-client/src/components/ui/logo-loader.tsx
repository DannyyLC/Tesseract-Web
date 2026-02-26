'use client';

import React from 'react';
import Image from 'next/image';

interface LogoLoaderProps {
  text?: string;
  className?: string;
}

export function LogoLoader({ text = 'Cargando', className = '' }: LogoLoaderProps) {
  return (
    <div className={`flex min-h-[50vh] flex-1 flex-col items-center justify-center ${className}`}>
      <div className="relative flex flex-col items-center">
        {/* Spinner Container */}
        <div className="relative flex h-40 w-40 items-center justify-center">
          {/* Logo in the center */}
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-black/5 bg-white/80 p-3 shadow-xl backdrop-blur-md dark:border-white/5 dark:bg-[#0A0A0A]/80">
              <Image
                src="/favicon.svg"
                alt="Logo"
                width={80}
                height={80}
                className="h-full w-full object-contain brightness-0 dark:invert"
                priority
              />
            </div>
          </div>

          {/* New Dynamic Spinner */}
          <svg className="h-full w-full rotate-[-90deg]" viewBox="0 0 100 100">
            {/* Background Track */}
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-black/5 dark:text-white/5"
            />
            {/* Animated Fragment */}
            <circle
              cx="50"
              cy="50"
              r="44"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              className="animate-spinner-dash text-black dark:text-white"
              style={{
                strokeDasharray: '280',
                strokeDashoffset: '280',
                transformOrigin: '50% 50%',
              }}
            />
          </svg>
        </div>

        {/* Loading Text */}
        <div className="mt-12 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <span className="h-[1px] w-6 bg-gradient-to-r from-transparent to-black/40 dark:to-white/40" />
            <p className="text-[11px] font-bold uppercase tracking-[0.4em] text-black opacity-80 dark:text-white">
              {text}
            </p>
            <span className="h-[1px] w-6 bg-gradient-to-l from-transparent to-black/40 dark:to-white/40" />
          </div>
        </div>

        <style jsx global>{`
          @keyframes spinnerDash {
            0% {
              stroke-dashoffset: 280;
              transform: rotate(0deg);
            }
            50% {
              stroke-dashoffset: 70;
              transform: rotate(180deg);
            }
            100% {
              stroke-dashoffset: 280;
              transform: rotate(720deg);
            }
          }
          .animate-spinner-dash {
            animation: spinnerDash 2.5s ease-in-out infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
