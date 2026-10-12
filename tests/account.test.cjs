const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createAccountService,normalizeAgent,responseData,ds,LOGIN,API_REFERER,networkError}=require('../src/account.cjs');
const agent={id:1191,name_mi18n:'艾莲',element_type:202,level:60,rank:2,
  properties:[{property_id:2,property_name:'攻击力',final:'3,500'},{property_id:5,final:'72.4%'},{property_id:6,final:'158.8%'},
    {property_id:8,final:'123'},{property_id:316,final:'12%'},{property_id:317,final:'30%'},{property_id:9,final:'24%'}],
  weapon:{name:'深海访客',level:60,star:1},equip:[{name:'极地重金属',level:15}],skills:[{name:'核心技',level:6}]};
test('真实请求路径使用来源域名，网络成功时正确报告登录失效',async()=>{
  let calls=0;
  const session={cookies:{get:async()=>[{domain:'.mihoyo.com',name:'ltuid',value:'test-fixture'},{domain:'.mihoyo.com',name:'ltoken',value:'test-token'}]},fetch:async(url,init)=>{
    calls++;assert.ok(url.startsWith('https://api-takumi.mihoyo.com/'));
    assert.ok(!init.headers.Referer.includes('#'));assert.equal(init.headers.Referer,API_REFERER);assert.equal(init.credentials,'omit');
    return {ok:true,json:async()=>({retcode:-100,message:'ignored'})};
  }};
  assert.ok(LOGIN.includes('#'));assert.equal(API_REFERER,'https://act.mihoyo.com/');
  await assert.rejects(()=>createAccountService(session).roles(),/登录已失效/);assert.equal(calls,1);
});
test('设备 Cookie 不能视为已登录，不向接口发出无凭据请求',async()=>{
 const svc=createAccountService({cookies:{get:async()=>[{domain:'.mihoyo.com',name:'DEVICEFP',value:'fixture'}]},fetch:()=>assert.fail('must not fetch')});
 await assert.rejects(()=>svc.roles(),/没有保存到可用的登录凭据/);
});
test('官方验证的设备指纹只从本客户端会话读取并随请求发送',async()=>{
 const svc=createAccountService({cookies:{get:async()=>[{domain:'.mihoyo.com',name:'ltuid',value:'fixture-id'},{domain:'.mihoyo.com',name:'ltoken',value:'fixture-token'},{domain:'.mihoyo.com',name:'DEVICEFP',value:'fixture-fp'},{domain:'.mihoyo.com',name:'_MHYUUID',value:'fixture-device'}]},fetch:async(_url,init)=>{
  assert.equal(init.headers['x-rpc-device_fp'],'fixture-fp');assert.equal(init.headers['x-rpc-device_id'],'fixture-device');assert.ok(!init.headers.Cookie.includes('fixture-fp'));
  return {ok:true,json:async()=>({retcode:0,data:{list:[{game_uid:'12345678',region:'prod_gf_cn'}]}})};
 }});assert.equal((await svc.roles()).length,1);
});
test('官方网页登录凭据在米游社域名时可恢复，但不拼接另一域名的旧身份',async()=>{
 const svc=createAccountService({cookies:{get:async({url})=>url.includes('passport-api')?[{domain:'.miyoushe.com',name:'ltoken_v2',value:'new-token'},{domain:'.miyoushe.com',name:'ltuid_v2',value:'new-id'}]:[{domain:'.mihoyo.com',name:'ltuid',value:'old-id'}]},fetch:async(url,init)=>{
  assert.equal(init.headers.Cookie,'ltoken_v2=new-token; ltuid_v2=new-id');
  return {ok:true,json:async()=>({retcode:0,data:{list:[{game_uid:'12345678',region:'prod_gf_cn',nickname:'fixture'}]}})};
 }});
 assert.equal((await svc.roles()).length,1);
});
test('网络提示区分客户端拦截、代理、DNS 和超时，隐藏任意错误细节',()=>{
  assert.match(networkError(Error('net::ERR_BLOCKED_BY_CLIENT')).message,/客户端拦截/);
  assert.match(networkError(Error('net::ERR_PROXY_CONNECTION_FAILED')).message,/系统代理/);
  assert.match(networkError(Error('net::ERR_NAME_NOT_RESOLVED')).message,/DNS/);
  assert.match(networkError({name:'TimeoutError'}).message,/超时/);
  assert.ok(!networkError(Error('secret cookie value')).message.includes('secret'));
});
test('国服签名按未编码且排序后的查询生成，百分比面板保留百分点',()=>{
  const params={server:'prod_gf_cn',role_id:'123','id_list[]':1191};
  const expected=createHash('md5').update('salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=1&r=100001&b=&q=id_list[]=1191&role_id=123&server=prod_gf_cn').digest('hex');
  assert.equal(ds(params,1,100001),`1,100001,${expected}`);
  const a=normalizeAgent(agent);assert.equal(a.panel.initialAttack,3500);assert.equal(a.panel.critRate,72.4);assert.equal(a.panel.elementDamage,30);
  assert.equal(a.info.rank,2);assert.equal(a.info.panelComplete,true);assert.ok(a.info.equipment.includes('深海访客'));
});
test('登录与验证错误给出可处理提示，不返回服务端的任意消息或凭据',()=>{
  assert.throws(()=>responseData({retcode:-100,message:'secret'}),/登录/);
  assert.throws(()=>responseData({retcode:1034,message:'secret'}),/验证/);
  assert.throws(()=>responseData({retcode:500,message:'secret'}),e=>!e.message.includes('secret'));
});
test('读取全部持有角色并保留详情失败的基本记录，拒绝非绑定账号',async()=>{
  const progress=[],calls=[];
  const svc=createAccountService(null,p=>progress.push(p),async(url,params)=>{
    calls.push([url,params]);
    if(url.includes('getUserGameRoles'))return {retcode:0,data:{list:[{game_uid:'12345678',region:'prod_gf_cn',nickname:'测试'}]}};
    if(url.endsWith('avatar/basic'))return {retcode:0,data:{avatar_list:[agent,{...agent,id:1151,name_mi18n:'露西',element_type:201,properties:[]}]}};
    if(params['id_list[]']===1151)return {retcode:1034};
    return {retcode:0,data:{avatar_list:[agent]}};
  });
  const snapshot=await svc.sync('12345678','prod_gf_cn');assert.equal(snapshot.agents.length,2);assert.equal(snapshot.warnings.length,1);
  assert.equal(snapshot.agents[1].info.panelComplete,false);assert.deepEqual(progress.at(-1),{done:2,total:2});
  assert.ok(calls.every(([url])=>url.startsWith('https://api-takumi')));
  await assert.rejects(()=>svc.sync('87654321','prod_gf_cn'),/绑定/);
});
