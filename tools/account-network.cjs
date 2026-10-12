// Optional live connectivity regression with dummy authentication and isolated storage.
// No human cookies, account data, or records are loaded by this test.
const {app,session}=require('electron');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createAccountService,API_REFERER}=require('../src/account.cjs');
app.setPath('userData',path.resolve('artifacts/account-network-'+Date.now()));
app.whenReady().then(async()=>{
  try{
    const isolated=session.fromPartition('account-network');
    const http=require('node:http');
    const echo=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.setHeader('Set-Cookie',[
      'ltoken_v2=fixture-token; Path=/; Max-Age=3600; HttpOnly',
      'ltuid_v2=123; Path=/; Max-Age=3600; HttpOnly']);res.end(JSON.stringify(req.url==='/createQRLogin'?{retcode:0,data:{ticket:'fixture-ticket',url:'https://user.mihoyo.com/login-platform/mobile.html?tk=fixture'}}:
      req.url==='/queryQRLoginStatus'?{retcode:0,data:{status:'Confirmed'}}:{cookie:req.headers.cookie||''}));});
    await new Promise(r=>echo.listen(0,'127.0.0.1',r));
    try{
      const sent=await isolated.fetch(`http://127.0.0.1:${echo.address().port}/`,{headers:{Cookie:'ltoken=fixture-only'},credentials:'omit'});
      assert.equal((await sent.json()).cookie,'ltoken=fixture-only');
      console.log('PASS: explicit authentication header is transmitted unchanged by Electron.');
      const {parseAuthCookies,hasLoginCookies}=require('../src/account-auth.cjs');
      const received=parseAuthCookies(sent.headers.getSetCookie());
      assert.equal(received.length,2);assert.ok(hasLoginCookies(received));
      const kept=await isolated.fetch(`http://127.0.0.1:${echo.address().port}/`,{credentials:'include'});await kept.text();
      assert.ok(hasLoginCookies(await isolated.cookies.get({url:'http://127.0.0.1/'})));
      console.log('PASS: real Chromium coalesced Set-Cookie response retains both token and account ID.');
      const fixtureQR=require('../src/account-auth.cjs').createQRService(isolated,async()=>'<fixture-image>',async endpoint=>{
        const res=await isolated.fetch(`http://127.0.0.1:${echo.address().port}/${endpoint}`,{method:'POST',body:'{}',credentials:'include'});
        return {json:await res.json(),cookies:res.headers.getSetCookie()};
      });
      await fixtureQR.start();assert.deepEqual(await fixtureQR.poll(),{status:'Confirmed'});
      assert.ok(hasLoginCookies(await isolated.cookies.get({url:'https://api-takumi.mihoyo.com/'})));
      console.log('PASS: full QR confirmation path saves complete credentials in a real Electron cookie session.');
    }finally{await new Promise(r=>echo.close(r));}
    await isolated.cookies.set({url:'https://api-takumi.mihoyo.com/',name:'ltuid',value:'1',secure:true});
    await isolated.cookies.set({url:'https://api-takumi.mihoyo.com/',name:'ltoken',value:'dummy-invalid',secure:true});
    const svc=createAccountService(isolated);
    await assert.rejects(()=>svc.roles(),e=>e.message.includes('登录已失效')&&!e.message.includes('无法连接'));
    console.log('PASS: real Electron session reached Miyoushe and returned the expected login error.');
    console.log('PASS: request Referer has no fragment: '+String(!API_REFERER.includes('#')));
    const qr=require('../src/account-auth.cjs').createQRService(isolated,url=>require('qrcode').toDataURL(url));
    const created=await qr.start();assert.ok(created.image.startsWith('data:image/png;base64,'));
    assert.deepEqual(await qr.poll(),{status:'Waiting'});qr.cancel();
    console.log('PASS: official QR creation and pending-status query work; no human login performed.');
    app.quit();
  }catch(e){console.error(e.message);app.exit(1);}
});
