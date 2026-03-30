'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

// Define the FAQs
const faqs = [
  {
    question: '¿Qué es Tesseract?',
    answer:
      'Tesseract es una plataforma de automatización diseñada para potenciar tu negocio. Te permite crear, monitorear y gestionar workflows y ejecuciones automatizadas, administrar accesos internos de tu equipo de trabajo y gestionar el consumo de recursos (créditos) de tus integraciones, todo en un solo lugar.',
  },
  {
    question: '¿Cómo solicito un nuevo Workflow?',
    answer:
      'Desde tu panel, en la sección de "Workflows", puedes dar clic en "Nuevo Workflow". Esto enviará una solicitud directa a nuestro equipo para agendar una reunión y definir los detalles técnicos de tu nueva automatización a medida.',
  },
  {
    question: '¿Qué son los Créditos y cómo se consumen?',
    answer:
      'Los créditos son la unidad de medida para las ejecuciones de tus workflows. Cada ejecución exitosa o fallida de un flujo automatizado consume créditos según su nivel de complejidad (Light, Standard o Advanced). Puedes monitorear este consumo en la pestaña "Billing" o en tu Dashboard principal.',
  },
  {
    question: '¿Puedo integrar Tesseract con mis propios sistemas?',
    answer:
      'Sí. Tesseract te permite generar "API Keys" de manera segura desde la pestaña correspondiente. Estas llaves te permiten ejecutar tus workflows desde tus propias aplicaciones web, sistemas internos o mediante peticiones API externas.',
  },
];

const socialLinks = [
  {
    name: 'Website',
    icon: <Globe size={24} />,
    href: 'https://fractal-hub.vercel.app/',
    color: 'hover:text-emerald-500',
  },
  {
    name: 'WhatsApp',
    icon: <FaWhatsapp size={24} />,
    href: 'https://wa.me/524491292435',
    color: 'hover:text-green-500',
  },
  {
    name: 'LinkedIn',
    icon: <FaLinkedinIn size={24} />,
    href: 'https://www.linkedin.com/company/fractal-industries',
    color: 'hover:text-blue-600',
  },
  {
    name: 'X (Twitter)',
    icon: <FaXTwitter size={24} />,
    href: 'https://x.com/Fractal74753861',
    color: 'hover:text-sky-500 dark:hover:text-white',
  },
  {
    name: 'GitHub',
    icon: <FaGithub size={24} />,
    href: 'https://github.com/FractalIndustries',
    color: 'hover:text-gray-800 dark:hover:text-white',
  },
  {
    name: 'YouTube',
    icon: <FaYoutube size={24} />,
    href: 'https://www.youtube.com/@Fractal-c1m',
    color: 'hover:text-red-600',
  },
  {
    name: 'Facebook',
    icon: <FaFacebook size={24} />,
    href: 'https://www.facebook.com/profile.php?id=61583896372008',
    color: 'hover:text-blue-500',
  },
  {
    name: 'TikTok',
    icon: <FaTiktok size={22} />,
    href: 'https://www.tiktok.com/@fractal366',
    color: 'hover:text-black dark:hover:text-white',
  },
  {
    name: 'Mail',
    icon: <Mail size={22} />,
    href: 'mailto:fractaliaindustries@gmail.com',
    color: 'hover:text-black dark:hover:text-white',
  },
];

export default function SupportScreen() {
  const router = useRouter();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

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
            Volver
          </button>
          <div className="group flex items-center gap-2.5">
            <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              Tesseract{' '}
              <span className="hidden text-[var(--text-tertiary)] sm:inline">
                / Centro de Ayuda
              </span>
            </span>
            <div className="relative h-8 w-8 flex-shrink-0">
              <Image
                src="/favicon.svg"
                alt="Tesseract"
                fill
                className="object-contain brightness-0 dark:invert"
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
            ¿Cómo podemos ayudarte?
          </h1>
          <p className="text-lg text-[var(--text-secondary)]">
            Encuentra respuestas a preguntas frecuentes o contáctanos directamente a través de
            nuestros canales oficiales.
          </p>
        </div>

        {/* Canales de Contacto Directo */}
        <section className="mb-20">
          <h2 className="mb-6 flex items-center gap-3 text-2xl font-semibold">
            Contáctanos directo
          </h2>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {socialLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-primary)] p-6 transition-all hover:-translate-y-1 hover:border-black/20 hover:shadow-lg dark:hover:border-white/20 ${link.color}`}
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
            Preguntas Frecuentes
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-primary)] transition-colors hover:border-black/20 dark:hover:border-white/20"
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
        <p>© {new Date().getFullYear()} Fractal. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
