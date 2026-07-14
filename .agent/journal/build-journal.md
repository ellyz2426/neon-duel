# Build Journal: Neon Duel VR (#110)
**Date:** 2026-07-14 PM cycle
**Genre:** Wild West Quickdraw Showdown

## Round 1 — Scaffold & Core Implementation
- Scaffolded project from neon-keeper template (IWSDK 0.4.1+/Vite 7)
- Manual node_modules fix (npm install hangs, copied from neon-keeper, merged nested dirs, created .bin symlinks)
- Implemented full game-system.ts (~1,660 LOC):
  - 10 campaign opponents with escalating difficulty
  - 4 game modes (Campaign, Quick Draw, Survival, Time Trial)
  - 3 difficulty levels
  - Quickdraw mechanics: standoff → draw signal → reaction timing
  - Scoring with streak bonuses
  - 20 achievements with persistent localStorage save
  - Procedural SFX (10+ types) and generative music
  - 3D Western environment (buildings, street lamps, tumbleweeds, dust, stars)
  - VR controller input + browser crosshair

## Round 2 — PanelUI Templates & Deploy
- Created 8 .uikitml templates (513 lines): main-menu, mode-select, hud, result, game-over, settings, achievements, stats
- All panels compiled clean
- GitHub repo created and deployed to Pages

## Round 3 — HUD Visibility (Failed Attempt)
- Problem: HUD panel (ScreenSpace + Follower) renders on menu screen
- Tried: `object3D.visible = false` — ScreenSpace ignores it
- Tried: `scale.set(0, 0, 0)` — ScreenSpace overrides scale every frame
- Tried: `removeFromParent()` — ScreenSpace renders independently of scene graph
- All three approaches failed

## Round 4 — HUD Fix & Finalize
- **Solution:** Dynamically add/remove ScreenSpace and Follower ECS components
  - When hiding HUD: `entity.removeComponent(ScreenSpace)`, `entity.removeComponent(Follower)`
  - When showing HUD: `entity.addComponent(ScreenSpace, {})`, `entity.addComponent(Follower, {...})`
  - Don't add ScreenSpace/Follower at creation time at all
- Screenshot confirmed: HUD text gone from menu, environment renders cleanly
- Cleaned non-ASCII characters (em-dashes in comments → ASCII hyphens)
- All 5 preflight checks pass
- Redeployed to GitHub Pages
- Source committed and pushed to master

## Key Learning
**ScreenSpace component behavior:** ScreenSpace renders completely independently of the Three.js scene graph. It ignores `object3D.visible`, `scale`, `position`, and `removeFromParent()`. The ONLY way to hide a ScreenSpace panel is to remove the ScreenSpace component from the entity entirely. This is critical knowledge for all future IWSDK builds using ScreenSpace HUDs.

## Final Stats
- **LOC:** 2,207 (1,694 TS + 513 uikitml)
- **Panels:** 8
- **Achievements:** 20
- **Build time:** ~35 min across 4 rounds
