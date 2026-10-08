STAR HOUND — BONE CHASER
Live source folder: /Users/mana/codex/starhound
A desktop, keyboard-controlled Three.js space runner. No install, build, backend or server required.

ARCHIVED VERSION
archives/starhound-before-redesign-2026-10-07/ is the uncompressed, verified snapshot made BEFORE this redesign.
It contains all 145 original working-folder files, including assets, work/, output/ and hidden files.
Git metadata and recursive archive folders are excluded. Open that folder's index.html to play the previous version.
The archive keeps its original checkpoint storage key. The redesigned game uses a separate versioned key;
valid original checkpoints are imported once with the firing/density adjustments, without modifying the archived save.

LOCAL PLAY
Double-click index.html. Keep index.html, style.css, js/ and assets/ together.
Three.js r160 loads from a pinned CDN, so internet is required. All scripts are ordered classic scripts;
there are no modules, import maps or fetched local files. Artwork, fonts and voices are local.

STATIC HOSTING
Publish index.html, style.css, js/, assets/, README.txt and .nojekyll at the site root.
Relative paths support repository subpaths. No build step is needed.
work/, output/ and archives/ are development/history folders and are not required to play the new game.

CONTROLS
WASD / arrows: steer. Space: hold fire. Shift: boost using speed charge.
Esc: pause/resume, including during a crash. Enter: launch from the hangar.
M during gameplay: immediately start the next of eight gameplay tracks, wrapping back to the first.
P (temporary debug): cycle all 16 soundtrack entries, restarting each at its authored tempo.
M does not mute. Options contains Mute All and independent music, effects and voice volume sliders.
F2: open/close Options and flight tuning. Close it, then resume flight.
[ / ]: previous/next wave (tuning shortcuts replace the current checkpoint).
The game pauses when hidden or unfocused. Menu buttons retain keyboard navigation.

FLIGHT AND DIFFICULTY
Three lives, endless four-wave sectors, no finish line or victory screen.
Starting encounter spacing is 210 units (previously 230), falling toward 82 at wave 16 (previously 95).
The initial difficulty curve uses exponent 0.9 for a slightly steeper early ramp.
Wave-dependent cruising speed and endless speed growth retain their existing progression.
Shoot drones/rocks and avoid indestructible orange barriers. Outer flight boundaries only constrain steering;
they are not collision hazards. Path bends are more dramatic visually and require no corrective steering.
Stations, asteroids and satellites are decorative. Their bounding spheres are checked against the curved
flight corridor, with at least 28 units of clearance beyond both the corridor and the object's bounds.
The camera follows steering more tightly while keeping its original distance and field of view.

COLLISION SPEED
Speed bonuses have explicit charge, turbo and held-boost contributions. Turbo/boost activation compounds
with active bonuses, while collisions can reduce all current contributions together.
Hitting a rock or orange barrier immediately stops forward movement, clears charge and turbo, cancels boost,
and accelerates back to that wave's cruising speed over 1.2 seconds with a quadratic ease-in.
Held Shift cannot reactivate a canceled boost until it is released and pressed again.
Hitting an enemy immediately retains 55% of forward speed and 67% of the current bonus above cruise:
a 2.0x modifier becomes 1.67x. Forward speed recovers over 1.2 seconds; the lost bonus is not restored.
Speed penalties apply during invincibility and are independent of hull damage immunity.
Enemy projectiles still cause hull damage but are not physical obstacle/enemy momentum collisions.

CANNON AND FOOD PICKUPS
Infinite ammunition, four cannon tiers (1/2/4/6 barrels), fire-rate and cooling upgrades through IV.
Base firing interval is 0.11 seconds, half the original 0.22, with the same reduction at every firing upgrade.
Heat per volley, cooling and the extra 0.5-second overheat lock are unchanged; faster overheating is intentional.
Milk bone: speed charge +10–15. Drumstick: cannon upgrade. Bacon: firing upgrade. Cheese: cooling upgrade.
Paw biscuit: invincibility for 7 seconds. Sausage: 1.4x turbo for 7 seconds. Kibble bowl: hull repair +10–25%.
Each food has a distinct natural-colored silhouette and an effect-colored orbit.
Invincibility opportunities retain only 25% of their previous frequency, both on the path and in enemy drops.
Other pickup types replace the removed opportunities, preserving overall pickup/drop frequency.
During invincibility, all dog/ship materials smoothly cycle through the rainbow once per second.
The invincibility icosphere is gone. The separate three-second respawn shield remains unchanged.

CHECKPOINTS, CRASHES AND RESUME
A large, luminous circular gate encloses the full flight corridor at each wave boundary and cannot be missed.
Passing it saves the wave start and triggers a short fanfare, two particle fireworks and a large checkmark.
A checkpoint retains seed, rules, lives, upgrades, charge, score and counters. Gameplay continues during saving.
Every lost life scatters the ship into debris, visibly ejects the dog beneath a parachute, stops all music,
and plays a deep bass explosion. Simulation waits 2.6 seconds before restoring the checkpoint or showing defeat.
Pause freezes the crash timer and presentation. Each crash consumes exactly one life.
With lives remaining, restore full hull and the original three-second respawn protection. Collected upgrades,
charge and score since the checkpoint roll back; elapsed time and best wave carry forward.
After all lives are lost, the checkpoint is cleared and the defeat screen/music appear only after the crash.
Start Fresh offers equal-sized, stacked New Flight / Resume Checkpoint choices. Resume launches gameplay immediately.
A new flight replaces the previous checkpoint. Options audio preferences persist independently of game checkpoints.
Blocked local storage falls back to session checkpoints; malformed saves are ignored safely.
Browser rules for file:// storage may vary.

MUSIC AND EFFECTS
One catalog in settings.js defines all 16 music entries, their roles, palettes, arrangements and mix profiles.
The original gameplay tracks remain: Copper Funk, Glass Arcade, Afterburn Velvet and Solar Disco.
The playlist adds Iron Drive, Neon Pursuit, Heavy Orbit and Solar Relay from the imported Stardog soundtrack.
Gameplay tempo follows the existing absolute-speed rule, with half the previous rate of tempo growth.
Automatic sector changes advance the current eight-track playlist choice, including after manual M switches.
Manual switches restart the selected track. Automatic/temporary returns retain their arrangement position.
The hangar requests imported Title Music immediately on game startup. If the browser blocks autoplay,
any menu click or key press retries the same playback request; there is no click-to-play screen.
Original Soft Launch remains available in preview. Goodboy Forever and Drifting Home keep their normal roles.
Imported Rainbow Victory, Pause Music, Death Music and Wave Victory Fanfare are preview-only.
Pause and Death Music have identical musical settings; their separate catalog entries retain the source names.
M during invincibility immediately selects the next gameplay track for the rest of that invincibility period.
The temporary top-right black/red debug box shows the actual track, BPM, preview mode and locked/muted/paused state.
P cycles every catalog entry at authored tempo. A preview persists through sector changes and powerups, then
clears on a screen/mode change or M. A paused preview auditions music without resuming flight or effects.
The wave fanfare plays once and reports FINISHED. Crashes always silence music, including previews.
Set music.debug.enabled=false in settings.js to disable the debug overlay and its preview shortcut.
MusicDirector owns selection; MusicTransport owns a single scheduler, source cleanup and event rendering.
Score-format arrangers emit common synthesis events. Imported voices keep their distortion, filter sweeps and
instrument echoes. No separate imported player or AudioContext is created. SoundEngine owns the shared mix.
Music and effects have separate ambience returns behind their own volume controls; muting a channel also mutes its tails.
Enemy explosions use a sharp bass drop and brighter noise; rock explosions use a lower, rougher rumble.
Ship crashes have the deepest, longest explosion. Character voices retain their one-speaker queue and music ducking.
js/music_export.js is the older standalone seven-track snapshot, not a source for the game's live catalog.

VISUAL EFFECTS
Exhaust uses soft smoke and luminous plasma sprites rather than triangle meshes.
Star streaks grow continuously from absolute speed, including normal cruise, independently of turbo/boost flags.
Streaks align with the camera's forward axis, without arbitrary particle rotation.
Radial camera blur and temporal motion trails start above speed 155, reaching full strength at 300.
The HUD stays sharp at first; its blur begins above 240, increasing to 3 pixels at 420.
These thresholds are centralized in speedEffects in js/settings.js.
Title artwork, animation, ship/dog models and enemy varieties are retained. The demo targets desktop browsers.

SOURCE RESPONSIBILITIES
js/settings.js: numerical rules, bonus/recovery state, crash timing, checkpoint schema, pickup models,
seeded content, music scores, effects/scenery parameters and tuning/export.
js/game.js: lifecycle, input and frame coordination.
js/systems.js: encounter/firing/collision simulation and typed presentation events.
js/checkpoints.js: persistence, legacy migration and restoration after the crash completes.
js/scene.js: ship/entity rendering, rainbow material ownership, camera and debris/dog presentation.
js/effects.js: pooled sprite particles, aligned star streaks and radial/temporal render passes.
js/environment.js: bounded decorative scenery and checkpoint gates, independent of gameplay randomness.
js/music.js: resource-free track selection and unified scheduled music rendering.
js/sound.js: shared Web Audio ownership, mixing, voices/effects lifecycle and layered explosions.
js/voices.js: local voice playback and one-speaker queue.
js/interface.js: HUD, confirmation dialog, menus and checkpoint notices.
js/controls.js: numeric tuning, seed, jumps and complete settings export.
js/hangar.js: original aligned title animation. js/three-loader.js: registers the pinned CDN engine.

TUNING
Applying numeric overrides restarts the wave while retaining upgrades and lives. Audio sliders apply separately
and never restart the wave. Checkpoint resumes retain their saved numerical rules and seed.
Copy Complete Settings.js exports the entire classic settings script, including overrides and seed.
If clipboard access is blocked, select/copy the supplied text and replace js/settings.js manually.

VERIFICATION
node work/qa/music-check.cjs verifies original score parity, every catalog entry, preview/playlist behavior,
existing special roles, exported settings, one shared scheduler, mute/ducking, paused previews and cleanup.
An optional argument naming the original Stardog export verifies all nine imported arrangements and synthesis
parameters against that reference file over each complete loop.
node work/qa/redesign-rules.cjs checks collision penalties/immunity, 1.2-second recovery, all firing upgrades,
overheat recovery at multiple frame intervals, guaranteed wave saves, all three 2.6-second crashes and rollback,
quarter-frequency invincibility on paths/drops, seven food models, tempo scaling, scenery clearance, seed replay,
blocked storage, legacy checkpoint import, exhausted-life clearing and complete settings export.
node work/qa/redesign-browser.cjs exercises the real Three.js renderer and Web Audio in desktop Chrome:
title autoplay and browser-policy fallback, all 16 P previews, one-shot fanfare, eight-track switching, confirmation-dialog resume,
equal buttons, HUD placement, Options volumes/mute, rainbow
restoration, food/gate rendering, blur shaders, dog ejection, pausing and delayed respawn/defeat.
Browser checks also render explosion audio offline to compare bass/loudness with the original effect, and
launch the game directly from file:// at 1280x720. They use the host's bundled Playwright and Chrome,
and can use a temporary cached r160 engine.
Screenshots are saved in output/qa/redesign/. Historical QA scripts target their earlier revisions.

DEPENDENCIES AND ASSETS
Three.js r160 classic CDN: https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js (MIT).
Lilita One is bundled locally; its SIL Open Font License is in assets/fonts/OFL-LilitaOne.txt.
The original hangar assets and 16 prerecorded character voices remain under assets/.
Voice provenance, generation details and license notes are beside the audio clips.
