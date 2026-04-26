'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function NotFound() {
  const [animKey, setAnimKey] = useState(0);

  // Dispara animaciones en cada mount (navegación cliente) y en restauración bfcache
  useEffect(() => {
    setAnimKey((k) => k + 1);
  }, []);

  useEffect(() => {
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setAnimKey((k) => k + 1);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-white dark:bg-black">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 opacity-20 dark:opacity-30">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.06)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_80%_80%_at_50%_50%,black,transparent)] dark:bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)]" />
      </div>

      {/* Floating Geometric Elements */}
      <div className="absolute left-4 top-4 z-10 h-24 w-24 rotate-45 animate-[spin_20s_linear_infinite] rounded-lg border border-black/10 dark:border-white/10 sm:left-16 sm:top-16 sm:h-32 sm:w-32" />
      <div className="absolute bottom-16 right-8 z-10 h-16 w-16 -rotate-12 animate-[spin_15s_linear_infinite_reverse] rounded-lg border border-black/5 dark:border-white/5 sm:bottom-28 sm:right-28 sm:h-24 sm:w-24" />
      <div className="absolute left-1/3 top-1/4 z-10 h-10 w-10 rotate-[30deg] animate-pulse rounded-lg border border-black/10 dark:border-white/10 sm:h-12 sm:w-12" />
      <div className="absolute bottom-1/4 right-1/3 z-10 h-14 w-14 rotate-[60deg] animate-[spin_25s_linear_infinite] rounded-lg border border-black/5 dark:border-white/5 sm:h-20 sm:w-20" />
      <div className="absolute right-4 top-1/2 z-10 h-6 w-6 rotate-12 animate-[spin_18s_linear_infinite_reverse] rounded border border-black/10 dark:border-white/10 sm:right-16 sm:h-8 sm:w-8" />

      {/* Glow Effect */}
      <div className="pointer-events-none absolute inset-0 z-10 bg-[radial-gradient(circle_at_50%_40%,rgba(0,0,0,0.03),transparent_60%)] dark:bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.06),transparent_60%)]" />

      {/* Main Content */}
      <div key={animKey} className="relative z-20 flex w-full flex-col items-center justify-center px-6 py-16 text-center sm:px-8">
        {/* Logo */}
        <motion.div
          initial={{ y: -16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-12 sm:mb-16"
        >
          <Link href="/dashboard" className="group flex items-center gap-3">
            <div className="relative h-8 w-8 transition-transform duration-500 group-hover:scale-110 sm:h-10 sm:w-10">
              <Image
                src="/favicon.svg"
                alt="Tesseract"
                fill
                className="object-contain drop-shadow-[0_0_20px_rgba(0,0,0,0.15)] dark:drop-shadow-[0_0_20px_rgba(255,255,255,0.3)] [@media(prefers-color-scheme:light)]:invert"
              />
            </div>
            <span className="text-xl font-bold tracking-tight text-black transition-opacity group-hover:opacity-60 dark:text-white sm:text-2xl">
              Tesseract
            </span>
          </Link>
        </motion.div>

        {/* 404 */}
        <motion.div
          initial={{ scale: 0.85 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.6, type: 'spring', stiffness: 180, damping: 20 }}
          className="relative mb-6 select-none sm:mb-8"
        >
          <span className="absolute inset-0 flex items-center justify-center font-mono text-[7rem] font-bold leading-none tracking-tighter text-black/[0.03] blur-sm dark:text-white/[0.03] sm:text-[9rem] lg:text-[12rem]">
            404
          </span>
          <span className="relative font-mono text-[7rem] font-bold leading-none tracking-tighter text-black drop-shadow-[0_0_60px_rgba(0,0,0,0.08)] dark:text-white dark:drop-shadow-[0_0_60px_rgba(255,255,255,0.15)] sm:text-[9rem] lg:text-[12rem]">
            404
          </span>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ y: 16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="mb-10 max-w-md space-y-3"
        >
          <p className="text-xs uppercase tracking-widest text-black/40 dark:text-white/40">Error · Página no encontrada</p>
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-black dark:text-white sm:text-3xl">
            Esta página no existe
          </h1>
          <p className="text-base leading-relaxed text-black/60 dark:text-white/60 sm:text-lg">
            Puede que haya sido movida, eliminada o que la URL esté mal escrita.
          </p>
        </motion.div>

        {/* Single CTA */}
        <motion.div
          initial={{ y: 16 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 rounded-xl bg-black px-8 py-4 font-semibold text-white transition-all hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Volver al inicio
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
