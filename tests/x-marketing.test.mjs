import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { PGlite } from '@electric-sql/pglite';
const compile = path => 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url),'utf8').replace('import "server-only";', ''), { compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022} }).outputText).toString('base64');
const { validateMarketingText } = await import(compile('../lib/marketing-policy.ts'));
const { xAuthorization } = await import(compile('../lib/x-client.ts'));
test('OAuth signature matches published OAuth 1.0 photo example', () => {
 const header = xAuthorization('GET', 'http://photos.example.net/photos?file=vacation.jpg&size=original', {key:'dpf43f3p2l4k3l03',secret:'kd94hf93k423kf44',token:'nnch734d00sl2jdk',tokenSecret:'pfkkdhi9sl3r4s00'}, 'kllo9940pd9333jh', '1191242096');
 assert.ok(header.includes('tR3%2BTy81lMeYAr%2FFid0kMTYa%2FWM%3D'));
});
test('copy guard rejects links, mentions, oversized text and repetition', () => {
 for (const text of ['Visit https://evil.test', '@someone hi', 'a'.repeat(251), '', 'Emoji 😃']) assert.throws(() => validateMarketingText(text, []));
 assert.throws(() => validateMarketingText('Choose a clear lead photo.', ['Choose a clear lead photo.']));
 assert.equal(validateMarketingText('Choose a clear lead photo.', []), 'Choose a clear lead photo.');
});
test('daily claims are atomic, private, and unresolved publication blocks later days', async () => {
 const db = new PGlite();
 try {
 await db.exec('create role anon; create role authenticated; create role service_role;');
 await db.exec(fs.readFileSync(new URL('../supabase/migrations/2026-10-24-x-marketing.sql',import.meta.url),'utf8'));
 const claim = async () => (await db.query("select claim_marketing_post('secondlook_date') as slot")).rows[0].slot;
 const claims = await Promise.all([claim(), claim()]);
 assert.equal(claims.filter(Boolean).length,1);
 await db.exec("update marketing_posts set state='posting',day=day-1,created_at=now()-interval '1 day'");
 assert.equal(await claim(),null);
 await db.exec("update marketing_posts set state='unknown'");
 assert.equal(await claim(),null);
 await db.exec("update marketing_posts set state='posted',post_id='123'");
 assert.ok(await claim());
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from marketing_posts'));
 await assert.rejects(claim());
 } finally { await db.close(); }
});
