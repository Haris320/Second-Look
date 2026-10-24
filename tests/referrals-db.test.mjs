import {PGlite} from '@electric-sql/pglite';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
test('referral ledger: first purchase, immutable attribution, duplicate claims and refund races',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table orders(id uuid primary key,email text,whop_payment_id text,paid_at timestamptz);`);
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/2026-10-24-referrals.sql',import.meta.url),'utf8'));
 const scope='production:biz';
 const record=async(id,payment,buyer,email)=>db.query('select record_referral_purchase($1,$2,$3,$4,$5)',[scope,id,payment,buyer,email]);
 const order=async(payment,email,ref=null)=>{
 const id=randomUUID(); await db.query('insert into orders(id,email,whop_payment_id,paid_at,referral_profile_id) values($1,$2,$3,now(),$4)',[id,email,payment,ref]);return id;
 };
 const a=await order('pay_a','a@test.com');await record(a,'pay_a','user_a','a@test.com');
 const ref=(await db.query('select * from referral_profiles')).rows[0];assert.match(ref.code,/^[a-f0-9]{32}$/);
 const b=await order('pay_b','b@test.com',ref.id);
 await Promise.all([record(b,'pay_b','user_b','b@test.com'),record(b,'pay_b','user_b','b@test.com')]);
 let rewards=(await db.query('select * from referral_rewards')).rows;assert.equal(rewards.length,1);assert.equal(rewards[0].amount_cents,300);
 const reward=rewards[0]; assert.ok(Date.parse(reward.available_at)-Date.now()>29*86400000);
 const claim=async()=> (await db.query('select claim_referral_reward($1,$2,$3) r',[reward.id,scope,randomUUID()])).rows[0].r;
 assert.equal(await claim(),null,'hold cannot be skipped');
 const repeat=await order('pay_repeat','different@test.com',ref.id);await record(repeat,'pay_repeat','user_b','different@test.com');
 const self=await order('pay_self','a@test.com',ref.id);await record(self,'pay_self','user_a','a@test.com');
 const alias=await order('pay_alias','A@test.com',ref.id);await record(alias,'pay_alias','user_alias',' A@test.com ');
 assert.equal((await db.query('select count(*)::int n from referral_rewards')).rows[0].n,1,'repeat and self-referrals are ineligible');
 await assert.rejects(record(b,'fake','intruder','evil@test.com'));
 await assert.rejects(record(b,'pay_b','intruder','evil@test.com'));
 const old=await order('pay_old','old@test.com');
 assert.ok(old);
 const existing=await order('pay_existing','old@test.com',ref.id);await record(existing,'pay_existing','user_old','old@test.com');
 assert.equal((await db.query('select count(*)::int n from referral_rewards')).rows[0].n,1,'pre-migration customers are excluded by email');
 await db.query("update referral_rewards set available_at=now()-interval '1 second' where id=$1",[reward.id]);
 const [c,d]=await Promise.all([claim(),claim()]);assert.equal([c,d].filter(Boolean).length,1,'only one worker lease');
 await db.query("select invalidate_referral_reward($1,$2,'refund')",[scope,'pay_b']);
 assert.equal((await db.query('select state from referral_rewards')).rows[0].state,'canceled','leased but unstarted reward cancels');
 assert.equal(await claim(),null);
 // A new customer, with a transfer already initiated, gets recovery state on refund.
 const e=await order('pay_e','e@test.com',ref.id);await record(e,'pay_e','user_e','e@test.com');
 const r=(await db.query("select * from referral_rewards where payment_id='pay_e'")).rows[0];
 await db.query("update referral_rewards set state='transferring' where id=$1",[r.id]);
 await db.query("select invalidate_referral_reward($1,$2,'dispute')",[scope,'pay_e']);
 await db.query("select finish_referral_transfer($1,'transfer_e','succeeded')",[r.id]);
 assert.equal((await db.query('select state from referral_rewards where id=$1',[r.id])).rows[0].state,'recovery_needed','late success cannot erase a refund');
 await assert.rejects(db.query("select finish_referral_transfer($1,'transfer_other','succeeded')",[r.id]));
 await db.exec('set role anon');await assert.rejects(db.query('select * from referral_profiles'));await assert.rejects(db.query('select * from referral_rewards'));await assert.rejects(record(a,'pay_a','user_a','a@test.com'));
 } finally {await db.close();}
});
