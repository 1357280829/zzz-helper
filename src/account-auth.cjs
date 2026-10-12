const {randomUUID}=require('node:crypto');
const AUTH='https://passport-api.miyoushe.com/account/ma-cn-passport/web/';
const COOKIE_NAMES=new Set(['ltoken','ltuid','account_id','cookie_token','ltoken_v2','ltuid_v2','ltmid_v2','account_id_v2','account_mid_v2','cookie_token_v2']);
function parseAuthCookies(lines){
  const out=[];
  // Electron fetch coalesces Set-Cookie headers. Split only at a new cookie pair,
  // never at the comma inside an Expires date.
  const separate=lines.flatMap(line=>line.split(/,(?=\s*[!#$%&'*+\-.^_`|~0-9A-Za-z]+\s*=)/));
  for(const line of separate){
    const [pair,...attrs]=line.split(';'),at=pair.indexOf('=');
    const name=pair.slice(0,at).trim(),value=pair.slice(at+1).trim();
    if(at<1||!COOKIE_NAMES.has(name)||!value||/[\r\n;]/.test(value))continue;
    const options={};
    for(const attr of attrs){const [key,...rest]=attr.trim().split('=');options[key.toLowerCase()]=rest.join('=');}
    if(options.domain&&!/(^|\.)(mihoyo|miyoushe)\.com$/.test(options.domain.replace(/^\./,'')))continue;
    const maxAge=Number(options['max-age']),expires=Date.parse(options.expires);
    const expirationDate=options['max-age']!==undefined&&Number.isFinite(maxAge)?Date.now()/1000+maxAge:
      Number.isFinite(expires)?expires/1000:Date.now()/1000+30*86400;
    if(expirationDate<=Date.now()/1000)continue;
    out.push({name,value,expirationDate});
  }
  return out;
}
function hasLoginCookies(cookies){
  const names=new Set(cookies.filter(c=>c.value).map(c=>c.name));
  return (names.has('ltoken_v2')&&(names.has('ltuid_v2')||names.has('account_id_v2')))||
    (names.has('ltoken')&&(names.has('ltuid')||names.has('account_id')));
}
function createQRService(loginSession,encodeQR,requestOverride){
  let active=null,generation=0,committing=Promise.resolve();
  async function request(endpoint,deviceId,body){
    if(requestOverride)return requestOverride(endpoint,deviceId,body);
    let response;
    try{response=await loginSession.fetch(AUTH+endpoint,{method:'POST',headers:{'Content-Type':'application/json',
      'x-rpc-app_id':'bll8iq97cem8','x-rpc-device_id':deviceId,Referer:'https://www.miyoushe.com/'},
      body:JSON.stringify(body),credentials:'include',redirect:'error',signal:AbortSignal.timeout(20000)});}
    catch(e){throw require('./account.cjs').networkError(e);}
    if(!response.ok)throw Error(`米游社登录网络错误（HTTP ${response.status}）。`);
    return {json:await response.json(),cookies:response.headers.getSetCookie()};
  }
  async function start(){
    await cancel();
    const revision=++generation;active=null;const deviceId=randomUUID();
    const {json}=await request('createQRLogin',deviceId,{});
    if(revision!==generation)throw Error('扫码登录已取消。');
    if(json.retcode!==0)throw Error(`米游社二维码生成失败（${json.retcode??'响应异常'}），可尝试官方网页登录。`);
    const {ticket,url}=json.data||{};
    let parsed;try{parsed=new URL(url);}catch(_){throw Error('米游社返回的二维码格式异常。');}
    if(typeof ticket!=='string'||!ticket||parsed.protocol!=='https:'||parsed.hostname!=='user.mihoyo.com')throw Error('米游社返回的二维码格式异常。');
    const image=await encodeQR(url);if(revision!==generation)throw Error('扫码登录已取消。');
    active={ticket,deviceId,expiresAt:Date.now()+180000,polling:false,lastPoll:0};
    return {image,expiresAt:active.expiresAt};
  }
  async function poll(){
    const current=active;if(!current)throw Error('请重新生成登录二维码。');
    if(Date.now()>current.expiresAt){active=null;return {status:'Expired'};}
    if(current.polling||Date.now()-current.lastPoll<1500)return {status:'Waiting'};
    current.polling=true;current.lastPoll=Date.now();
    try{
      const {json,cookies=[]}=await request('queryQRLoginStatus',current.deviceId,{ticket:current.ticket});
      if(active!==current)return {status:'Cancelled'};
      if(json.retcode===-3501){active=null;return {status:'Expired'};}
      if(json.retcode===-3505){active=null;return {status:'Cancelled'};}
      if(json.retcode!==0)throw Error(`米游社扫码状态读取失败（${json.retcode??'响应异常'}），请重试或使用官方网页登录。`);
      const status=json.data?.status;
      if(status!=='Confirmed')return {status:status==='Scanned'?'Scanned':'Waiting'};
      if(json.data.need_realperson||json.data.realname_info?.required){active=null;throw Error('米游社要求完成账号验证，请通过官方网页登录完成后重试。');}
      const authCookies=parseAuthCookies(cookies);
      if(!hasLoginCookies(authCookies)){active=null;throw Error('扫码已确认，但米游社未返回完整登录凭据。请重新生成二维码或使用官方网页登录。');}
      // Official cookies are kept only in this app's persistent login session.
      // Mirror the accepted login cookies to the two official API domain families.
      committing=(async()=>{
        const previous=await loginSession.cookies.get({});
        for(const cookie of previous.filter(c=>COOKIE_NAMES.has(c.name)&&/(^|\.)(mihoyo|miyoushe)\.com$/.test(c.domain.replace(/^\./,'')))){
          if(active!==current)return;
          await loginSession.cookies.remove('https://'+cookie.domain.replace(/^\./,'')+cookie.path,cookie.name);
        }
        for(const cookie of authCookies)for(const domain of ['.mihoyo.com','.miyoushe.com']){
          if(active!==current)return;
          await loginSession.cookies.set({...cookie,url:'https://'+domain.slice(1)+'/',domain,path:'/',secure:true,httpOnly:true,sameSite:'no_restriction'});
        }
        await loginSession.cookies.flushStore();
      })();
      await committing;if(active!==current)return {status:'Cancelled'};
      active=null;return {status:'Confirmed'};
    }finally{current.polling=false;}
  }
  async function cancel(){generation++;active=null;await committing.catch(()=>{});return true;}
  return {start,poll,cancel};
}
module.exports={createQRService,parseAuthCookies,hasLoginCookies,COOKIE_NAMES};
