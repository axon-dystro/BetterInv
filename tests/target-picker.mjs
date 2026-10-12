import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const main = fs.readFileSync(new URL('../scripts/main.js', import.meta.url),'utf8');
const trading = fs.readFileSync(new URL('../scripts/trading.js', import.meta.url),'utf8');
const beginning = main.indexOf('function getBetterInvNearbyTradeTargets(');
const end = main.indexOf('async function promptBetterInvActorTarget(',beginning);
assert(beginning > 0 && end > beginning,'Nearby token search adapter is present');
const adapter = main.slice(beginning,end);
assert.equal((main.match(/const targets = getBetterInvNearbyTradeTargets\(sourceActor\);/g)??[]).length,2,
  'Both actor and item selectors use NPC-aware token search');
assert(!main.includes('Kein anderer Spielercharakter innerhalb von 5 ft gefunden'),
  'Outdated player-only warning is gone');
assert(trading.includes('globalThis.getBetterInvTransferTargetActors = sourceActor =>'),
  'Trading installs the nearby token selector');
let invoked=0;
const warnings=[];
const npc={id:'npc',type:'npc',name:'Händler'};
const source={id:'hero',name:'Held'};
const gameState={
  canvas:{scene:{id:'forest',tokens:[{id:'source',actor:source}]}},
  globalThis:{
    getBetterInvTradeTokenPair() {return {};},
    getBetterInvTransferTargetActors(actor) {assert.equal(actor,source);invoked++;return [npc];}
  },
  ui:{notifications:{warn(message){warnings.push(message);},error(message){warnings.push(message);}}}
};
const context=vm.createContext(gameState);
vm.runInContext(adapter,context);
const found=vm.runInContext('getBetterInvNearbyTradeTargets',context)(source);
assert.equal(found[0],npc);
assert.equal(invoked,1,'Picker calls final global override');
assert.equal(warnings.length,0);
gameState.canvas.scene.tokens=[];
assert.equal(vm.runInContext('getBetterInvNearbyTradeTargets',context)(source).length,0);
assert.match(warnings.pop(),/kein Token/i,'Missing own token gives an actionable warning');
gameState.canvas.scene.tokens=[{actor:source}];
gameState.globalThis.getBetterInvTransferTargetActors=()=>[];
assert.equal(vm.runInContext('getBetterInvNearbyTradeTargets',context)(source).length,0);
assert.match(warnings.pop(),/Charakter oder NSC innerhalb von 5 ft/);
console.log('Token target adapter passed: two pickers, real NPC search, source token diagnostics, distance feedback.');
