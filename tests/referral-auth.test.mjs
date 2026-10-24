import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {generateKeyPair,SignJWT,jwtVerify} from 'jose';
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const compile=(path,replacements={})=>{
 let source=fs.readFileSync(new URL(path,import.meta.url),'utf8').replace('import "server-only";','');
 for(const [from,to] of Object.entries(replacements))source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));
 return url(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
};
const keys=await generateKeyPair('RS256');
let jar=new Map(),scope='production:biz',token,user,requests=[],identityCalls=0,upserts=[],loginLogs=[],providerFailure=null,dbError=null;
const cookieStore={get:k=>jar.get(k),set:(k,value,options)=>jar.set(k,{value,options})};
globalThis.__oauthTest={jwtVerify,publicKey:keys.publicKey,cookies:async()=>cookieStore};
const errorsUrl=compile('../lib/referral-login-errors.ts');
const oauth=await import(compile('../lib/whop-oauth.ts',{'./referral-login-errors':errorsUrl,jose:url('export const jwtVerify=globalThis.__oauthTest.jwtVerify;export const createRemoteJWKSet=()=>globalThis.__oauthTest.publicKey;')}));
const originalFetch=globalThis.fetch;
test.after(()=>{globalThis.fetch=originalFetch;});
globalThis.fetch=async(endpoint,init)=>{
 requests.push({endpoint,init});
 if(providerFailure && endpoint.endsWith('/oauth/token'))return Response.json(providerFailure.body,{status:providerFailure.status});
 if(endpoint.endsWith('/oauth/token'))return Response.json({id_token:token,access_token:'server-only-token',token_type:'Bearer'});
 if(endpoint.endsWith('/.well-known/openid-configuration'))return Response.json({issuer:'https://api.whop.com',jwks_uri:'https://api.whop.com/.well-known/jwks.json'});
 if(endpoint.endsWith('/oauth/userinfo'))return Response.json(user);
 throw Error('Unexpected endpoint');
};
const cookiesUrl=url('export const cookies=globalThis.__oauthTest.cookies');
globalThis.__oauthScope=()=>scope;
const referralsUrl=url('export const referralScope=globalThis.__oauthScope;export const referralsEnabled=()=>process.env.REFERRALS_ENABLED==="true";export const profileReferralSummary=async id=>({link:`https://second-look.test/r/${id}`,pendingCents:0,paidCents:0,attention:0});');
const authUrl=compile('../lib/referral-auth.ts',{'next/headers':cookiesUrl,'iron-session':import.meta.resolve('iron-session'),'./referrals':referralsUrl});
const auth=await import(authUrl);
const accessUrl=compile('../lib/order-access.ts',{'next/headers':cookiesUrl});
const access=await import(accessUrl);
const callbackDb={from(table){assert.equal(table,'referral_profiles');const filters={};const q={
 upsert:async(value)=>{upserts.push(value);return {error:dbError};},select(){return q;},eq(k,v){filters[k]=v;return q;},single:async()=>({data:{id:`profile_${filters.whop_user_id}`},error:null}),
 };return q;}};
globalThis.__oauthCallback={db:callbackDb,identity:async()=>{identityCalls++;return {userId:'user_A',email:'a@test.com',label:'person-a'};}};
globalThis.__oauthHelpers=oauth;
globalThis.__oauthLog=async(_order,step,choice,reason)=>{loginLogs.push({step,choice,reason});};
const helperUrl=url('export const referralLoginReady=()=>true;export const exchangeReferralIdentity=globalThis.__oauthCallback.identity;export const newReferralLogin=globalThis.__oauthHelpers.newReferralLogin;export const referralAuthorizeUrl=globalThis.__oauthHelpers.referralAuthorizeUrl;');
const callback=await import(compile('../app/api/referrals/callback/route.ts',{
 '@/lib/referral-login-errors':errorsUrl,'@/lib/log':url('export const logDecision=globalThis.__oauthLog'),
 '@/lib/referral-auth':authUrl,'@/lib/referrals':referralsUrl,'@/lib/whop-oauth':helperUrl,
 '@/lib/order-access':accessUrl,'@/lib/supabase':url('export const db=globalThis.__oauthCallback.db'),
}));
const me=await import(compile('../app/api/referrals/me/route.ts',{'next/server':url('export async function connection(){}'),'@/lib/referral-auth':authUrl,'@/lib/referrals':referralsUrl,'@/lib/whop-oauth':helperUrl,'@/lib/order-access':accessUrl}));
const logout=await import(compile('../app/api/referrals/logout/route.ts',{'@/lib/referral-auth':authUrl,'@/lib/order-access':accessUrl}));
function reset(){
 jar=new Map();scope='production:biz';requests=[];identityCalls=0;upserts=[];
 loginLogs=[];providerFailure=null;dbError=null;
 process.env.WHOP_CLIENT_ID='app_test';process.env.WHOP_CLIENT_SECRET='test-oauth-secret';process.env.REFERRAL_SESSION_SECRET='test-referral-session-secret-at-least-32-characters';process.env.PUBLIC_BASE_URL='https://second-look.test';process.env.REFERRALS_ENABLED='true';process.env.WHOP_ENVIRONMENT='production';process.env.ORDER_SESSION_SECRET='test-order-secret';
 user={sub:'user_A',email:'a@test.com',preferred_username:'person-a'};
}
async function jwt(pending,overrides={},key=keys.privateKey){
 return new SignJWT({nonce:pending.nonce,...overrides}).setProtectedHeader({alg:'RS256'}).setIssuer('https://api.whop.com').setAudience('app_test').setSubject('user_A').setIssuedAt().setExpirationTime('5m').sign(key);
}
test('Whop sign-in uses PKCE, fresh state/nonce, and the exact registered callback',()=>{
 reset();const first=oauth.newReferralLogin(scope),second=oauth.newReferralLogin(scope);assert.notEqual(first.state,second.state);assert.notEqual(first.verifier,second.verifier);assert.notEqual(first.nonce,second.nonce);
 const authorize=new URL(oauth.referralAuthorizeUrl(first));assert.equal(authorize.origin,'https://api.whop.com');assert.equal(authorize.searchParams.get('redirect_uri'),'https://second-look.test/api/referrals/callback');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.ok(!authorize.href.includes(first.verifier));assert.ok(!authorize.href.includes('test-oauth-secret'));
});
test('verified server-side identity must match both the signed ID token and userinfo',async()=>{
 reset();const pending=oauth.newReferralLogin(scope);token=await jwt(pending);
 assert.deepEqual(await oauth.exchangeReferralIdentity('code',pending),{userId:'user_A',email:'a@test.com',label:'person-a'});
 const body=JSON.parse(requests[0].init.body);assert.equal(body.code_verifier,pending.verifier);assert.equal(body.client_secret,'test-oauth-secret');assert.equal(requests[2].init.headers.Authorization,'Bearer server-only-token');
 user.sub='user_B';await assert.rejects(oauth.exchangeReferralIdentity('code',pending),error=>error.code==='identity');
});
test('without WHOP_CLIENT_SECRET the app is a public client: PKCE only, no client_secret sent, still ready',async()=>{
 reset();delete process.env.WHOP_CLIENT_SECRET;assert.equal(oauth.referralLoginReady(),true);
 const pending=oauth.newReferralLogin(scope);token=await jwt(pending);
 assert.deepEqual(await oauth.exchangeReferralIdentity('code',pending),{userId:'user_A',email:'a@test.com',label:'person-a'});
 const body=JSON.parse(requests[0].init.body);assert.equal(body.code_verifier,pending.verifier);assert.equal('client_secret' in body,false);assert.equal(body.client_id,'app_test');
});
test('wrong nonce, invalid signature, and wrong audience cannot authenticate',async()=>{
 reset();const pending=oauth.newReferralLogin(scope);token=await jwt(pending,{nonce:'wrong'});await assert.rejects(oauth.exchangeReferralIdentity('code',pending),error=>error.code==='nonce');
 const otherKeys=await generateKeyPair('RS256');token=await jwt(pending,{},otherKeys.privateKey);await assert.rejects(oauth.exchangeReferralIdentity('code',pending));
 token=await new SignJWT({nonce:pending.nonce}).setProtectedHeader({alg:'RS256'}).setIssuer('https://api.whop.com').setAudience('app_other').setSubject('user_A').setIssuedAt().setExpirationTime('5m').sign(keys.privateKey);await assert.rejects(oauth.exchangeReferralIdentity('code',pending));
});
async function pendingSession(){const session=await auth.referralSession();const pending=oauth.newReferralLogin(scope);session.pending=pending;await session.save();return pending;}
const callbackRequest=(state,extra='')=>new Request(`https://second-look.test/api/referrals/callback?code=code&state=${state}${extra}`);
test('callback rejects missing, wrong, expired state before any identity or database operation',async()=>{
 reset();await callback.GET(callbackRequest('missing'));assert.equal(identityCalls,0);
 let pending=await pendingSession();await callback.GET(callbackRequest('wrong'));assert.equal(identityCalls,0);
 pending=await pendingSession();const session=await auth.referralSession();session.pending.createdAt=Date.now()-601000;await session.save();await callback.GET(callbackRequest(pending.state));assert.equal(identityCalls,0);assert.equal(upserts.length,0);
});
test('a verified non-buyer can register; browser recipient parameters are ignored',async()=>{
 reset();const pending=await pendingSession();const response=await callback.GET(callbackRequest(pending.state,'&userId=user_B&profileId=victim'));
 assert.equal(response.status,303);assert.equal(response.headers.get('location'),'https://second-look.test/refer');assert.equal(identityCalls,1);assert.deepEqual(upserts,[{scope:'production:biz',whop_user_id:'user_A',email:'a@test.com'}]);
 assert.deepEqual(await auth.currentReferrer(),{id:'profile_user_A',label:'person-a'});
 const body=await (await me.GET()).json();assert.equal(body.referral.link,'https://second-look.test/r/profile_user_A');assert.equal(body.accountLabel,'person-a');assert.equal(body.userId,undefined);
 assert.equal(await access.hasAccess('00000000-0000-4000-8000-000000000001'),false,'referral login does not grant order access');
 assert.equal((await auth.referralSession()).pending,undefined);await callback.GET(callbackRequest(pending.state));assert.equal(identityCalls,1,'consumed callback cannot be reused');
});
test('referral cookie is encrypted and HttpOnly; tampering and environment switches log out',async()=>{
 reset();const pending=await pendingSession();await callback.GET(callbackRequest(pending.state));const cookie=jar.get('sl_referrer');assert.equal(cookie.options.httpOnly,true);assert.ok(!cookie.value.includes('profile_user_A'));assert.ok(!cookie.value.includes('server-only-token'));
 scope='sandbox:biz';assert.equal(await auth.currentReferrer(),null);scope='production:biz';assert.ok(await auth.currentReferrer());
 jar.set('sl_referrer',{...cookie,value:cookie.value.slice(0,-8)+'tampered'});assert.equal(await auth.currentReferrer(),null);
});
test('a different browser gets no earnings, and logout requires same-origin POST',async()=>{
 reset();const pending=await pendingSession();await callback.GET(callbackRequest(pending.state));const originalJar=jar;jar=new Map();assert.equal((await (await me.GET()).json()).referral,null);jar=originalJar;
 assert.equal((await logout.POST(new Request('https://second-look.test/api/referrals/logout',{method:'POST',headers:{origin:'https://evil.test'}}))).status,403);assert.ok(await auth.currentReferrer());
 assert.equal((await logout.POST(new Request('https://second-look.test/api/referrals/logout',{method:'POST',headers:{origin:'https://second-look.test'}}))).status,303);assert.equal(await auth.currentReferrer(),null);
});

test('provider failures get safe actionable categories without leaking provider bodies',async()=>{
 for(const [status,provider,expected] of [[401,'invalid_client','token_client'],[403,'missing_permission','token_permission'],[400,'invalid_grant','token_expired']]){
  reset();const pending=oauth.newReferralLogin(scope);providerFailure={status,body:{error:provider,error_description:'sensitive-code-and-client-secret'}};
  await assert.rejects(oauth.exchangeReferralIdentity('code',pending),error=>error.code===expected && !JSON.stringify(error).includes('sensitive-code-and-client-secret'));
 }
});
test('callback records only a stage, SQL code and reference when profile saving fails',async()=>{
 reset();const pending=await pendingSession();dbError={code:'42P01',message:'sensitive database content user@example.com'};
 const response=await callback.GET(callbackRequest(pending.state));const location=new URL(response.headers.get('location'));
 assert.equal(location.searchParams.get('error'),'profile_save');assert.match(location.searchParams.get('ref'),/^[0-9a-f-]{36}$/);
 assert.equal(loginLogs.length,1);assert.equal(loginLogs[0].choice,'profile_save');assert.match(loginLogs[0].reason,/db=42P01/);assert.ok(!JSON.stringify(loginLogs).includes('user@example.com'));assert.equal(await auth.currentReferrer(),null);
});
test('provider authorization errors are distinguished from user cancellation',async()=>{
 reset();let pending=await pendingSession();let response=await callback.GET(callbackRequest(pending.state,'&error=invalid_scope&error_description=private-data'));
 assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'authorization');assert.ok(!JSON.stringify(loginLogs).includes('private-data'));
 reset();pending=await pendingSession();response=await callback.GET(callbackRequest(pending.state,'&error=access_denied'));assert.equal(new URL(response.headers.get('location')).searchParams.get('error'),'canceled');
});
test('login on a preview domain moves to the callback host before setting session state',async()=>{
 reset();const login=await import(compile('../app/api/referrals/login/route.ts',{'@/lib/referral-auth':authUrl,'@/lib/referrals':referralsUrl,'@/lib/whop-oauth':helperUrl,'@/lib/order-access':accessUrl}));
 let response=await login.GET(new Request('https://preview.test/api/referrals/login'));assert.equal(response.headers.get('location'),'https://second-look.test/api/referrals/login');assert.equal(jar.size,0);
 response=await login.GET(new Request('https://second-look.test/api/referrals/login'));assert.equal(new URL(response.headers.get('location')).hostname,'api.whop.com');assert.ok((await auth.referralSession()).pending);
});
