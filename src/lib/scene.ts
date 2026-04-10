import { Box3, MathUtils, type Object3D, PerspectiveCamera, Vector3 } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const center = new Vector3();
const size = new Vector3();
const framingOffset = new Vector3(0.72, 0.38, 1).normalize();

export function fitCameraToObject(
  camera: PerspectiveCamera,
  controls: OrbitControls,
  object: Object3D,
): void {
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) {
    return;
  }

  bounds.getCenter(center);
  bounds.getSize(size);

  const halfVerticalFov = MathUtils.degToRad(camera.fov * 0.5);
  const halfHorizontalFov = Math.atan(Math.tan(halfVerticalFov) * camera.aspect);
  const radius = Math.max(size.length() * 0.5, 0.5);
  const fitHeightDistance = radius / Math.max(Math.sin(halfVerticalFov), 0.001);
  const fitWidthDistance = radius / Math.max(Math.sin(halfHorizontalFov), 0.001);
  const distance = Math.max(fitHeightDistance, fitWidthDistance) * 1.08;

  camera.position.copy(center).addScaledVector(framingOffset, distance);
  camera.near = Math.max(distance / 100, 0.01);
  camera.far = Math.max(distance * 12 + radius * 4, 50);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}
