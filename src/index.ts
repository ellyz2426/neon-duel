import {
  World,
  PanelUI,
  Follower,
  ScreenSpace,
} from '@iwsdk/core';
import { GameSystem } from './game-system';

async function main() {
  const container = document.getElementById('scene-container')! as HTMLDivElement;

  const world = await World.create(container, {
    xr: { offer: 'once' },
    render: {
      fov: 70,
      near: 0.01,
      far: 500,
      defaultLighting: false,
      camera: { position: [0, 1.6, 0], lookAt: [0, 1.5, -10] },
    },
    input: { canvasPointerEvents: true },
    features: {
      locomotion: false,
      grabbing: false,
      physics: false,
      spatialUI: true,
    },
  });

  world.registerSystem(GameSystem);
}

main();
