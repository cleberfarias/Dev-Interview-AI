import React, { useEffect, useRef } from 'react';
import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  BoxGeometry,
  CylinderGeometry,
  SRGBColorSpace,
} from 'three';

type AvatarInterviewState = 'idle' | 'avatar_listening' | 'avatar_thinking' | 'avatar_speaking';

interface AvatarThreeSceneProps {
  state: AvatarInterviewState;
  mouthOpen: number;
  emotion: string;
  className?: string;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const EMOTION_COLORS: Record<string, string> = {
  neutral: '#7ec7ff',
  happy: '#95e2ff',
  curious: '#9fb9ff',
  encouraging: '#8de9d6',
};

const AvatarThreeScene: React.FC<AvatarThreeSceneProps> = ({ state, mouthOpen, emotion, className }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<AvatarInterviewState>(state);
  const mouthRef = useRef<number>(mouthOpen);
  const emotionRef = useRef<string>(emotion);

  stateRef.current = state;
  mouthRef.current = clamp(mouthOpen, 0, 1);
  emotionRef.current = emotion;

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let disposed = false;
    let rafId: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const scene = new Scene();
    const camera = new PerspectiveCamera(34, 1, 0.1, 20);
    camera.position.set(0, 1.25, 2.35);
    camera.lookAt(0, 1.05, 0);

    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const ambient = new AmbientLight(0xd6f5ff, 0.9);
    const keyLight = new DirectionalLight(0xa9ddff, 1.25);
    keyLight.position.set(1.8, 2.6, 2.2);

    const fill = new PointLight(0x9d7bff, 0.8, 12);
    fill.position.set(-1.6, 1.2, 2.4);

    scene.add(ambient, keyLight, fill);

    const root = new Group();
    scene.add(root);

    const faceMaterial = new MeshStandardMaterial({
      color: new Color(EMOTION_COLORS.neutral),
      metalness: 0.22,
      roughness: 0.34,
      emissive: new Color('#0f2a7a'),
      emissiveIntensity: 0.35,
    });
    const bodyMaterial = new MeshStandardMaterial({
      color: new Color('#4f6ad6'),
      metalness: 0.2,
      roughness: 0.42,
      emissive: new Color('#0b1d61'),
      emissiveIntensity: 0.25,
    });
    const darkMaterial = new MeshStandardMaterial({
      color: new Color('#06153f'),
      metalness: 0.4,
      roughness: 0.26,
    });
    const accentMaterial = new MeshStandardMaterial({
      color: new Color('#5deaff'),
      metalness: 0.6,
      roughness: 0.18,
      emissive: new Color('#2ebff5'),
      emissiveIntensity: 0.3,
    });

    const head = new Mesh(new SphereGeometry(0.44, 52, 52), faceMaterial);
    head.position.set(0, 1.23, 0);
    root.add(head);

    const neck = new Mesh(new CylinderGeometry(0.11, 0.13, 0.18, 24), bodyMaterial);
    neck.position.set(0, 0.8, 0.08);
    root.add(neck);

    const torso = new Mesh(new CylinderGeometry(0.45, 0.56, 1.05, 28), bodyMaterial);
    torso.position.set(0, 0.1, -0.04);
    root.add(torso);

    const shoulderLeft = new Mesh(new SphereGeometry(0.16, 20, 20), bodyMaterial);
    shoulderLeft.position.set(-0.48, 0.44, -0.03);
    root.add(shoulderLeft);

    const shoulderRight = new Mesh(new SphereGeometry(0.16, 20, 20), bodyMaterial);
    shoulderRight.position.set(0.48, 0.44, -0.03);
    root.add(shoulderRight);

    const eyeLeft = new Mesh(new SphereGeometry(0.06, 16, 16), darkMaterial);
    eyeLeft.position.set(-0.14, 1.28, 0.37);
    root.add(eyeLeft);

    const eyeRight = new Mesh(new SphereGeometry(0.06, 16, 16), darkMaterial);
    eyeRight.position.set(0.14, 1.28, 0.37);
    root.add(eyeRight);

    const eyeGlowLeft = new Mesh(new SphereGeometry(0.02, 12, 12), accentMaterial);
    eyeGlowLeft.position.set(-0.14, 1.28, 0.42);
    root.add(eyeGlowLeft);

    const eyeGlowRight = new Mesh(new SphereGeometry(0.02, 12, 12), accentMaterial);
    eyeGlowRight.position.set(0.14, 1.28, 0.42);
    root.add(eyeGlowRight);

    const mouth = new Mesh(new TorusGeometry(0.11, 0.02, 14, 34, Math.PI), accentMaterial);
    mouth.position.set(0, 1.08, 0.39);
    mouth.rotation.x = Math.PI;
    root.add(mouth);

    const browLeft = new Mesh(new BoxGeometry(0.16, 0.022, 0.022), accentMaterial);
    browLeft.position.set(-0.14, 1.41, 0.35);
    browLeft.rotation.z = -0.14;
    root.add(browLeft);

    const browRight = new Mesh(new BoxGeometry(0.16, 0.022, 0.022), accentMaterial);
    browRight.position.set(0.14, 1.41, 0.35);
    browRight.rotation.z = 0.14;
    root.add(browRight);

    const halo = new Mesh(new TorusGeometry(0.67, 0.017, 20, 80), accentMaterial);
    halo.position.set(0, 1.21, -0.03);
    root.add(halo);

    const lookTarget = new Vector3(0, 1.15, 0);
    const clock = new Clock();
    const desiredFace = new Color(EMOTION_COLORS.neutral);
    const desiredEmissive = new Color('#0f2a7a');
    const currentFace = faceMaterial.color.clone();
    const currentEmissive = faceMaterial.emissive.clone();

    const resize = () => {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      if (disposed) return;
      const t = clock.getElapsedTime();
      const mode = stateRef.current;
      const mouthValue = mouthRef.current;
      const emotionName = emotionRef.current.toLowerCase();

      const speakingBoost = mode === 'avatar_speaking' ? 1 : 0;
      const bobBase = mode === 'avatar_thinking' ? 0.013 : 0.009;
      const bobExtra = speakingBoost ? 0.026 : mode === 'avatar_listening' ? 0.016 : 0.01;
      root.position.y = Math.sin(t * 1.4) * (bobBase + bobExtra);

      head.rotation.y = Math.sin(t * (mode === 'avatar_listening' ? 1.9 : 1.2)) * (mode === 'avatar_thinking' ? 0.12 : 0.08);
      head.rotation.x = mode === 'avatar_thinking' ? 0.06 : -0.01 + Math.sin(t * 1.1) * 0.02;

      torso.rotation.y = head.rotation.y * 0.24;
      torso.rotation.x = Math.sin(t * 0.9) * 0.02;

      const mouthHeight = 0.65 + mouthValue * (mode === 'avatar_speaking' ? 1.45 : 0.5);
      mouth.scale.set(1, mouthHeight, 1);
      mouth.rotation.z = Math.sin(t * 7.5) * 0.03 * speakingBoost;

      halo.rotation.z += 0.003 + speakingBoost * 0.004;
      halo.scale.setScalar(1 + Math.sin(t * 2.6) * 0.02);

      const emotionColor = EMOTION_COLORS[emotionName] || EMOTION_COLORS.neutral;
      desiredFace.set(emotionColor);
      if (emotionName === 'happy') {
        desiredEmissive.set('#1c4bc9');
      } else if (emotionName === 'curious') {
        desiredEmissive.set('#2a2f9a');
      } else if (emotionName === 'encouraging') {
        desiredEmissive.set('#0e4d80');
      } else {
        desiredEmissive.set('#0f2a7a');
      }
      currentFace.lerp(desiredFace, 0.05);
      currentEmissive.lerp(desiredEmissive, 0.05);
      faceMaterial.color.copy(currentFace);
      faceMaterial.emissive.copy(currentEmissive);

      camera.lookAt(lookTarget);
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      scene.clear();
      renderer.dispose();
      faceMaterial.dispose();
      bodyMaterial.dispose();
      darkMaterial.dispose();
      accentMaterial.dispose();
    };
  }, []);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default AvatarThreeScene;
