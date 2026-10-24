import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(file,replacements={})=>{
 let s=fs.readFileSync(new URL(file,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements)) s=s.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
const quality=compile('../lib/profile-quality.ts');
const policy=compile('../lib/recruitment-policy.ts',{'./profile-quality':quality,'./tiers':compile('../lib/tiers.ts')});
let state;
const db={
 from(table){
  let update;
  const q={select(){return q;},update(v){update=v;return q;},eq(){return q;},single:async()=>({data:state.order}),then(resolve,reject){
   if(update) Object.assign(state.job,update);
   return Promise.resolve({data:table==='screenshots'?[{position:1}]:null}).then(resolve,reject);
  }};return q;
 },
 async rpc(){
  if(state.claimed && state.job.state!=='retryable') return {data:null};
  state.claimed=true;state.job.state=state.job.opportunity_id?'preparing':'creating';return {data:{...state.job}};
 }
};
globalThis.__recruitTest={db,withTerac:async fn=>fn(async(name,args)=>{
 state.calls.push(name);
 if(name==='terac_create_opportunity'){
  if(state.failCreate) throw Error('timeout');
  state.remote={...args,id:'opp1',status:'draft',pricing:{currency:'usd',total_cost_cents:state.quote ?? 900},funding:{affordable:true,draws_on_credit:false,balance_cents:10000}};
  return state.remote;
 }
 if(name==='terac_get_opportunity') return state.remote;
 if(name==='terac_launch_draft_opportunity'){
  state.remote.status='active';if(state.loseLaunchResponse){state.loseLaunchResponse=false;throw Error('timeout');}return state.remote;
 }
 throw Error(name);
})};
const {recruitOrder}=await import(compile('../lib/recruitment.ts',{
 './supabase':url('export const db=globalThis.__recruitTest.db'),
 './terac':url('export const withTerac=globalThis.__recruitTest.withTerac'),
 './log':url('export async function logDecision(){}'),
 './recruitment-policy':policy
}));
function reset(){
 process.env.TERAC_RECRUITMENT_ENABLED='true';process.env.TERAC_PROJECT_ID='project';process.env.PUBLIC_BASE_URL='https://example.test';process.env.TERAC_MAX_ORDER_COST_CENTS='1500';
 state={calls:[],claimed:false,job:{state:'creating',opportunity_id:null,task_token:'private'},order:{status:'paid',audience:'women_21_35_us',whop_payment_id:'pay',paid_at:'2026-10-24',amount_cents:4000,review_target:3,first_read_json:{is_dating_profile:true,explicit_content:false,appears_under_18:false,screenshot_checks:[{position:1,verdict:'profile',reason:'UI'}]}}};
}
test('eligible order creates and launches via MCP exactly once across duplicate callbacks',async()=>{
 reset();assert.equal((await recruitOrder('order')).state,'active');await recruitOrder('order');
 assert.deepEqual(state.calls,['terac_create_opportunity','terac_get_opportunity','terac_launch_draft_opportunity']);
 assert.equal(state.remote.num_participants,3);assert.equal(state.job.state,'active');
});
test('ambiguous draft creation is blocked instead of creating a duplicate',async()=>{
 reset();state.failCreate=true;await assert.rejects(recruitOrder('order'));assert.equal(state.job.state,'needs_attention');
 await recruitOrder('order');assert.deepEqual(state.calls,['terac_create_opportunity']);
});
test('lost launch response reconciles the same active opportunity without spending twice',async()=>{
 reset();state.loseLaunchResponse=true;await assert.rejects(recruitOrder('order'));assert.equal(state.job.state,'retryable');
 assert.equal((await recruitOrder('order')).state,'active');
 assert.equal(state.calls.filter(x=>x==='terac_launch_draft_opportunity').length,1);
 assert.equal(state.calls.filter(x=>x==='terac_create_opportunity').length,1);
});
test('cost cap saves the draft but does not launch',async()=>{
 reset();process.env.TERAC_MAX_ORDER_COST_CENTS='100';await assert.rejects(recruitOrder('order'));
 assert.equal(state.job.opportunity_id,'opp1');assert.equal(state.job.state,'retryable');assert.ok(!state.calls.includes('terac_launch_draft_opportunity'));
});
test('disabled or failed-screening orders never contact Terac',async()=>{
 reset();process.env.TERAC_RECRUITMENT_ENABLED='false';assert.equal((await recruitOrder('order')).state,'disabled');assert.deepEqual(state.calls,[]);
 process.env.TERAC_RECRUITMENT_ENABLED='true';state.order.first_read_json.explicit_content=true;await assert.rejects(recruitOrder('order'));assert.deepEqual(state.calls,[]);
});

test('single-review package launches one person, not three',async()=>{
 reset();state.order.amount_cents=1500;state.order.review_target=1;state.quote=600;
 assert.equal((await recruitOrder('single')).state,'active');assert.equal(state.remote.num_participants,1);
});
