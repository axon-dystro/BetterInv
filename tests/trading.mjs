import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
let serial = 0;
const users = new Map(['gm', 'alice', 'bob', 'eve'].map(id => [id, { id, active: true, isGM: id === 'gm' }]));
function item(actor, id, quantity, name = id) {
  const result = { id, parent: actor, type: 'loot', name, img: 'item.svg', quantity,
    toObject() { return { _id: this.id, type: this.type, name: this.name, system: { quantity: this.quantity } }; },
    async delete() { actor.items.delete(id); }
  };
  actor.items.set(id, result); return result;
}
function actor(id, owner, gold) {
  const result = { id, name: id, owner, type: 'character', items: new Map(), gold,
    async update(data) { if (this.failUpdate) { this.failUpdate = false; throw new Error('write failed'); } if ('gold' in data) this.gold = data.gold; },
    async createEmbeddedDocuments(type, data) { return data.map(d => item(this, d._id, d.system.quantity, d.name)); }
  };
  // Foundry Collections iterate their documents, unlike native Maps.
  result.items[Symbol.iterator] = function* () { yield* this.values(); };
  return result;
}
const a = actor('a', 'alice', 5), b = actor('b', 'bob', 20), c = actor('c', 'eve', 0);
item(a, 'sword', 3); item(b, 'gem', 2);
const actors = new Map([a,b,c].map(actor => [actor.id, actor]));
const emissions = [];
const hooks = new Map();
const ta = {id:'ta',actor:a,actorLink:true,x:0,y:0,width:1,height:1,elevation:0};
const tb = {id:'tb',actor:b,actorLink:true,x:100,y:0,width:1,height:1,elevation:0};
const tc = {id:'tc',actor:c,actorLink:true,x:300,y:0,width:1,height:1,elevation:0};
const tokens = new Map([ta,tb,tc].map(token => [token.id,token]));
tokens[Symbol.iterator] = function* () { yield* this.values(); };
const scene = {id:'scene',tokens,grid:{size:100,distance:5,units:'ft',isSquare:true,
  measurePath: ([a,b]) => ({distance:Math.max(Math.abs(a.x-b.x)/100*5,Math.abs(a.y-b.y)/100*5,Math.abs(a.elevation-b.elevation))})
}};
const permissions = (actor, user) => Boolean(actor && user && (user.isGM || actor.owner === user.id));
const wallet = actor => [{ key: 'gp', value: actor.gold, abbreviation: 'GP', storage: { updatePath: 'gold' } }];
const context = vm.createContext({ console, JSON, Map, Set, Array, Number, String,
  game: { user: users.get('gm'), actors, users, scenes:new Map([[scene.id,scene]]), socket: { emit: (channel, message) => emissions.push(message), on() {} } },
  canvas:{scene,tokens:{controlled:[]}},
  Hooks: { once(name,fn) { hooks.set(name,fn); }, on(name,fn) { hooks.set(name,fn); } },
  getBetterInvTransferTargetActors: source => [...actors.values()].filter(target => target.id !== source.id),
  isBetterInvValidTokenTransferTarget: (token,id) => token.actor.id !== id,
  transferBetterInvItemToActor: async () => 'old-transfer',
  commitBetterInvCurrencyTransfer: async () => 'old-coins',
  convertBetterInvSceneDistanceToFeet: (distance,scene) => scene.grid.units === 'm' ? distance * 3.280839895 : distance, ui: { notifications: { info() {}, error() {} } },
  executeBetterInvGmGroundAction: async () => 'delegated',
  canBetterInvUserModifyActorAs: permissions,
  isBetterInvPlayerCharacterActor: actor => actor?.type === 'character',
  getBetterInvUsersArray: () => [...users.values()],
  getBetterInvPrimaryActiveGm: () => users.get('gm'),
  getBetterInvGroundFeaturePlanFor: () => ({ itemTransfer: true, currencyTransfer: true }),
  getItemQuantityData: item => ({ value: item.quantity }),
  isBetterInvInventoryItemType: type => type === 'loot',
  getBetterInvItemContainedChildren: () => [], getItemContainerId: () => null,
  getBetterInvCurrencyWallet: wallet,
  cloneBetterInvCurrencyBalances: wallet => new Map(wallet.map(c => [c.key, {...c}])),
  buildBetterInvCurrencyUpdateData: (wallet, balances) => ({ updateData: wallet[0].value === balances.get('gp').value ? {} : {gold: balances.get('gp').value} }),
  betterInvCurrencyTransactions: new Set(), getBetterInvCurrencyActorKey: actor => actor.id,
  createBetterInvRequestId: () => `session-${++serial}`,
  resolveBetterInvNativeTransferSource: async item => ({document: item}),
  prepareBetterInvTransferredItemData: (item, quantity) => ({...item.toObject(), system: { quantity }}),
  getBetterInvTransferOperation: () => ({}),
  createBetterInvTransferredItem: async (actor, data) => item(actor, `new-${++serial}`, data.system.quantity, data.name),
  setItemQuantity: async (item, quantity) => { if (!item) throw new Error('missing source'); item.quantity = quantity; },
  setItemCategory: async () => {}, scheduleBetterInvRefresh() {}
});
vm.runInContext(fs.readFileSync(new URL('../scripts/trading.js', import.meta.url), 'utf8'), context);
const action = (name, payload, user = 'alice') => context.executeBetterInvGmGroundAction(`trade:${name}`, payload, user);
const offer = (items = [], coins = []) => ({items, coins});
const invite = (items = [{id:'sword',quantity:1}]) => action('open', {sourceActorId:'a',targetActorId:'b',sceneId:'scene',sourceTokenId:'ta',targetTokenId:'tb',offer:offer(items)});
const open = async () => {
  const pending = await invite();
  return action('accept',{id:pending.id,actorId:'b',revision:pending.revision},'bob');
};
let pending = await invite();
assert.equal(pending.status,'pending');
assert.equal(pending.sides[0].offer.items[0].id,'sword','Item is preloaded before invitation acceptance');
await assert.rejects(action('ready',{id:pending.id,actorId:'a',revision:0}),/zuerst annehmen/);
await assert.rejects(action('accept',{id:pending.id,actorId:'a',revision:0}),/zuerst annehmen/);
await action('cancel',{id:pending.id,actorId:'b'},'bob');
assert.equal(a.items.get('sword').quantity,3,'Declining leaves assets untouched');
assert.deepEqual(Array.from(context.getBetterInvTransferTargetActors(a),actor=>actor.id),['b']);
tb.x = 200;
assert.equal(context.getBetterInvTransferTargetActors(a).length,0,'Distant characters are omitted');
await assert.rejects(invite(),/5 ft/);
tb.x = 100; tb.elevation = 10;
await assert.rejects(invite(),/5 ft/);
tb.elevation = 0;
pending = await invite(); tb.x = 200;
await assert.rejects(action('accept',{id:pending.id,actorId:'b',revision:0},'bob'),/5 ft/);
await action('cancel',{id:pending.id,actorId:'a'}); tb.x = 100;
let state = await open();
assert.equal(state.sides[1].userId, 'bob', 'An unowned player character is a valid trade target');
assert.equal(state.sides[0].offer.items[0].snapshot, undefined, 'Public state must omit full item data');
const payload = (state, actorId, extra = {}) => ({id:state.id, actorId, revision:state.revision, ...extra});
await assert.rejects(action('offer', payload(state, 'b', {offer:offer()})), /Teilnehmer/);
await assert.rejects(action('offer', payload(state, 'a', {offer:offer([{id:'gem', quantity:1}])})), /Gegenstand/);
await assert.rejects(action('offer', payload(state, 'b', {offer:offer([], [{key:'gp',amount:-1}])}), 'bob'), /Mengen/);
await assert.rejects(action('offer', payload(state, 'b', {offer:offer([], [{key:'gp',amount:21}])}), 'bob'), /Münzbetrag/);
state = await action('ready', payload(state, 'a'));
assert.equal(a.items.get('sword').quantity, 3, 'One confirmation cannot move assets');
state = await action('offer', payload(state, 'b', {offer:offer([], [{key:'gp',amount:10}])}), 'bob');
assert.ok(state.sides.every(s => !s.ready), 'Editing resets both confirmations');
await assert.rejects(action('ready', {id:state.id, actorId:'a', revision:0}), /geändert/);
state = await action('ready', payload(state, 'a'));
state = await action('ready', payload(state, 'b'), 'bob');
assert.equal(state.status, 'completed');
assert.equal(a.gold, 15); assert.equal(b.gold, 10);
assert.equal(a.items.get('sword').quantity, 2);
assert.ok([...b.items].some(i => i.name === 'sword' && i.quantity === 1));
await assert.rejects(action('ready', payload(state,'b'),'bob'), /nicht mehr offen/, 'Completion cannot replay');
// Stale item documents require a new offer and both fresh confirmations.
state = await open();
a.items.get('sword').name = 'changed';
state = await action('ready', payload(state, 'a'));
state = await action('ready', payload(state, 'b'), 'bob');
assert.equal(state.status, 'open'); assert.match(state.error, /geändert/);
assert.equal(a.items.get('sword').quantity, 2);
await action('cancel', payload(state, 'a'));
// A failure after item creation and source debit restores both sides.
state = await open();
state = await action('offer', payload(state, 'b', {offer:offer([], [{key:'gp',amount:4}])}), 'bob');
const beforeItems = [...b.items].length;
b.failUpdate = true;
state = await action('ready', payload(state, 'a'));
state = await action('ready', payload(state, 'b'), 'bob');
assert.equal(state.status, 'open'); assert.equal(a.gold,15); assert.equal(b.gold,10);
assert.equal(a.items.get('sword').quantity,2); assert.equal([...b.items].length,beforeItems);
assert.equal(context.betterInvCurrencyTransactions.size, 0);
await action('cancel', payload(state,'a'));
// Fully consumed source stacks are removed only once the trade succeeds.
state = await invite([{id:'sword',quantity:2}]);
state = await action('accept',payload(state,'b'),'bob');
state = await action('ready',payload(state,'a'));
state = await action('ready',payload(state,'b'),'bob');
assert.equal(state.status,'completed'); assert.equal(a.items.has('sword'),false);
assert.equal(await context.executeBetterInvGmGroundAction('dropItem',{},'alice'),'delegated');
console.log('Trading tests passed: foreign player target, ownership, amounts, two-party consent, revisions, stale items, rollback, depleted stacks, replay.');

// Exercise the Dialog callback using its Foundry html argument, not an Application.
let rendered = 0;
const html = { tag: 'foundry-dialog-html' };
context.decorateBetterInvDialog = app => { assert.equal(app.element, html); rendered++; return {querySelector: () => null, querySelectorAll:()=>[]}; };
context.escapeHtml = value => String(value ?? '');
context.escapeAttr = context.escapeHtml;
context.getBetterInvCurrencies = () => [{key:'gp',abbreviation:'GP'}];
context.Dialog = class {
  constructor(data) { this.data = data; }
  render() { this.data.render(html); }
  close() { this.data.close(); }
};
context.requestBetterInvGmGroundAction = async (action, payload) => {
  const requester = context.game.user.id;
  context.game.user = users.get('gm');
  try { return await context.executeBetterInvGmGroundAction(action, payload, requester); }
  finally { context.game.user = users.get(requester); }
};
context.game.user = users.get('alice');
await context.openBetterInvTrade(a,b);
assert.equal(rendered,1);
console.log('Trading Dialog callback test passed.');

// Pending requests and open trades are cancelled when a token leaves range.
context.game.user = users.get('gm');
await context.executeBetterInvGmGroundAction('trade:cancel',{id:emissions.at(-1).state.id,actorId:'a'},'alice');
hooks.get('ready')();
pending = await invite([]);
tb.x = 200; hooks.get('updateToken')(tb,{x:200});
assert.equal(emissions.at(-1).state.status,'cancelled');
assert.match(emissions.at(-1).state.error,/5 ft/);
tb.x = 100;
// Metric scenes are converted to feet, not treated as a five-metre radius.
scene.grid.units = 'm';
scene.grid.measurePath = ([a,b]) => ({distance:Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))/100*1.5});
assert.ok(context.getBetterInvTradeTokenPair(a,b));
tb.x = 200; assert.equal(context.getBetterInvTradeTokenPair(a,b),null);
console.log('Invitation and range tests passed: preloaded item, accept/reject, selected list, distant/elevated tokens, movement cancellation, metric conversion.');

// Each participant sees their own offer first and the counterpart's complete offer second.
const uiStates = [];
context.game.socket.on = (channel, fn) => uiStates.push(fn);
hooks.get('ready')();
tb.x = 100;
context.game.user = users.get('gm');
let shared = await invite([]);
shared = await action('accept',payload(shared,'b'),'bob');
let renderedContent = '';
context.Dialog = class {
  constructor(data) { this.data = data; }
  render() { renderedContent = this.data.content; this.data.render(html); }
  close() { this.data.close(); }
};
const show = id => {
  context.game.user = users.get(id);
  uiStates.forEach(fn => fn({kind:'betterinvTradeState',gmId:'gm',state:shared}));
};
show('bob');
assert.ok(renderedContent.indexOf('data-trade-side="b"') < renderedContent.indexOf('data-trade-side="a"'));
assert.match(renderedContent,/DEIN ANGEBOT/);
assert.match(renderedContent,/ANGEBOT DEINES HANDELSPARTNERS/);
show('alice');
assert.ok(renderedContent.indexOf('data-trade-side="a"') < renderedContent.indexOf('data-trade-side="b"'));
assert.equal((renderedContent.match(/class="betterinv-trade-coins"/g) ?? []).length,2);
console.log('Trading view tests passed: own offer left for both participants, counterpart right, both coin offers visible.');
