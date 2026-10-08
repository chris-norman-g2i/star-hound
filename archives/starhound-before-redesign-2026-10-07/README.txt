STAR HOUND — BONE CHASER
Live source folder: /Users/mana/codex/starhound
A static, keyboard-controlled Three.js space runner. No install, build, backend or server required.

LOCAL PLAY
Double-click index.html. It opens directly using file://.
Keep index.html, style.css and js/ together. Three.js loads from a pinned CDN; internet is required.
The supplied hangar artwork is stored locally in assets/title/hangar-reference.png. Keep assets/ with the page.
All scripts use ordered classic script tags and register on window.Starhound. No modules, import maps or fetched local files.
System fonts are available if Google Fonts cannot load.

GITHUB PAGES
Commit index.html, style.css, js/, assets/, README.txt and .nojekyll to your repository root.
Exclude work/ (development checks and scratch files).
In GitHub Settings > Pages, deploy from your branch and / (root). No Actions build or npm commands.
Relative asset paths work under repository subpaths.

CONTROLS
WASD / arrows: steer. Space: hold fire. Shift: boost with speed charge.
Esc / P: pause or resume. M: sound. Enter: launch from hangar.
Tab, Shift+Tab, Enter and Space operate all menu buttons and inputs.
Title menu: Up/Down select Start Flight, Continue, Flight Manual or Options; Enter confirms. Continue is disabled without a checkpoint.
F2: tuning panel (pauses an active run). Close it, then resume flight.
[ / ]: previous / next wave during a run. These tuning shortcuts replace its checkpoint.
The game pauses when hidden or unfocused.

ENDLESS FLIGHT
Three lives. No finish line or win condition. Four-wave sectors continue with cycling names/colors.
The first sixteen waves target a 2–5 minute challenge; cruising through them takes about 3m42s in simulation.
Difficulty increases noticeably from wave 4 and adds combined barriers/enemies from wave 7.
Speed and density keep increasing after wave 16. Ten-minute survival needs exceptional luck and skill.
Every wave starts with a quiet bonus stretch, extra charges and repairs. Gameplay never stops between waves.
Shoot drones/rocks, dodge indestructible orange barriers. Enemies drop pickups.

CANNON & PICKUPS
Infinite ammunition; no clips, reloads or reload key. Hold or feather Space.
Cannon tiers: single > double > quadruple > sextuple. Fire-rate and cooling upgrades cap at IV.
Overheating locks firing until fully cooled, plus 0.5 seconds. Cooling upgrades speed heat recovery.
Charge: +10–15. Repair: +10–25% hull. Turbo: 1.4x for 7s. Invincibility: 7s with countdown.
Manual boost has its own multiplier and can stack with turbo while draining charge.
All seven pickup types have distinct polygon silhouettes, colors and synthesized sounds.
Each barrel has a reticle marker projected onto its actual forward firing path.
Tunnel walls/rails are faint, fog is reduced, and speed/impact overlays complement trails and explosions.

AUTOMATIC WAVE CHECKPOINTS
A checkpoint records the start of the current wave: seed, rules, lives, upgrades, charge, score and counters.
On a lost life, restart there with full hull and a three-second protection shield.
Upgrades/score/charge collected since that checkpoint roll back. Total flight time keeps counting across deaths.
Resume from checkpoint appears in the hangar when a checkpoint exists. There is no manual save UI or save slot.
New run warns that it clears the previous checkpoint. Losing all lives clears the checkpoint and shows results.
Browser local storage retains automatic checkpoints across page reloads when supported. Browser rules for file:// storage vary.
If storage is blocked, session checkpoints still work and the hangar explains that closing loses them.
Malformed or incompatible checkpoints are ignored safely. Resuming restores the checkpoint's seed and numeric rules.

TUNING & REPRODUCIBILITY
F2 or Flight Tuning opens numeric overrides, a selectable seed and wave jump controls.
Applying overrides restarts the current wave, keeping current upgrades, counters and remaining lives.
Selected seed applies to new runs; checkpoint resumes retain their seed.
Gameplay random values are isolated from visual/audio randomness. Wave layouts repeat with the same seed and rules.
Copy Complete Settings.js copies a self-contained classic settings script, including overrides and selected seed.
Paste it over the ENTIRE js/settings.js file in your IDE, then reload the page.
If clipboard access is blocked on file://, the full replacement appears selected in a text box: copy it with Ctrl+C / Cmd+C.
No server or additional setup is needed. Specialized visual/music configurators are deferred to polish.

TITLE SCREEN
The Starhound / Bone Chaser painting uses a clean static background with its original scarf and tail removed, with a responsive, uncropped composition.
Separate transparent scarf and tail sprite DIVs show eight stronger-wind frames, each lasting 0.24 seconds (1.92-second loop), plus very subtle hangar-light changes.
The tail is 20% thinner and 20% longer. Both attachment points stay fixed against the background.
Animation pauses out of the hangar. Reduced-motion preferences hold a static frame. The logo, camera and ship stay fixed.
Title timing, sprite positions, proportions and lighting values are centralized in gfx.hangar in js/settings.js.
Generated asset descriptions and image-generation prompts are recorded in assets/title/asset-notes.txt.
Options opens the existing tuning controls and includes the sound toggle. All menu actions support keyboard navigation.

PAUSE SCREEN
The pause and run-results panel uses the husky hangar artwork, cool blue framing, orange selected actions and chunky rounded Lilita One lettering.
Flight time, takedowns and points have separate readable labels. Resume, new-flight checkpoint confirmation and return-to-hangar behavior are retained.
The display font is bundled in assets/fonts/ alongside its SIL Open Font License, so it works without a font-service connection.
The menu adapts to phones and short landscape screens, with a visible keyboard-focus outline.

SCRIPTS
js/settings.js: all constants, numerical rules, procedural assets/particles/music, seeded randomness, checkpoint data and tuning/export.
js/game.js: entry point and lifecycle/frame orchestration.
js/systems.js: encounters, firing, collision events, pickups and life-loss dispatch.
js/checkpoints.js: automatic checkpoint persistence, resume, respawn and storage fallback.
js/controls.js: tuning/seed UI, export clipboard fallback and wave navigation.
js/scene.js: Three.js resources, dog/starship meshes, projected reticle, open-space tunnel and particles.
js/hangar.js: aligned sprite DIVs, eight title frames, subtle lights and reduced-motion handling.
js/interface.js: menus, HUD, checkpoint notices, manual, pause and defeat results.
js/sound.js: Web Audio instruments, stereo effects, drums, engine, scheduling and transitions.
js/voices.js: prerecorded character dialogue, one-speaker queue, cooldowns and pause/mute handling.
js/three-loader.js: registers the CDN engine on Starhound.

ORIGINAL MUSIC (7 TRACKS)
Soft Launch: mellow intro. Copper Funk: syncopated bass/plucks. Glass Arcade: glass arpeggios.
Afterburn Velvet: broken-beat synth. Solar Disco: disco harmonies. Goodboy Forever: invincibility dance.
Drifting Home: downtempo defeat. Gameplay tempo follows speed; invincibility stays at 104 BPM.
Track changes crossfade and resume remembered arrangement positions after temporary invincibility.
Audio is synthesized locally with Web Audio and unlocked by a player gesture.

CHARACTER VOICES (16 CLIPS)
Seven cool male dog-hero lines and nine female ship-computer lines live in assets/audio/voices/.
They were generated locally with free Kokoro TTS; no speech API or model runs in the game.
Open assets/audio/voices/preview.html to audition every line or play a character's full set.
Launch, wave checkpoints, continuation, ship loss and respawn trigger announcements.
Hits, low hull, enemy kills, powered pickups and close hazard passes trigger occasional hero quips.
Pickup praise and bonus-stretch encouragement rotate with a shared chatter cooldown.
Only one voice plays at once; announcements take priority and music/effects soften during speech.
M controls all sound, pause holds the current phrase, and returning to the hangar clears dialogue.
Voice volume, spacing and file paths are configured in settings.voices in js/settings.js.
Keep assets/audio/voices/ with the game on both file:// and GitHub Pages.
Exact phrases, generation settings, source links and licensing notes are recorded beside the clips.
Development-only generation and recognition tools live in work/voices/; unprocessed WAV masters
are kept there, and two combined listening previews are saved in output/audio/.

DEPENDENCIES
Three.js r160 classic CDN: https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js
The classic browser distribution was removed in r161+, so this page keeps r160.
Three.js is MIT licensed: https://github.com/mrdoob/three.js/blob/r160/LICENSE
Barlow Condensed, DM Sans and Space Mono from Google Fonts.
Lilita One is bundled locally under the SIL Open Font License; see assets/fonts/OFL-LilitaOne.txt.

VERIFICATION OF THIS REVISION
All shipped scripts pass syntax checks. Classic script order, file paths and HTML identifiers checked.
Rule simulation: first sixteen waves 221.65s at cruise; waves continue after sixteen and beyond ten minutes.
Three lives, continuous wave checkpoints, checkpoint reload/respawn, corrupted/blocked storage and exhausted-life clearing verified.
Overheat recovery verified across all 64 tier/fire/cooling combinations at 10/25/50ms timesteps.
All cannon tiers, upgrade caps, pickup value ranges, recovery zones, seed repeatability and complete settings export verified.
Menu/HUD integration checks cover launch, steering/firing, pause, hangar, checkpoint resume, new-run warning/cancel, tuning, wave jumps, seed and clipboard fallback.
Seven score generators remain finite; temporary-track returns preserve arrangement position.
Eight title frames were rendered from the shipped background and transparent atlases; loop timing, fixed anchors, tail proportions, reduced motion, hidden-screen pause, unchanged logo pixels and keyboard menu navigation passed.
Pause menu browser checks cover desktop, phone and short landscape layouts, local display-font loading, keyboard focus and the shared defeat screen. Previews are saved under output/qa/.
The gameplay integration checks use simulated resources. Full gameplay has not been played end to end in a browser.
Difficulty, reticle readability, visual polish and audio quality still need a real player pass in a local desktop browser.
