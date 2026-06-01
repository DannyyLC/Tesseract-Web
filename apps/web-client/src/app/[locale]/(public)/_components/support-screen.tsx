'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ChevronDown, ArrowLeft, Globe } from 'lucide-react';
import {
  FaLinkedinIn,
  FaGithub,
  FaXTwitter,
  FaFacebook,
  FaTiktok,
  FaYoutube,
  FaWhatsapp,
} from 'react-icons/fa6';


const socialLinks = [
  {
    name: 'Website',
    icon: <Globe size={24} />,
    href: 'https://fractal-hub.vercel.app/',
    color: 'hover:text-success-500',
  },
  {
    name: 'WhatsApp',
    icon: <FaWhatsapp size={24} />,
    href: 'https://wa.me/524491292435',
    color: 'hover:text-brand-whatsapp',
  },
  {
    name: 'LinkedIn',
    icon: <FaLinkedinIn size={24} />,
    href: 'https://www.linkedin.com/company/fractal-industries',
    color: 'hover:text-info-600',
  },
  {
    name: 'X (Twitter)',
    icon: <FaXTwitter size={24} />,
    href: 'https://x.com/Fractal74753861',
    color: 'hover:text-accent',
  },
  {
    name: 'GitHub',
    icon: <FaGithub size={24} />,
    href: 'https://github.com/FractalIndustries',
    color: 'hover:text-accent',
  },
  {
    name: 'YouTube',
    icon: <FaYoutube size={24} />,
    href: 'https://www.youtube.com/@Fractal-c1m',
    color: 'hover:text-danger-600',
  },
  {
    name: 'Facebook',
    icon: <FaFacebook size={24} />,
    href: 'https://www.facebook.com/profile.php?id=61583896372008',
    color: 'hover:text-info',
  },
  {
    name: 'TikTok',
    icon: <FaTiktok size={22} />,
    href: 'https://www.tiktok.com/@fractal366',
    color: 'hover:text-accent',
  },
  {
    name: 'Mail',
    icon: <Mail size={22} />,
    href: 'mailto:fractaliaindustries@gmail.com',
    color: 'hover:text-accent',
  },
];

export default function SupportScreen() {
  const t = useTranslations('SupportScreen');
  const router = useRouter();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    { question: t('faq1Question'), answer: t('faq1Answer') },
    { question: t('faq2Question'), answer: t('faq2Answer') },
    { question: t('faq3Question'), answer: t('faq3Answer') },
    { question: t('faq4Question'), answer: t('faq4Answer') },
  ];

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)]">
      {/* Top bar simplificada */}
      <header className="bg-[var(--background)]/90 sticky top-0 z-50 border-b border-[var(--border)] backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ArrowLeft size={16} />
            {t('back')}
          </button>
          <div className="group flex items-center gap-2.5">
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              Tesseract{' '}
              <span className="hidden text-[var(--text-tertiary)] sm:inline">
                / {t('helpCenter')}
              </span>
            </span>
            <div className="relative h-8 w-8 flex-shrink-0">
              <Image
                src="/favicon.svg"
                alt="Tesseract"
                fill
                className="object-contain"
                style={{ filter: 'var(--logo-filter)' }}
                priority
              />
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 md:py-20">
        {/* Encabezado */}
        <div className="mb-16 text-center">
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t('mainHeading')}
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            {t('mainDesc')}
          </p>
        </div>

        {/* Canales de Contacto Directo */}
        <section className="mb-20">
          <h2 className="mb-6 flex items-center gap-3 text-2xl font-semibold">
            {t('contactSection')}
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-surface-primary p-6 transition-all hover:-translate-y-1 hover:border-border-hover hover:shadow-lg ${link.color}`}
              >
                <div className="inherit text-[var(--text-secondary)] transition-colors">
                  {link.icon}
                </div>
                <span className="text-sm font-medium text-[var(--text-primary)]">{link.name}</span>
              </a>
            ))}
          </div>
        </section>

        {/* Preguntas Frecuentes (FAQ) */}
        <section>
          <h2 className="mb-6 flex items-center gap-3 text-2xl font-semibold">
            {t('faqSection')}
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-[var(--border)] bg-surface-primary transition-colors hover:border-border-hover"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="flex w-full items-center justify-between p-5 text-left focus:outline-none"
                  >
                    <span className="font-semibold">{faq.question}</span>
                    <ChevronDown
                      size={20}
                      className={`text-[var(--text-tertiary)] transition-transform duration-300 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                      >
                        <div className="border-t border-[var(--border)] p-5 pt-4 text-[var(--text-secondary)]">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border)] py-8 text-center text-sm text-[var(--text-tertiary)]">
        <p>{t('footer', { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
