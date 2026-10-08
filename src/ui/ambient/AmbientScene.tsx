import { useEffect, useRef } from 'react';
import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';
import { createPetals, petalCount, stepPetal, targetSpeed } from './petals';
import type { Petal } from './petals';
import styles from './AmbientScene.module.css';

export interface AmbientSceneProps {
  /** Three `#rrggbb` petal tints; changing them cross-fades the petals. */
  colors: readonly [string, string, string];
  /** Playback state: the drift slows down while paused. */
  playing: boolean;
}

const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_S = 0.1;
/** Colour cross-fade rate: about 600ms to settle. */
const COLOR_RATE = 5;
const TEXTURE_PX = 64;

/** Draws a white sakura petal (notched heart) for tinting with the instance colour. */
function petalTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const context = canvas.getContext('2d');
  if (context !== null) {
    const c = TEXTURE_PX / 2;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(c, c + 26);
    context.bezierCurveTo(c - 30, c + 6, c - 20, c - 26, c - 5, c - 26);
    context.lineTo(c, c - 18);
    context.lineTo(c + 5, c - 26);
    context.bezierCurveTo(c + 20, c - 26, c + 30, c + 6, c, c + 26);
    context.closePath();
    context.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Full-viewport transparent WebGL canvas with slowly drifting sakura petals (instanced quads).
 * Rendering pauses while the document is hidden; everything is disposed on unmount.
 */
export default function AmbientScene({ colors, playing }: AmbientSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const live = useRef({ colors, playing });
  useEffect(() => {
    live.current = { colors, playing };
  }, [colors, playing]);

  useEffect(() => {
    const element = host.current;
    if (element === null) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      // WebGL turned out to be unavailable: the scene is purely decorative, so show nothing.
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setClearColor(0x000000, 0);
    element.appendChild(renderer.domElement);

    const bounds = { width: element.clientWidth || window.innerWidth, height: 0 };
    bounds.height = element.clientHeight || window.innerHeight;

    const scene = new Scene();
    const camera = new OrthographicCamera(0, bounds.width, bounds.height, 0, -100, 100);
    const geometry = new PlaneGeometry(1, 1);
    const texture = petalTexture();
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
    });
    const petals: Petal[] = createPetals(petalCount(bounds), bounds, Math.random);
    const mesh = new InstancedMesh(geometry, material, petals.length);
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    scene.add(mesh);

    const tones = live.current.colors.map((hex) => new Color(hex));
    const targets = tones.map((tone) => tone.clone());
    const paintColors = () => {
      petals.forEach((petal, index) => {
        const tone = tones[petal.tone];
        if (tone !== undefined) mesh.setColorAt(index, tone);
      });
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
    };
    paintColors();

    const dummy = new Object3D();
    const resize = () => {
      bounds.width = element.clientWidth || window.innerWidth;
      bounds.height = element.clientHeight || window.innerHeight;
      renderer.setSize(bounds.width, bounds.height, false);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      camera.right = bounds.width;
      camera.top = bounds.height;
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);

    let speed = targetSpeed(live.current.playing);
    let time = 0;
    let last = 0;
    let frame = 0;

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, MAX_FRAME_S);
      last = now;
      time += dt;
      speed += (targetSpeed(live.current.playing) - speed) * Math.min(1, dt * 2);

      let fading = false;
      live.current.colors.forEach((hex, index) => {
        const target = targets[index];
        const tone = tones[index];
        if (target === undefined || tone === undefined) return;
        target.set(hex);
        if (
          Math.abs(tone.r - target.r) + Math.abs(tone.g - target.g) + Math.abs(tone.b - target.b) >
          0.004
        ) {
          tone.lerp(target, 1 - Math.exp(-dt * COLOR_RATE));
          fading = true;
        } else {
          tone.copy(target);
        }
      });
      if (fading) paintColors();

      petals.forEach((petal, index) => {
        stepPetal(petal, dt, time, bounds, speed, Math.random);
        dummy.position.set(petal.x, bounds.height - petal.y, 0);
        dummy.rotation.set(petal.rotX, petal.rotY, petal.rotZ);
        dummy.scale.set(petal.size, petal.size, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    const start = () => {
      if (frame !== 0) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    if (!document.hidden) start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      observer.disconnect();
      scene.remove(mesh);
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={host} className={styles.host} />;
}
