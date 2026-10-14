import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const hooks=new Map(), listeners=new Map(), buttonListeners=new Map();
let opened=0,removed=0,shown=0;
const button={addEventListener:(name,fn)=>buttonListeners.set(name,fn)};
const menu={style:{},setAttribute(){},querySelector:()=>button,remove(){removed++;},contains:()=>false};
const source={id:'own'},target={document:{id:'other-token',actorId:'other'}};
const context=vm.createContext({console,AbortController,setTimeout:fn=>fn(),
 document:{createElement:()=>menu,body:{appendChild(){shown++;}},addEventListener(){}},
 window:{innerWidth:1000,innerHeight:800},canvas:{},ui:{notifications:{error:assert.fail}},
 Hooks:{on:(name,fn)=>hooks.set(name,fn)},
 getBetterInvTradeSourceActor:()=>source,
 isBetterInvValidTokenTransferTarget:token=>token===target,
 getBetterInvCanvasView:()=>({addEventListener:(name,fn)=>listeners.set(name,fn)}),
 getBetterInvCanvasPointFromPointerEvent:()=>({x:100,y:0}),
 findBetterInvTokenAtCanvasPoint:()=>target,
 openBetterInvTradeWithToken:async token=>{assert.equal(token,target);opened++;}
});
vm.runInContext(fs.readFileSync(new URL('../scripts/trade-hud.js',import.meta.url),'utf8'),context);
assert.equal(hooks.has('rightClickToken'),false);
hooks.get('canvasReady')();
listeners.get('pointerdown')({button:2,clientX:100,clientY:100});
listeners.get('pointerup')({button:2,clientX:101,clientY:101});
assert.equal(shown,1,'Foreign target needs no native HUD ownership');
buttonListeners.get('click')({preventDefault(){}});
assert.equal(opened,1);
listeners.get('pointerdown')({button:2,clientX:100,clientY:100});
listeners.get('pointerup')({button:2,clientX:140,clientY:100});
assert.equal(shown,1,'Panning must not open trade');
target.document.hidden=true;
listeners.get('pointerdown')({button:2,clientX:100,clientY:100});
listeners.get('pointerup')({button:2,clientX:100,clientY:100});
assert.equal(shown,1,'Hidden targets must not open trade');
hooks.get('canvasTearDown')();
assert.ok(removed);
console.log('Token quick trade tests passed: canvas event, foreign target, click action, panning exclusion, hidden exclusion, cleanup.');
