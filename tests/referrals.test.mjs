import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(path,replacements={})=>{
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements))source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
let state;
const db={from(table){let update;const filters=[];const q={
 select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},is(k,v){filters.push(row=>row[k]===v);return q;},
 in(){return q;},lte(){return q;},order(){return q;},limit(){return q;},update(v){update=v;return q;},
 single:async()=>result(true),maybeSingle:async()=>result(true),then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}
 };function result(single){
 const rows=table==='referral_rewards'?[state.reward]:table==='orders'?[state.order]:[state.profile];
 const matched=rows.filter(r=>filters.every(f=>f(r)));if(update)matched.forEach(r=>Object.assign(r,update));
 return {data:single?matched[0]??null:matched.map(r=>({...r})),error:null};
 }return q;},
 async rpc(name,args){
 if(name==='claim_referral_reward'){
 if(state.reward.invalidated_at || !['pending','transferring'].includes(state.reward.state) || state.reward.lease_token)return {data:null};
 state.reward.lease_token=args.p_token;return {data:{...state.reward}};
 }
 if(name==='invalidate_referral_reward'){
 state.reward.invalidated_at='now';state.reward.state=state.reward.state==='pending'?'canceled':'recovery_needed';return {};
 }
 if(name==='finish_referral_transfer'){
 state.reward.transfer_id=args.p_transfer;
 state.reward.state=state.reward.invalidated_at?'recovery_needed':args.p_status==='succeeded'?'paid':args.p_status==='failed'?'needs_attention':'transferring';
 state.reward.lease_token=null;return {};
 }throw Error(name);
 }};
const whop={payments:{retrieve:async()=>state.payment},transfers:{
 create:async args=>{
 state.createCalls.push(args);assert.equal(state.reward.state,'transferring','intent saved before payout');
 if(!state.transfers.has(args.idempotence_key)) state.transfers.set(args.idempotence_key,{id:'transfer_1',status:state.transferStatus,metadata:args.metadata,origin:{id:args.origin_id},destination:{id:args.destination_id},object:'transfer',amount:{currency:'usd',amount:'3.00'}});
 if(state.refundDuringTransfer){await db.rpc('invalidate_referral_reward',{});}
 if(state.loseResponse){state.loseResponse=false;throw Error('Lost response');}
 return state.transfers.get(args.idempotence_key);
 },retrieve:async()=>{const value=[...state.transfers.values()][0];if(state.wrongDestination)return {...value,destination:{id:'attacker'}};return value;}
 },refunds:{retrieve:async()=>({payment_id:'pay_b',status:state.refundStatus})},disputes:{retrieve:async()=>({payment:{id:'pay_b'}})}};
globalThis.__referralTest={db,whop};
const {payReferral,runReferralPayouts,handleReferralEvent}=await import(compile('../lib/referral-payouts.ts',{
 './supabase':url('export const db=globalThis.__referralTest.db'),
 './whop':url('export const whop=globalThis.__referralTest.whop;export const whopBizId="biz";export const toCents=x=>x?Math.round(Number(x)*100):null;'),
 './referrals':url('export const referralScope=()=>"production:biz";export const referralsEnabled=()=>process.env.REFERRALS_ENABLED==="true";'),
 './referral-policy':compile('../lib/referral-policy.ts'),
 './tiers':compile('../lib/tiers.ts'),
}));
const {referralPaymentSafe}=await import(compile('../lib/referral-policy.ts'));
function reset(){
 process.env.REFERRALS_ENABLED='true';process.env.REFERRAL_PAYOUTS_ENABLED='true';
 state={createCalls:[],transfers:new Map(),transferStatus:'succeeded',refundStatus:'succeeded',
 reward:{id:'reward',scope:'production:biz',profile_id:'profile',order_id:'order',payment_id:'pay_b',buyer_id:'user_b',state:'pending',transfer_id:null,invalidated_at:null,lease_token:null},
 order:{id:'order',status:'paid',tier:'quick',review_target:1,whop_payment_id:'pay_b'},
 profile:{id:'profile',scope:'production:biz',whop_user_id:'user_a'},
 payment:{id:'pay_b',status:'paid',substatus:'succeeded',account_id:'biz',user:{id:'user_b'},usd_total:{amount:'15.00'},refunded_amount:{amount:'0'},holds:[]}};
}
test('fixed $3 to verified recipient, and replay after success sends nothing',async()=>{
 reset();await payReferral('reward');await payReferral('reward');assert.equal(state.reward.state,'paid');assert.equal(state.createCalls.length,1);assert.equal(state.createCalls[0].amount,3);assert.equal(state.createCalls[0].destination_id,'user_a');
});
test('lost response retries the same key and yields one actual transfer',async()=>{
 reset();state.loseResponse=true;await assert.rejects(payReferral('reward'));assert.equal(state.reward.state,'transferring');await payReferral('reward');assert.equal(state.transfers.size,1);assert.equal(state.createCalls[0].idempotence_key,state.createCalls[1].idempotence_key);assert.equal(state.reward.state,'paid');
});
test('processing is not paid; reconcile existing transfer without recreating',async()=>{
 reset();state.transferStatus='processing';await payReferral('reward');assert.equal(state.reward.state,'transferring');[...state.transfers.values()][0].status='succeeded';await payReferral('reward');assert.equal(state.reward.state,'paid');assert.equal(state.createCalls.length,1);
});
test('refund before payout cancels; refund during or after payout requires recovery',async()=>{
 reset();state.payment.refunded_amount.amount='1.00';await payReferral('reward');assert.equal(state.reward.state,'canceled');assert.equal(state.createCalls.length,0);
 reset();state.refundDuringTransfer=true;await payReferral('reward');assert.equal(state.reward.state,'recovery_needed');await payReferral('reward');assert.equal(state.createCalls.length,1);
 reset();await payReferral('reward');await handleReferralEvent('refund.created','refund');assert.equal(state.reward.state,'recovery_needed');
});
test('failed refunds do not cancel; disputes do',async()=>{
 reset();state.refundStatus='failed';await handleReferralEvent('refund.updated','refund');assert.equal(state.reward.state,'pending');await handleReferralEvent('dispute.created','dispute');assert.equal(state.reward.state,'canceled');
});
test('identity mismatch, amount mismatch, and self-referrals never transfer',async()=>{
 for(const mutate of [()=>state.payment.user.id='evil',()=>state.payment.usd_total.amount='1.00',()=>state.profile.whop_user_id='user_b',()=>state.payment.account_id='other']){
 reset();mutate();await payReferral('reward');assert.equal(state.createCalls.length,0);assert.equal(state.reward.state,'canceled');
 }
});
test('quality hold, unsettled funds, and payment holds defer rather than pay',async()=>{
 for(const mutate of [()=>state.order.status='needs_reupload',()=>state.payment.holds=[{}],()=>state.payment.settlement_time_at='2099-01-01T00:00:00Z']){
 reset();mutate();await payReferral('reward');assert.equal(state.createCalls.length,0);assert.equal(state.reward.state,'pending');assert.ok(state.reward.next_attempt_at);
 }
});
test('provider failure and transfer evidence mismatch never count as paid',async()=>{
 reset();state.transferStatus='failed';await payReferral('reward');assert.equal(state.reward.state,'needs_attention');await payReferral('reward');assert.equal(state.createCalls.length,1);
 reset();state.wrongDestination=true;await assert.rejects(payReferral('reward'));assert.equal(state.reward.state,'transferring');
});
test('payout switch stops the worker',async()=>{
 reset();process.env.REFERRAL_PAYOUTS_ENABLED='false';assert.deepEqual(await runReferralPayouts(),{disabled:true});assert.equal(state.createCalls.length,0);
});
test('payment policy fails closed for refunds, disputes and invalid settlement dates',()=>{
 reset();assert.equal(referralPaymentSafe(state.payment,'biz'),true);
 for(const patch of [{substatus:'partially_refunded'},{substatus:'dispute_won'},{status:'pending'},{settlement_time_at:'nonsense'},{refunded_at:'now'},{auto_refunded:true},{dispute_alerted_at:'now'}])assert.equal(referralPaymentSafe({...state.payment,...patch},'biz'),false);
});
test('cron requires a matching configured secret before running payouts',async()=>{
 let calls=0;globalThis.__referralCron=async()=>{calls++;return {processed:1,failed:0};};
 const {GET}=await import(compile('../app/api/cron/referrals/route.ts',{
 '@/lib/referral-payouts':url('export const runReferralPayouts=globalThis.__referralCron;'),
 }));
 delete process.env.CRON_SECRET;assert.equal((await GET(new Request('https://example.test'))).status,401);
 process.env.CRON_SECRET='test-secret';assert.equal((await GET(new Request('https://example.test',{headers:{authorization:'Bearer wrong'}}))).status,401);assert.equal(calls,0);
 assert.equal((await GET(new Request('https://example.test',{headers:{authorization:'Bearer test-secret'}}))).status,200);assert.equal(calls,1);
 delete process.env.CRON_SECRET;
});
