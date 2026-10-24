import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import fs from 'node:fs';
import ts from 'typescript';
const js = ts.transpileModule(fs.readFileSync(new URL('../lib/terac-webhook.ts', import.meta.url), 'utf8'), {compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const { receiveTeracWebhook, verifyTeracSignature } = await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const secret = 'whsec_test_only';
const event = {event_type:'submission.status.change',event_id:'dlv_test',resource_id:'sub_test',opportunity_id:'opp_test',from:'in_progress',to:'completed',occurred_at:'2026-10-24T12:00:00Z'};
function signed(body = JSON.stringify(event), timestamp = String(Math.floor(Date.now()/1000))) {
  return new Request('https://example.test/api/terac/webhook', {method:'POST',body,headers:{'x-event-id':event.event_id,'x-terac-request-timestamp':timestamp,'x-terac-request-signature':createHmac('sha256',secret).update(timestamp+body).digest('base64')}});
}
test('valid events are persisted before acknowledgement', async()=>{
  let stored;
  const r=await receiveTeracWebhook(signed(),secret,async e=>{stored=e;return true;});
  assert.equal(r.status,200);assert.deepEqual(stored,event);
});
test('ping verifies authentication without requiring storage',async()=>{
  assert.equal((await receiveTeracWebhook(signed('{"event_type":"webhook.ping"}'),secret,async()=>{throw Error();})).status,200);
});
test('retry is acknowledged as duplicate',async()=>{
  const r=await receiveTeracWebhook(signed(),secret,async()=>false);
  assert.equal((await r.json()).duplicate,true);
});
test('storage failure is retryable, not acknowledged',async()=>{
  assert.equal((await receiveTeracWebhook(signed(),secret,async()=>{throw Error();})).status,503);
});
test('tampering, wrong secret and malformed signatures are rejected',async()=>{
  const r=signed();
  const raw=JSON.stringify(event);
  assert.equal(verifyTeracSignature(raw+' ',r.headers,secret),false);
  assert.equal(verifyTeracSignature(raw,r.headers,'wrong'),false);
  r.headers.set('x-terac-request-signature','bad');
  assert.equal((await receiveTeracWebhook(r,secret,async()=>{throw Error();})).status,401);
});
test('expired, future and nonnumeric timestamps rejected',()=>{
  for(const t of ['0',String(Math.floor(Date.now()/1000)+600),'NaN','Infinity']) {
    const r=signed(undefined,t);assert.equal(verifyTeracSignature(JSON.stringify(event),r.headers,secret),false);
  }
});
test('signed malformed JSON and event ID mismatch rejected',async()=>{
  for(const r of [signed('{'),signed(JSON.stringify({...event,event_id:'other'}))])
    assert.equal((await receiveTeracWebhook(r,secret,async()=>{throw Error();})).status,400);
});
test('missing configuration fails closed',async()=>{
  assert.equal((await receiveTeracWebhook(signed(),undefined,async()=>true)).status,503);
});
test('unknown event types do not modify business state',async()=>{
  const r=await receiveTeracWebhook(signed(JSON.stringify({...event,event_type:'future.event'})),secret,async()=>{throw Error();});
  assert.equal((await r.json()).ignored,true);
});
test('oversized body rejected even without content length',async()=>{
  assert.equal((await receiveTeracWebhook(signed('x'.repeat(262145)),secret,async()=>true)).status,413);
});
