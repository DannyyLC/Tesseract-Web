'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
// @ts-ignore
import { Canvas, useFrame } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import Link from 'next/link';
import * as THREE from 'three';

// --- Componente Geométrico del Tesseract ---
function TesseractWireframe() {
  const groupRef = useRef<THREE.Group>(null);

  // Animación de rotación constante
  useFrame((_state: any, delta: number) => {
    if (groupRef.current) {
      groupRef.current.rotation.x += delta * 0.2;
      groupRef.current.rotation.y += delta * 0.3;
    }
  });

  // Construcción de la geometría del Tesseract (Cubo dentro de un cubo)
  const lines = useMemo(() => {
    const points: THREE.Vector3[][] = [];
    const size = 2; // Tamaño cubo externo
    const innerSize = 1; // Tamaño cubo interno

    // Definir vértices
    const corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ];

    // 1. Líneas del Cubo Externo
    // 2. Líneas del Cubo Interno
    // 3. Conexiones entre Interno y Externo
    const edges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0], // Cara trasera
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4], // Cara delantera
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7], // Conexiones profundidad
    ];

    // Generar líneas para ambos cubos
    edges.forEach(([start, end]) => {
      // Cubo Externo
      points.push([
        new THREE.Vector3(...corners[start].map((c) => c * size)),
        new THREE.Vector3(...corners[end].map((c) => c * size)),
      ]);
      // Cubo Interno
      points.push([
        new THREE.Vector3(...corners[start].map((c) => c * innerSize)),
        new THREE.Vector3(...corners[end].map((c) => c * innerSize)),
      ]);
    });

    // Conectar vértices externos con internos (La 4ta dimensión visualizada)
    corners.forEach((c) => {
      points.push([
        new THREE.Vector3(...c.map((v) => v * size)),
        new THREE.Vector3(...c.map((v) => v * innerSize)),
      ]);
    });

    return points;
  }, []);

  return (
    <group ref={groupRef}>
      {lines.map((pos, index) => (
        <Line
          key={index}
          points={pos}
          color="white"
          lineWidth={2} // Grosor de línea
          transparent
          opacity={0.8}
        />
      ))}
    </group>
  );
}

// --- Escena Principal 3D ---
function Scene() {
  return (
    <>
      <color attach="background" args={['#000000']} />

      {/* Luces (aunque para líneas emisivas no son estrictamente necesarias, ayudan si agregas sólidos) */}
      <ambientLight intensity={0.5} />

      <TesseractWireframe />

      {/* Efectos de Post-procesamiento para el "Glow" */}
      <EffectComposer enableNormalPass={false}>
        <Bloom luminanceThreshold={0} mipmapBlur intensity={1.5} radius={0.6} />
      </EffectComposer>

      {/* Permite al usuario rotar con el mouse si quiere interactuar */}
      <OrbitControls enableZoom={false} autoRotate={false} />
    </>
  );
}

// --- Página Principal (Next.js) ---
export default function Home() {
  const [hovered, setHovered] = useState(false);
  const [cameraZ, setCameraZ] = useState(7);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const z = window.innerWidth < 640 ? 11 : 7;
    setCameraZ(z);
    setMounted(true);

    const update = () => setCameraZ(window.innerWidth < 640 ? 11 : 7);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: 'black' }}>
      {/* Capa 3D — solo monta en cliente para evitar problemas de hidratación */}
      {mounted && (
        <div className="absolute inset-0 z-0">
          <Canvas camera={{ position: [0, 0, cameraZ], fov: 50 }}>
            <Scene />
          </Canvas>
        </div>
      )}

      {/* Capa de UI (Texto y Botón) */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-4">
        {/* Título */}
        <h1 className="animate-fade-in-slow mb-8 select-none text-center text-3xl font-bold tracking-[0.2em] text-white mix-blend-difference sm:text-5xl sm:tracking-[0.4em] md:text-6xl md:tracking-[0.5em]">
          TESSERACT
        </h1>

        {/* Botón Interactivo */}
        <div className="pointer-events-auto mt-32">
          <Link
            href="/login"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`relative inline-block border border-white px-8 py-4 text-lg uppercase tracking-widest text-white transition-all duration-500 ease-out ${hovered ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.8)]' : 'bg-black'} `}
          >
            Ingresar
          </Link>
        </div>
      </div>

      {/* Estilos globales rápidos para animación de entrada (puedes mover esto a tu globals.css) */}
      <style jsx global>{`
        @keyframes fadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in-slow {
          animation: fadeIn 3s ease-out both;
          animation-delay: 0.5s;
        }
      `}</style>
    </div>
  );
}
