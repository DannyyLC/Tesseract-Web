'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
// @ts-ignore
import { Canvas, useFrame } from '@react-three/fiber';
import { Segments, Segment, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import * as THREE from 'three';

// --- Parámetros de la proyección 4D → 3D ---
const W_DISTANCE = 2.5; // "Distancia" de la cámara 4D sobre el eje W
const PROJ_SCALE = 3; // Escala visual de la proyección

// --- Componente Geométrico del Tesseract (4D real proyectado a 3D) ---
function TesseractWireframe() {
  const groupRef = useRef<THREE.Group>(null);
  const segRefs = useRef<any[]>([]);

  // Vértices 4D (16) y aristas (32) del hipercubo.
  // Cada vértice es una combinación de ±1 en las 4 coordenadas (x, y, z, w).
  // Dos vértices están conectados si difieren en exactamente UNA coordenada.
  const { vertices4D, edges } = useMemo(() => {
    const verts: number[][] = [];
    for (let i = 0; i < 16; i++) {
      verts.push([
        i & 1 ? 1 : -1,
        i & 2 ? 1 : -1,
        i & 4 ? 1 : -1,
        i & 8 ? 1 : -1,
      ]);
    }
    const eds: [number, number][] = [];
    for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        const diff = i ^ j;
        // diff es potencia de 2 ⇒ difieren en un solo bit (una sola coordenada)
        if ((diff & (diff - 1)) === 0) eds.push([i, j]);
      }
    }
    return { vertices4D: verts, edges: eds };
  }, []);

  // Buffer reutilizable de posiciones 3D proyectadas (evita asignar memoria por frame)
  const projected = useMemo(
    () => vertices4D.map(() => new THREE.Vector3()),
    [vertices4D],
  );

  // Cada frame: rotamos en 4D y proyectamos a 3D.
  // - La rotación en el plano XW es la que produce el efecto de la 4ª dimensión
  //   (el cubo interno se voltea de adentro hacia afuera).
  // - La rotación en el plano YZ añade un giro 3D para un movimiento más rico.
  useFrame((state: any) => {
    const t = state.clock.elapsedTime;
    const cosXW = Math.cos(t * 0.45);
    const sinXW = Math.sin(t * 0.45);
    const cosYZ = Math.cos(t * 0.28);
    const sinYZ = Math.sin(t * 0.28);

    for (let i = 0; i < vertices4D.length; i++) {
      const v = vertices4D[i];
      let x = v[0];
      let y = v[1];
      let z = v[2];
      let w = v[3];

      // Rotación en el plano XW (la "cuarta dimensión")
      const x1 = x * cosXW - w * sinXW;
      const w1 = x * sinXW + w * cosXW;
      x = x1;
      w = w1;

      // Rotación en el plano YZ (giro 3D adicional)
      const y1 = y * cosYZ - z * sinYZ;
      const z1 = y * sinYZ + z * cosYZ;
      y = y1;
      z = z1;

      // Proyección en perspectiva 4D → 3D: cuanto menor es w, más "lejos"
      // está el vértice y más pequeño aparece (genera el cubo interno).
      const f = PROJ_SCALE / (W_DISTANCE - w);
      projected[i].set(x * f, y * f, z * f);
    }

    // Volcamos las posiciones proyectadas en cada arista
    for (let i = 0; i < edges.length; i++) {
      const seg = segRefs.current[i];
      if (!seg) continue;
      seg.start.copy(projected[edges[i][0]]);
      seg.end.copy(projected[edges[i][1]]);
    }
  });

  return (
    <group ref={groupRef}>
      <Segments limit={edges.length} lineWidth={2}>
        {edges.map((_, i) => (
          <Segment
            key={i}
            ref={(el: any) => (segRefs.current[i] = el)}
            start={[0, 0, 0]}
            end={[0, 0, 0]}
            color="white"
          />
        ))}
      </Segments>
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
  const t = useTranslations('Home');
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
    <div
      style={{
        width: '100vw',
        height: '100vh',
        position: 'relative',
        background: 'var(--brand-black)',
      }}
    >
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
        <h1 className="animate-fade-in-slow mb-8 select-none text-center text-3xl font-bold tracking-[0.2em] text-brand-white mix-blend-difference sm:text-5xl sm:tracking-[0.4em] md:text-6xl md:tracking-[0.5em]">
          TESSERACT
        </h1>

        {/* Botón Interactivo */}
        <div className="pointer-events-auto mt-32">
          <Link
            href="/login"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className={`relative inline-block border border-brand-white px-8 py-4 text-lg uppercase tracking-widest text-brand-white transition-all duration-500 ease-out ${hovered ? 'bg-brand-white text-brand-black shadow-[0_0_20px_rgba(255,255,255,0.8)]' : 'bg-brand-black'} `}
          >
            {t('enterButton')}
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
