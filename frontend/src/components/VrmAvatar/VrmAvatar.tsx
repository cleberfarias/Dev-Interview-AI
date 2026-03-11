import React, { useEffect, useRef } from 'react';
import {
  AmbientLight,
  Clock,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import type { Euler } from 'three';
import type { VRM } from '@pixiv/three-vrm';

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
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const frameRef = useRef<number | null>(null);
  const mouthRef = useRef(0);
  const baseHeadRotationRef = useRef<Euler | null>(null);
  const clockRef = useRef<Clock | null>(null);
  const onLoadedRef = useRef(onLoaded);
  const onErrorRef = useRef(onError);

  mouthRef.current = mouthOpen;

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;

    const bootstrap = async () => {
      try {
        const [gltfModule, vrmModule] = await Promise.all([
          import('three/examples/jsm/loaders/GLTFLoader.js'),
          import('@pixiv/three-vrm'),
        ]);

        if (disposed) return;

        const { GLTFLoader } = gltfModule;
        const { VRMLoaderPlugin, VRMUtils } = vrmModule;

        const scene = new Scene();
        scene.background = null;

        const camera = new PerspectiveCamera(35, 1, 0.1, 100);
        camera.position.set(0, 1.45, 2.2);
        camera.lookAt(0, 1.4, 0);

        const renderer = new WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
        });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.outputColorSpace = SRGBColorSpace;

        const ambient = new AmbientLight(0xffffff, 0.7);
        const directional = new DirectionalLight(0xffffff, 1.1);
        directional.position.set(1.2, 2.4, 2);
        scene.add(ambient, directional);

        sceneRef.current = scene;
        cameraRef.current = camera;
        rendererRef.current = renderer;
        clockRef.current = new Clock();

        const loader = new GLTFLoader();
        loader.register((parser: any) => new VRMLoaderPlugin(parser));

        loader.load(
          vrmUrl,
          (gltf: any) => {
            if (disposed) return;
            const vrm = gltf?.userData?.vrm as VRM;
            if (!vrm) {
              onErrorRef.current?.(new Error('VRM missing in GLTF payload'));
              return;
            }

            VRMUtils.removeUnnecessaryJoints?.(vrm.scene as any);
            vrm.scene.position.set(0, -1.1, 0);
            vrm.scene.rotation.y = Math.PI;
            scene.add(vrm.scene);
            vrmRef.current = vrm;

            const head = vrm.humanoid?.getNormalizedBoneNode('head');
            if (head) {
              baseHeadRotationRef.current = head.rotation.clone();
            }

            onLoadedRef.current?.();
          },
          undefined,
          (error: any) => {
            const err = error instanceof Error ? error : new Error('VRM load failed');
            console.warn('VRM load failed', err);
            onErrorRef.current?.(err);
          },
        );

        const resize = () => {
          const width = container.clientWidth || 1;
          const height = container.clientHeight || 1;
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();

        const animate = () => {
          if (disposed) return;
          const vrm = vrmRef.current;
          const clock = clockRef.current;
          const delta = clock?.getDelta() || 0;
          const now = clock?.elapsedTime || 0;
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
      } catch (error: any) {
        const err = error instanceof Error ? error : new Error('Failed to initialize VRM scene');
        console.warn('VRM bootstrap failed', err);
        onErrorRef.current?.(err);
      }
    };

    void bootstrap();

    return () => {
      disposed = true;
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }

      const scene = sceneRef.current;
      if (scene && vrmRef.current) {
        scene.remove(vrmRef.current.scene);
        vrmRef.current.dispose();
      }
      vrmRef.current = null;

      rendererRef.current?.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
      sceneRef.current = null;
      clockRef.current = null;
      baseHeadRotationRef.current = null;
    };
  }, [vrmUrl]);

  return (
    <div ref={containerRef} className={className}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};

export default VrmAvatar;
