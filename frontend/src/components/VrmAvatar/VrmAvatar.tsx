import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

interface VrmAvatarProps {
  vrmUrl: string;
  mouthOpen: number;
  className?: string;
  onLoaded?: () => void;
  onError?: (error: Error) => void;
}

const VrmAvatar: React.FC<VrmAvatarProps> = ({
  vrmUrl,
  mouthOpen,
  className,
  onLoaded,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const frameRef = useRef<number | null>(null);
  const mouthRef = useRef(0);
  const baseHeadRotationRef = useRef<THREE.Euler | null>(null);
  const clockRef = useRef(new THREE.Clock());

  mouthRef.current = mouthOpen;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.45, 2.2);
    camera.lookAt(0, 1.4, 0);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const ambient = new THREE.AmbientLight(0xffffff, 0.7);
    const directional = new THREE.DirectionalLight(0xffffff, 1.1);
    directional.position.set(1.2, 2.4, 2);
    scene.add(ambient, directional);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    let disposed = false;

    loader.load(
      vrmUrl,
      (gltf) => {
        if (disposed) return;
        const vrm = gltf.userData.vrm as VRM;
        VRMUtils.removeUnnecessaryJoints?.(vrm.scene);
        vrm.scene.position.set(0, -1.1, 0);
        vrm.scene.rotation.y = Math.PI;
        scene.add(vrm.scene);
        vrmRef.current = vrm;

        const head = vrm.humanoid?.getNormalizedBoneNode('head');
        if (head) {
          baseHeadRotationRef.current = head.rotation.clone();
        }

        onLoaded?.();
      },
      undefined,
      (error) => {
        console.warn('VRM load failed', error);
        onError?.(error instanceof Error ? error : new Error('VRM load failed'));
      },
    );

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      const vrm = vrmRef.current;
      const delta = clockRef.current.getDelta();
      const now = clockRef.current.elapsedTime;
      const mouth = mouthRef.current;
      const speaking = mouth > 0.03;

      if (vrm) {
        vrm.update(delta);

        const expressionManager = vrm.expressionManager;
        if (expressionManager) {
          const possible = ['aa', 'A', 'mouthOpen'];
          const name = possible.find((key) => expressionManager.getExpression(key));
          if (name) {
            expressionManager.setValue(name, mouth);
          }
        } else {
          const head = vrm.humanoid?.getNormalizedBoneNode('head');
          if (head && baseHeadRotationRef.current) {
            head.rotation.x = baseHeadRotationRef.current.x + mouth * 0.12;
          }
        }

        const head = vrm.humanoid?.getNormalizedBoneNode('head');
        if (head && baseHeadRotationRef.current) {
          const bob = Math.sin(now * 1.2) * (speaking ? 0.06 : 0.02);
          head.rotation.y = baseHeadRotationRef.current.y + bob;
        }
      }

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();

      if (vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current.dispose();
        vrmRef.current = null;
      }

      renderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
    };
  }, [vrmUrl, onLoaded, onError]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default VrmAvatar;
