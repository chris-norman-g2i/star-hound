const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname,'../..');
const oldRoot = path.join(__dirname,'before-classic');
const settingsSource = fs.readFileSync(path.join(root,'js/settings.js'),'utf8');
const originalSettings = fs.readFileSync(path.join(oldRoot,'js/settings.js'),'utf8');
const context = vm.createContext({window:{}});
vm.runInContext(settingsSource,context);
const settings = context.window.Starhound.settings;
const originalContext = vm.createContext({});
const names = [...originalSettings.matchAll(/^export const (\w+) =/gm)].map(m=>m[1]);
vm.runInContext(originalSettings.replace(/^export const /gm,'const ')+`\nthis.settings = {${names.join(',')}};`,originalContext);
for(const name of names){
 for(const key of Object.keys(settings[name])){
   const actual=settings[name][key],expected=originalContext.settings[name][key];
   if(typeof actual==='function')assert.equal(actual.toString(),expected.toString(),`${name}.${key} formula changed`);
   else assert.equal(JSON.stringify(actual),JSON.stringify(expected),`${name}.${key} value changed`);
 }
}
console.log('All configuration values and procedural function bodies match the original.');
for(const name of ['sound','scene','systems','interface']){
 const actual=fs.readFileSync(path.join(root,`js/${name}.js`),'utf8');
 const expected=fs.readFileSync(path.join(oldRoot,`js/${name}.js`),'utf8').replace(/^import .*?;\n/gm,'').replace(/^export class /gm,'class ');
 assert(actual.includes(expected),`${name} gameplay body changed`);
 vm.runInContext(actual,context);
}
const originalGame=fs.readFileSync(path.join(oldRoot,'js/game.js'),'utf8').replace(/^import .*?;\n/gm,'');
const game=fs.readFileSync(path.join(root,'js/game.js'),'utf8');assert(game.includes(originalGame),'game pipeline body changed');
vm.runInContext(game,context);assert.equal(typeof context.window.Starhound.Game.init,'function');
console.log('All runtime script bodies match; the global game entry point is registered.');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert(!/type\s*=\s*["'](?:module|importmap)["']/i.test(html));
for(const name of ['settings','sound','scene','systems','interface','game'])assert(!/^\s*(?:import|export)\s/m.test(fs.readFileSync(path.join(root,`js/${name}.js`),'utf8')));
const sources=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1]);
const local=sources.filter(s=>s.startsWith('./'));for(const src of local)assert(fs.existsSync(path.resolve(root,src)));
assert.equal(local.at(-1),'./js/game.js');assert.equal(sources[0],'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js');
console.log('Classic script order, relative paths, and absence of module/import-map requests verified.');
const browser={THREE:{REVISION:'160'}};
const bridgeContext=vm.createContext({window:browser,document:{getElementById(){throw new Error('unexpected loader failure')}}});
vm.runInContext(fs.readFileSync(path.join(root,'js/three-loader.js'),'utf8'),bridgeContext);
assert.equal(browser.Starhound.THREE,browser.THREE);assert(!Object.hasOwn(browser,'exports'));
console.log('Classic Three.js registers without CommonJS shims or global export pollution.');
const {race,weapon,pickups}=settings;const s=race.state();s.mode='playing';
while(s.distance<race.totalDistance())race.advance(s,.025,new Set());
assert(s.elapsed>1100&&s.elapsed<1350);assert(race.finishCrossed(s));
for(let i=0;i<5;i++)pickups.collect({pickup:'cannon'},s);assert.equal(weapon.bullets(s).length,6);
const system=new context.window.Starhound.FlightSystems({clear(){},burst(){}},{play(){}});
const finish=race.state();finish.mode='playing';finish.distance=race.totalDistance()-1;finish.nextSpawn=Infinity;finish.nextPickup=Infinity;system.step(finish,.05,new Set());assert.equal(finish.mode,'win');
console.log('20-minute race, six-barrel upgrades and the finish transition pass under classic loading.');
