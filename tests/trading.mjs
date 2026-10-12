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
const permissions = (actor, user) => Boolean(actor && user && (user.isGM || actor.owner === user.id));
const wallet = actor => [{ key: 'gp', value: actor.gold, abbreviation: 'GP', storage: { updatePath: 'gold' } }];
const context = vm.createContext({ console, JSON, Map, Set, Array, Number, String,
  game: { user: users.get('gm'), actors, users, socket: { emit: (channel, message) => emissions.push(message), on() {} } },
  Hooks: { once() {}, on() {} }, ui: { notifications: { info() {}, error() {} } },
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
const open = () => action('open', {sourceActorId: 'a', targetActorId: 'b', offer: offer([{id:'sword', quantity:1}])});
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
state = await action('open', {sourceActorId:'a', targetActorId:'b', offer:offer([{id:'sword',quantity:2}])});
state = await action('ready',payload(state,'a'));
state = await action('ready',payload(state,'b'),'bob');
assert.equal(state.status,'completed'); assert.equal(a.items.has('sword'),false);
assert.equal(await context.executeBetterInvGmGroundAction('dropItem',{},'alice'),'delegated');
console.log('Trading tests passed: foreign player target, ownership, amounts, two-party consent, revisions, stale items, rollback, depleted stacks, replay.');

// Exercise the Dialog callback using its Foundry html argument, not an Application.
let rendered = 0;
const html = { tag: 'foundry-dialog-html' };
context.decorateBetterInvDialog = app => { assert.equal(app.element, html); rendered++; return {querySelector: () => null}; };
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
