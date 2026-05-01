import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BoxHelper,
  Color,
  DirectionalLight,
  Group,
  Material,
  MOUSE,
  Mesh,
  PerspectiveCamera,
  Scene,
  SkinnedMesh,
  WebGLRenderer,
  type Object3D,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { fitCameraToObject } from "../lib/scene";
import styles from "./PreviewPane.module.css";

const PREVIEW_ORIGINAL_STATE_KEY = "__previewOriginalState";

interface PreviewPaneProps {
  sceneRoot: Object3D | null;
  selectedMeshId: string | null;
  selectedInfluenceMeshIds: string[];
}

function findBySelectionId(root: Object3D | null, selectionId: string | null): Object3D | null {
  if (!root || !selectionId) {
    return null;
  }

  let match: Object3D | null = null;
  root.traverse((node) => {
    if (!match && node.userData.selectionId === selectionId) {
      match = node;
    }
  });

  return match;
}

export function PreviewPane({
  sceneRoot,
  selectedMeshId,
  selectedInfluenceMeshIds,
}: PreviewPaneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const previewRootRef = useRef<Group | null>(null);
  const helperRef = useRef<BoxHelper | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const scene = new Scene();
    scene.background = new Color("#0b1118");

    const camera = new PerspectiveCamera(45, 1, 0.1, 2000);
    camera.position.set(2.8, 1.8, 4.2);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth || 1, host.clientHeight || 1);
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: MOUSE.PAN,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: MOUSE.PAN,
    };

    scene.add(new AmbientLight("#a3b8cb", 1.2));

    const keyLight = new DirectionalLight("#ffffff", 1.35);
    keyLight.position.set(5, 6, 7);
    scene.add(keyLight);

    const rimLight = new DirectionalLight("#58d6e6", 0.45);
    rimLight.position.set(-5, 2, -4);
    scene.add(rimLight);

    sceneRef.current = scene;

    let frameId = 0;
    const renderFrame = () => {
      frameId = window.requestAnimationFrame(renderFrame);
      controls.update();
      helperRef.current?.update();
      renderer.render(scene, camera);
    };
    renderFrame();

    const resizeObserver = new ResizeObserver((entries) => {
      const next = entries[0];
      if (!next) {
        return;
      }

      const width = next.contentRect.width || 1;
      const height = next.contentRect.height || 1;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);

      if (previewRootRef.current) {
        fitCameraToObject(camera, controls, previewRootRef.current);
      }
    });
    resizeObserver.observe(host);

    cameraRef.current = camera;
    controlsRef.current = controls;

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      disposeHelper(helperRef.current);
      if (previewRootRef.current) {
        disposePreviewMaterials(previewRootRef.current);
      }
      renderer.dispose();
      host.innerHTML = "";
      helperRef.current = null;
      previewRootRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) {
      return;
    }

    if (helperRef.current) {
      scene.remove(helperRef.current);
      disposeHelper(helperRef.current);
      helperRef.current = null;
    }

    if (previewRootRef.current) {
      disposePreviewMaterials(previewRootRef.current);
      scene.remove(previewRootRef.current);
      previewRootRef.current = null;
    }

    if (!sceneRoot) {
      return;
    }

    const previewRoot = clone(sceneRoot) as Group;
    clonePreviewMaterials(previewRoot);
    previewRootRef.current = previewRoot;
    scene.add(previewRoot);
    fitCameraToObject(camera, controls, previewRoot);
  }, [sceneRoot]);

  useEffect(() => {
    applyPreviewSelectionState(previewRootRef.current, selectedMeshId, selectedInfluenceMeshIds);
  }, [sceneRoot, selectedMeshId, selectedInfluenceMeshIds]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    if (helperRef.current) {
      scene.remove(helperRef.current);
      disposeHelper(helperRef.current);
      helperRef.current = null;
    }

    const selectedObject = findBySelectionId(previewRootRef.current, selectedMeshId);
    if (!selectedObject) {
      return;
    }

    const helper = new BoxHelper(selectedObject, 0x67d9ef);
    helperRef.current = helper;
    scene.add(helper);
  }, [sceneRoot, selectedMeshId]);

  return (
    <div className={styles.root}>
      <div ref={hostRef} className={styles.host} />

      <div className={styles.hint}>MMB rotate • Wheel zoom • Drag pan</div>
    </div>
  );
}

function clonePreviewMaterials(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh || node instanceof SkinnedMesh)) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material = node.material.map((material) => clonePreviewMaterial(material));
      return;
    }

    node.material = clonePreviewMaterial(node.material);
  });
}

function disposePreviewMaterials(root: Object3D): void {
  root.traverse((node) => {
    if (!(node instanceof Mesh || node instanceof SkinnedMesh)) {
      return;
    }

    if (Array.isArray(node.material)) {
      node.material.forEach((material) => material.dispose());
      return;
    }

    node.material.dispose();
  });
}

function applyPreviewSelectionState(
  root: Object3D | null,
  selectedMeshId: string | null,
  selectedInfluenceMeshIds: string[],
): void {
  if (!root) {
    return;
  }

  const influenceMeshIds = new Set(selectedInfluenceMeshIds);
  root.traverse((node) => {
    if (!(node instanceof Mesh || node instanceof SkinnedMesh)) {
      return;
    }

    const selectionId =
      typeof node.userData.selectionId === "string" ? node.userData.selectionId : null;
    const isTarget = selectionId !== null && selectionId === selectedMeshId;
    const isInfluence = selectionId !== null && influenceMeshIds.has(selectionId);

    applyMaterialState(node.material, {
      dimmed: !isTarget && !isInfluence,
      highlighted: isTarget,
    });
  });
}

function applyMaterialState(
  material: Material | Material[],
  state: { dimmed: boolean; highlighted: boolean },
): void {
  if (Array.isArray(material)) {
    material.forEach((entry) => applyMaterialState(entry, state));
    return;
  }

  const previewMaterial = material as Material & {
    color?: { multiplyScalar: (value: number) => void; copy?: (value: unknown) => void };
    emissive?: { copy: (value: Color) => void; setRGB: (r: number, g: number, b: number) => void };
    userData: Record<string, unknown>;
  };
  const originalState = previewMaterial.userData[PREVIEW_ORIGINAL_STATE_KEY] as
    | {
        depthWrite: boolean;
        emissive?: Color | null;
        opacity: number;
        transparent: boolean;
      }
    | undefined;

  if (!originalState) {
    return;
  }

  if (state.dimmed) {
    material.transparent = true;
    material.opacity = 0.14;
    material.depthWrite = false;
  } else {
    material.transparent = originalState.transparent;
    material.opacity = originalState.opacity;
    material.depthWrite = originalState.depthWrite;
  }

  if (previewMaterial.emissive) {
    if (state.highlighted) {
      previewMaterial.emissive.setRGB(0.04, 0.12, 0.14);
    } else {
      previewMaterial.emissive.copy(originalState.emissive ?? new Color(0, 0, 0));
    }
  }

  material.needsUpdate = true;
}

function clonePreviewMaterial(material: Material): Material {
  const cloned = material.clone();
  const previewMaterial = cloned as Material & {
    emissive?: Color;
  };
  cloned.userData = {
    ...cloned.userData,
    [PREVIEW_ORIGINAL_STATE_KEY]: {
      depthWrite: cloned.depthWrite,
      emissive: previewMaterial.emissive?.clone() ?? null,
      opacity: cloned.opacity,
      transparent: cloned.transparent,
    },
  };
  return cloned;
}

function disposeHelper(helper: BoxHelper | null): void {
  if (!helper) {
    return;
  }

  helper.geometry.dispose();
  if (Array.isArray(helper.material)) {
    helper.material.forEach((material) => material.dispose());
    return;
  }

  helper.material.dispose();
}
