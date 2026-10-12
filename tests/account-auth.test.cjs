const {test}=require('node:test'),assert=require('node:assert/strict');
const {createQRService,parseAuthCookies,hasLoginCookies}=require('../src/account-auth.cjs');
const make=()=>{
 const stored=[],calls=[];let status='Confirmed',code=0,delay;
 const svc=createQRService({cookies:{get:async()=>[],remove:async()=>{},set:async c=>stored.push(c),flushStore:async()=>{}}},async()=>'data:image/png;base64,fixture',async(endpoint,device,body)=>{
   calls.push({endpoint,device,body});if(endpoint==='createQRLogin')return {json:{retcode:0,data:{ticket:'fixture-ticket',url:'https://user.mihoyo.com/login-platform/mobile.html?tk=fixture'}}};
   if(delay)await delay;return {json:{retcode:code,data:{status}},cookies:['ltoken_v2=fixture-token; Domain=.miyoushe.com; Path=/; Max-Age=3600; Secure; HttpOnly','ltuid_v2=fixture-id; Domain=.miyoushe.com; Max-Age=3600']};
 });return {svc,stored,calls,setStatus:s=>{status=s;},setCode:c=>{code=c;},setDelay:d=>{delay=d;}};
};
test('扫码确认后的官方 Cookie 保存在独立会话，不返回凭据到界面',async()=>{
 const f=make(),qr=await f.svc.start();assert.deepEqual(Object.keys(qr).sort(),['expiresAt','image']);
 const result=await f.svc.poll();assert.deepEqual(result,{status:'Confirmed'});assert.ok(!JSON.stringify(result).includes('fixture-token'));
 assert.equal(f.stored.length,4);assert.equal(f.stored[0].httpOnly,true);assert.equal(f.stored[0].secure,true);assert.ok(hasLoginCookies(f.stored));
 assert.equal(f.calls[0].device,f.calls[1].device);assert.equal(f.calls[1].body.ticket,'fixture-ticket');
});
test('已扫描状态不会保存登录凭据，取消期间的响应不能恢复登录',async()=>{
 const f=make();f.setStatus('Scanned');await f.svc.start();assert.deepEqual(await f.svc.poll(),{status:'Scanned'});assert.equal(f.stored.length,0);
 await f.svc.start();f.setStatus('Confirmed');let release;f.setDelay(new Promise(r=>release=r));const pending=f.svc.poll();f.svc.cancel();release();
 assert.deepEqual(await pending,{status:'Cancelled'});assert.equal(f.stored.length,0);
});
test('过期与取消二维码返回明确状态',async()=>{
 for(const [code,status]of [[-3501,'Expired'],[-3505,'Cancelled']]){const f=make();f.setCode(code);await f.svc.start();assert.deepEqual(await f.svc.poll(),{status});assert.equal(f.stored.length,0);}
});
test('只接受官方域名的有效登录 Cookie，设备信息不足以登录',()=>{
 const cookies=parseAuthCookies(['DEVICEFP=secret; Domain=.mihoyo.com','ltoken_v2=bad; Domain=.evil.example','ltoken=expired; Max-Age=0','ltoken_v2=fixture; Domain=.miyoushe.com; Max-Age=60','ltuid_v2=123; Domain=.miyoushe.com; Max-Age=60']);
 assert.equal(cookies.length,2);assert.ok(hasLoginCookies(cookies));assert.equal(hasLoginCookies([{name:'DEVICEFP',value:'fixture'}]),false);
});
test('Chromium 合并多个 Set-Cookie 后仍保留账号 ID，不能误拆 Expires 日期',()=>{
 const joined='ltoken_v2=fixture-token; Domain=.miyoushe.com; Path=/; Expires=Tue, 01 Jan 2030 00:00:00 GMT; HttpOnly, ltuid_v2=123; Domain=.miyoushe.com; Path=/; Max-Age=3600, account_mid_v2=fixture-mid; Domain=.miyoushe.com; Path=/; Max-Age=3600';
 const cookies=parseAuthCookies([joined]);assert.deepEqual(cookies.map(c=>c.name),['ltoken_v2','ltuid_v2','account_mid_v2']);assert.ok(hasLoginCookies(cookies));
 assert.equal(cookies[0].expirationDate,Date.parse('2030-01-01T00:00:00Z')/1000);
});
