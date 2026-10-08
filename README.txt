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
M during gameplay: immediately start the next of five gameplay tracks, wrapping back to the first.
P (temporary debug): cycle all 16 soundtrack entries, restarting each at its authored tempo.
M does not mute. Options contains Mute All and independent music, effects and voice volume sliders.
Options and Developer Settings are separate main-menu entries. Developer Settings require returning to the hangar.
Click outside any closable dialog to dismiss it; the pause screen requires Resume or Esc.
The game pauses when hidden or unfocused. Menu buttons retain keyboard navigation.

PAUSE AND CONTROLS MENUS
Pause is a compact centered overlay over the frozen play session, with the Star Hound / Bone Chaser logo,
a larger Resume Flight button, and Return to Hangar underneath. Tab and Up/Down cycle the two buttons.
Resume or Esc continues the same session, including a paused crash. Return to Hangar retains the checkpoint.
The defeat results have their own panel and retain statistics and the New Flight action.
The manual shows only stacked WASD/arrows for Steer, Space for Fire Weapon, and Esc for Pause.
Its keys and labels are centered as three compact pairs; other gameplay bindings remain available.
Both menus use the bundled chunky font and title-screen colors. The transparent pause logo and its
built-in image-generation prompt are saved in assets/title/star-hound-logo-v1.png and the adjacent prompt file.

FLIGHT AND DIFFICULTY
Three lives, endless four-wave sectors, no finish line or victory screen.
Difficulty is continuous with distance traveled: (distance / growth distance * multiplier) ^ exponent.
The active defaults use a 33,000-unit growth distance, multiplier 1 and exponent 0.9.
Cruise speed grows from 75 by 15 per difficulty unit, capped at 500 before bonuses.
Obstacle spacing starts at 150, decays exponentially with difficulty and bottoms out at 38.
Group size, enemy/rock health, enemy drift, firing intervals and escort/firing thresholds all use
that same progression. Every starting value, growth rate, threshold and limit is in Developer Settings.
No difficulty transition is tied to a numbered wave. A multiplier of zero freezes starting difficulty;
individual growth/decay controls can also be zero. Wave length controls checkpoints and bonus stretches.
Shoot drones/rocks and avoid indestructible orange barriers. Outer flight boundaries only constrain steering;
they are not collision hazards. Path bends are more dramatic visually and require no corrective steering.
Background stations, rock clusters and satellites are decorative and checked against the curved
flight corridor, with at least 28 units of clearance beyond both the corridor and the object's bounds.
A seeded distance plan alternates open space (60% of route distance by default) with circular tunnels,
fly-through stations and long cruisers. Checkpoint outlines fit the current enclosure or station door. Tunnel walls and offset station doors cause collisions. Stations
have industrial bulkheads and crates; their entry and exit approaches stay clear of random encounters.
Cruisers are non-colliding polyhedral sections following the path on the left, right or bottom.
Background rocks share a color within each cluster. Motif lengths, weights and open share are tunable.
Speed rings appear in offset hexagonal series of 3–7. Their edges never damage the ship. Each successful
pass changes the ring color, raises the next chime and adds a capped speed bonus that gradually decays.
A miss resets the chime sequence while preserving earned speed; collisions reduce or clear ring bonuses.
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
Rocks, orange barriers, tunnel walls and station bulkheads remove 60% of maximum hull per unprotected hit.
Enemy contact and projectile damage retain their existing values; hit immunity and shields still apply.

FLIGHT INSTRUMENTS
Lives are a large integer and dog-ship icon at the upper left. Velocity reads NNN KM/S, expanding above 999.
Two thin 100-degree heat arcs follow the projected player ship, filling from bottom to top on each side.
Heat glows orange above 60% and red above 90%, returning to pale blue as it cools.
The wide, thick bottom hull bar has an orange frame and a neon green healthy fill. It smoothly interpolates
when damaged or repaired, flashes on hits, glows orange at 40% and red at 12%, and returns to green above 40%.
Sector/wave labels, checkpoint text, bottom instructions, track information and weapon text are removed.
The upper-right music debug remains. Pause uses translucent brushed metal over the frozen flight.

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
The gameplay order is Copper Funk, Iron Drive, Glass Arcade, Neon Pursuit and Afterburner Velvet.
Each complete arrangement plays once, independently of waves or motifs, then fades out. A 0.6-second
silent gap precedes the next arrangement's fade-in. The sequence repeats after the fifth track.
Every new flight starts with Copper Funk, including Play Now and checkpoint launches.
Gameplay tempo follows the existing absolute-speed rule, with half the previous rate of tempo growth.
Invincibility retains gameplay music. Solar Disco, Goodboy Forever, Heavy Orbit and Solar Relay remain
available in the temporary preview catalog but are absent from automatic gameplay selection.
The hangar requests imported Title Music immediately on game startup. If the browser blocks autoplay,
any menu click or key press retries the same playback request; there is no click-to-play screen.
Original Soft Launch remains available in preview. Drifting Home keeps its defeat-screen role.
Imported Rainbow Victory, Pause Music, Death Music and Wave Victory Fanfare are preview-only.
Pause and Death Music have identical musical settings; their separate catalog entries retain the source names.
M immediately selects the next gameplay track, including during invincibility.
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
js/route.js: seeded distance plan, shared motif dimensions/collision surfaces, ring placement and pass detection.
js/environment.js: bounded motif geometry, decorative scenery, rings and checkpoint gates.
js/music.js: resource-free track selection and unified scheduled music rendering.
js/sound.js: shared Web Audio ownership, mixing, voices/effects lifecycle and layered explosions.
js/voices.js: local voice playback and one-speaker queue.
js/interface.js: HUD instruments, confirmation dialog, menus and checkpoint checkmark.
js/controls.js: main-menu developer overrides, seed, Play Now and complete settings export.
js/hangar.js: original aligned title animation. js/three-loader.js: registers the pinned CDN engine.

DEVELOPER SETTINGS
Available only in the main menu, with no tuning keyboard shortcuts. Apply saves every numeric field
and the selected seed under starhound.developer-settings.v1 in local storage. Applied settings take
priority over checkpoint rules, including after reload or a crash; checkpoints retain run progress.
Apply does not launch or restart a wave. Play Now saves the form and immediately launches a fresh
run at the selected wave with starting equipment and lives, replacing the checkpoint.
Minimum space between pickups is a distance along the route, shared by scheduled pickups and enemy drops.
Path opportunities form a seeded grid at this minimum spacing, without bonus-stretch or checkpoint overrides.
Pickup frequency (0–1) is the probability at each eligible grid slot or enemy kill. Zero disables both
sources, one uses every opportunity allowed by the gap, and intermediate values give reproducible thinning.
Accepted pickups reserve their distance even after collection; drops cannot bypass nearby path reservations.
Default minimum spacing is 500, with frequency 1. Larger gaps reduce density; lower frequency leaves empty slots.
Existing developer saves and checkpoints migrate to the new fields, retaining seed and run progress.
Reset Defaults restores authored values in the form; Apply saves them. If storage is blocked, settings
remain usable for the session and the menu explains that they cannot survive a reload.
Copy Complete Settings.js exports the entire classic settings script, including overrides and seed.
If clipboard access is blocked, select/copy the supplied text and replace js/settings.js manually.

VERIFICATION
node work/qa/difficulty-pickups.cjs verifies continuous difficulty, zero-growth controls, monotonic limits,
collision recovery, seeded pickup probability, spacing across both sources, actual enemy destruction,
settings persistence/export, checkpoint history and migration from both earlier checkpoint generations.
node work/qa/difficulty-pickups-browser.cjs verifies the real developer form, constraint errors, saved
controls after reload, zero/full pickup frequency, minimum gaps and Play Now/checkpoint compatibility.
It uses the same local Chrome/Playwright runtime and optional cached /tmp/starhound-three-r160.min.js as route QA.
node work/qa/pause-redesign.cjs verifies the real browser's minimal manual and centered pause menu at desktop,
phone and short landscape sizes, focus cycling/activation, frozen session and crash resume, retained checkpoints
and separate defeat results. Screenshots are saved in output/qa/menus/.
node work/qa/menu-check.cjs checks menu lifecycle, checkpoint choices, settings and keyboard navigation.
node work/qa/route-check.cjs verifies persisted overrides, checkpoint precedence, deterministic route share,
tunnel/portal/bulkhead collisions, cruiser sides, swept ring hits/misses, pitch reset and speed decay.
node work/qa/route-browser.cjs verifies real menus, storage reload, Play Now, motif geometry, color-grouped
rocks and hexagonal ring feedback; screenshots are saved in output/qa/route/.
node work/qa/music-check.cjs verifies original score parity, every catalog entry, preview/playlist behavior,
title/defeat roles and uninterrupted invincibility, exported settings, one shared scheduler, mute/ducking, paused previews and cleanup.
An optional argument naming the original Stardog export verifies all nine imported arrangements and synthesis
parameters against that reference file over each complete loop.
node work/qa/redesign-rules.cjs checks collision penalties/immunity, 1.2-second recovery, all firing upgrades,
overheat recovery at multiple frame intervals, guaranteed wave saves, all three 2.6-second crashes and rollback,
quarter-frequency invincibility on paths/drops, seven food models, tempo scaling, scenery clearance, seed replay,
blocked storage, legacy checkpoint import, exhausted-life clearing and complete settings export.
node work/qa/redesign-browser.cjs exercises the real Three.js renderer and Web Audio in desktop Chrome:
title autoplay and browser-policy fallback, all 16 P previews, one-shot fanfare, five-track switching, confirmation-dialog resume,
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
