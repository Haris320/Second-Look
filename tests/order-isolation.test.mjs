import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHmac,createHash} from 'node:crypto';
import ts from 'typescript';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(path,replacements={})=>{
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements))source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
let jar=new Map(),reads=[],signed=[];
const rows={
 orders:[A,B].map((id,i)=>({id,status:'paid',tier:'quick',review_target:1,report_json:{summary:`private report ${i}`},access_key_hash:'legacy-hash',buyer_whop_user_id:`user_${i}`})),
 screenshots:[A,B].map((id,i)=>({id:`shot_${i}`,order_id:id,storage_path:`${id}/private.jpg`,position:1})),
 referral_profiles:[{id:'profile_a',scope:'production:biz',whop_user_id:'user_0',code:'a'.repeat(32)}],
 referral_rewards:[{id:'reward',profile_id:'profile_a',state:'pending',order_id:B,payment_id:'private-payment',buyer_id:'user_1'}],
 decisions:[],
};
const db={from(table){reads.push(table);let columns='*',head=false,filters=[];
 const q={select(c,opts={}){columns=c;head=opts.head;return q;},eq(k,v){filters.push(r=>r[k]===v);return q;},in(k,v){filters.push(r=>v.includes(r[k]));return q;},like(){return q;},gt(){return q;},order(){return q;},
 single:async()=>result(true),maybeSingle:async()=>result(true),then(resolve,reject){return Promise.resolve(result(false)).then(resolve,reject);}};
 function result(single){const selected=rows[table].filter(r=>filters.every(f=>f(r)));const projected=selected.map(r=>Object.fromEntries(Object.entries(r).filter(([k])=>columns==='*'||columns.split(',').includes(k))));return {error:null,data:head?null:single?projected[0]??null:projected,count:selected.length};}return q;},
 storage:{from:()=>({createSignedUrl:async(path,age)=>{signed.push({path,age});return {data:{signedUrl:`https://storage.test/${path}?signature=private`}};}})},
};
globalThis.__isolation={db,cookies:async()=>({get:k=>jar.get(k),set:(k,value,options)=>jar.set(k,{value,options})})};
const cookiesUrl=url('export const cookies=globalThis.__isolation.cookies');
const dbUrl=url('export const db=globalThis.__isolation.db');
const accessUrl=compile('../lib/order-access.ts',{'next/headers':cookiesUrl});
const access=await import(accessUrl);
const linksUrl=compile('../lib/order-links.ts',{'next/headers':cookiesUrl,'./supabase':dbUrl,'./order-access':accessUrl,'./log':url('export async function logDecision(){}')});
const links=await import(linksUrl);
const referralsUrl=compile('../lib/referrals.ts',{'next/headers':cookiesUrl,'./supabase':dbUrl,'./whop':url('export const whop={};export const whopBizId="biz";export const toCents=()=>0;'),'./tiers':compile('../lib/tiers.ts'),'./referral-policy':compile('../lib/referral-policy.ts')});
const {referralSummary}=await import(referralsUrl);
const route=await import(compile('../app/api/orders/[id]/route.ts',{
 '@/lib/supabase':dbUrl,'@/lib/order-access':accessUrl,'@/lib/order-links':linksUrl,'@/lib/referrals':referralsUrl,
}));
const guardDependencies={
 '@/lib/supabase':dbUrl,'@/lib/order-access':accessUrl,
 '@/lib/verify-uploads':url('export async function verifyUploads(){throw Error("Unauthorized upload operation")}'),
 '@/lib/tiers':compile('../lib/tiers.ts'),
 '@/lib/log':url('export async function logDecision(){throw Error("Unauthorized log operation")}'),
 '@/lib/orders':url('export const IMAGE_TYPES={}'),
 '@/lib/uploads':url('export const validateFiles=()=>null'),
 '@/lib/first-read':url('export async function runFirstRead(){throw Error("Unauthorized screening")}'),
 'next/server':url('export const after=()=>{throw Error("Unauthorized background task")}'),
};
const checkout=await import(compile('../app/api/orders/[id]/checkout/route.ts',guardDependencies));
const complete=await import(compile('../app/api/orders/[id]/complete/route.ts',guardDependencies));
const reupload=await import(compile('../app/api/orders/[id]/reupload/route.ts',guardDependencies));
const dashboardAccessUrl=compile('../lib/dashboard-access.ts',{'next/headers':cookiesUrl});
const dashboardAccess=await import(dashboardAccessUrl);
const dashboard=await import(compile('../app/api/dashboard/route.ts',{'@/lib/supabase':dbUrl,'@/lib/dashboard-access':dashboardAccessUrl,'@/lib/order-access':accessUrl}));
function reset(){
 jar=new Map();reads=[];signed=[];
 process.env.ORDER_SESSION_SECRET='test-session-secret';process.env.ORDER_LINK_SECRET='test-link-secret';process.env.DASHBOARD_PASSWORD='test-dashboard-secret';process.env.PUBLIC_BASE_URL='https://second-look.test';process.env.REFERRALS_ENABLED='false';process.env.WHOP_ENVIRONMENT='production';
}
const request=(id,method='GET')=>new Request(`https://second-look.test/api/orders/${id}`,{method,headers:{origin:'https://second-look.test'}});
const context=id=>({params:Promise.resolve({id})});
test('A cookie cannot open B, even if renamed to B cookie',async()=>{
 reset();await access.grantAccess(A);assert.equal(await access.hasAccess(A),true);assert.equal(await access.hasAccess(B),false);
 const a=jar.get(`sl_order_${A}`);assert.equal(a.options.httpOnly,true);jar.set(`sl_order_${B}`,a);assert.equal(await access.hasAccess(B),false);
 const response=await route.GET(request(B),context(B));assert.equal(response.status,403);assert.deepEqual(reads,['decisions']);assert.equal(signed.length,0);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('A can see only A report and screenshots; B with its own session sees B',async()=>{
 reset();await access.grantAccess(A);let response=await route.GET(request(A),context(A));assert.equal(response.status,200);let body=await response.json();assert.equal(body.order.id,A);assert.equal(body.order.report_json.summary,'private report 0');assert.equal(body.screenshots.length,1);assert.equal(signed[0].path,`${A}/private.jpg`);assert.equal(signed[0].age,300);assert.equal(body.order.access_key_hash,undefined);assert.equal(body.referral,null);
 reset();await access.grantAccess(B);response=await route.GET(request(B),context(B));body=await response.json();assert.equal(body.order.id,B);assert.equal(body.order.report_json.summary,'private report 1');assert.equal(signed[0].path,`${B}/private.jpg`);
});
test('A cannot delete, pay for, complete, or replace B uploads',async()=>{
 reset();await access.grantAccess(A);
 for(const [handler,method,status] of [[route.DELETE,'DELETE',403],[checkout.POST,'POST',403],[complete.POST,'POST',403],[reupload.POST,'POST',409],[reupload.PUT,'PUT',409]]){
 const response=await handler(request(B,method),context(B));assert.equal(response.status,status);assert.deepEqual(reads,[]);assert.equal(signed.length,0);
 }
});
test('A private key and public referral code do not grant B access',async()=>{
 reset();const keyA=new URL(links.orderLink(A)).searchParams.get('key');assert.equal(await links.openWithKey(B,keyA),false);assert.equal(await links.openWithKey(B,'a'.repeat(32)),false);assert.equal(await access.hasAccess(B),false);
 assert.equal(await links.openWithKey(A,keyA),true);assert.equal(await access.hasAccess(A),true);assert.equal(await access.hasAccess(B),false);
});
test('private links are bearer credentials: deliberately sharing B link grants B access',async()=>{
 reset();const keyB=new URL(links.orderLink(B)).searchParams.get('key');assert.equal(await links.openWithKey(B,keyB),true);assert.equal(await access.hasAccess(B),true);
});
test('legacy private keys remain bound to their own order',async()=>{
 reset();const previous=rows.orders[0].access_key_hash;const legacy='old-random-key';rows.orders[0].access_key_hash=createHash('sha256').update(legacy).digest('hex');
 try {assert.equal(await links.openWithKey(A,legacy),true);assert.equal(await links.openWithKey(B,legacy),false);}finally{rows.orders[0].access_key_hash=previous;}
});
test('referral dashboard returns totals and public referral link, never friend details',async()=>{
 reset();process.env.REFERRALS_ENABLED='true';const summary=await referralSummary(A);assert.deepEqual(summary,{link:`https://second-look.test/r/${'a'.repeat(32)}`,pendingCents:300,paidCents:0,attention:0});assert.ok(!JSON.stringify(summary).includes(B));assert.ok(!JSON.stringify(summary).includes('private-payment'));assert.equal(signed.length,0);assert.ok(!reads.includes('screenshots'));
});
test('referral cookie alone grants no order or dashboard access',async()=>{
 reset();jar.set('sl_referral',{value:'a'.repeat(32)});assert.equal(await access.hasAccess(A),false);assert.equal(await access.hasAccess(B),false);assert.equal((await dashboard.GET()).status,401);assert.deepEqual(reads,[]);
});
test('malformed, forged, and expired cookies fail closed without throwing',async()=>{
 reset();const expiry=String(Math.floor(Date.now()/1000)-10);const expired=createHmac('sha256',process.env.ORDER_SESSION_SECRET).update(`${A}.${expiry}`).digest('hex');
 for(const token of [`${expiry}.${expired}`,'NaN.'+'a'.repeat(64),'9999999999.'+'é'.repeat(64),'9999999999.'+'a'.repeat(64),'9999999999.'+'a'.repeat(64)+'.extra']){
 jar.set(`sl_order_${A}`,{value:token});jar.set('sl_dashboard',{value:token});assert.equal(await access.hasAccess(A),false);assert.equal(await dashboardAccess.dashboardAccess(),false);
 }
});
