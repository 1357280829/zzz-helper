// Read-only Miyoushe game-record adapter. Authentication stays in the login session.
const {createHash,randomInt}=require('node:crypto');
const {hasLoginCookies,COOKIE_NAMES}=require('./account-auth.cjs');
const RECORD='https://api-takumi-record.mihoyo.com/event/game_record_zzz/api/zzz';
const ROLES='https://api-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie';
const LOGIN='https://act.mihoyo.com/app/mihoyo-zzz-game-record/m.html?game_biz=nap_cn#/zzz/landing';
// These are cross-origin requests. Chromium's default referrer policy requires
// an origin-only Referer; manually supplying the full login page is blocked.
const API_REFERER=new URL(LOGIN).origin+'/';
function networkError(e){
  const code=String(e?.message||'').match(/\b(ERR_[A-Z0-9_]+)\b/)?.[1];
  if(e?.name==='TimeoutError'||e?.name==='AbortError'||code==='ERR_TIMED_OUT')return Error('米游社请求超时，请稍后重试。');
  if(code==='ERR_BLOCKED_BY_CLIENT')return Error('米游社请求被客户端拦截（ERR_BLOCKED_BY_CLIENT），请更新客户端后重试。');
  if(['ERR_PROXY_CONNECTION_FAILED','ERR_TUNNEL_CONNECTION_FAILED','ERR_NO_SUPPORTED_PROXIES'].includes(code))return Error(`无法连接系统代理（${code}），请确认代理可用后重试。`);
  if(code==='ERR_NAME_NOT_RESOLVED')return Error('无法解析米游社地址（ERR_NAME_NOT_RESOLVED），请检查 DNS 或网络后重试。');
  if(code?.startsWith('ERR_CERT_')||code?.startsWith('ERR_SSL_'))return Error(`米游社安全连接失败（${code}），请检查系统时间和网络证书。`);
  return Error(`无法连接米游社${code?`（${code}）`:''}，请检查网络后重试。`);
}
function ds(params,t=Math.floor(Date.now()/1000),r=randomInt(100001,200001)){
  const q=Object.entries(params).sort(([a],[b])=>a.localeCompare(b,'en')).map(([k,v])=>`${k}=${v}`).join('&');
  const hash=createHash('md5').update(`salt=xV8v4Qu54lUKrEYFZkJhB8cuOh9Asafs&t=${t}&r=${r}&b=&q=${q}`).digest('hex');
  return `${t},${r},${hash}`;
}
function responseData(json){
  if(!json||json.retcode!==0){
    const code=json?.retcode;
    if([-100,10001,-10001].includes(code))throw Error('米游社未接受当前登录凭据（登录已失效）。请点击“扫码登录”重新确认。');
    if([1034,10035,5003,10041].includes(code))throw Error('米游社要求验证，请在登录窗口完成官方验证后重试。');
    if(code===10102)throw Error('战绩数据暂不可读，请在米游社确认账号绑定和战绩可见性。');
    throw Error(`米游社读取失败（${code??'响应格式异常'}）。当前记录未改变。`);
  }
  return json.data;
}
const numeric=v=>{if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string')return null;const s=v.replace(/[,，%％\s]/g,'');return /^-?\d+(\.\d+)?$/.test(s)?Number(s):null;};
function normalizeAgent(a){
  const element={200:'物理',201:'火',202:'冰',203:'电',204:'风',205:'以太',300:'辉光'}[a.element_type];
  if(!/^\d{4,8}$/.test(String(a.id))||!element)throw Error('米游社返回了无法识别的角色属性，请更新客户端。');
  const panel={};const ids={2:'initialAttack',5:'critRate',6:'critDamage',8:'proficiency',9:'penRate',232:'penFlat',
    315:'elementDamage',316:'elementDamage',317:'elementDamage',318:'elementDamage',319:'elementDamage',323:'elementDamage'};
  const elementProperty={物理:315,火:316,冰:317,电:318,以太:319,风:323};
  for(const p of a.properties||[]){
    const key=ids[Number(p.property_id)];if(!key)continue;
    if(key==='elementDamage'&&Number(p.property_id)!==elementProperty[element])continue;
    const value=numeric(p.final);if(value!==null&&value>=0&&value<=10000000&&(!['initialAttack','proficiency'].includes(key)||value>0))panel[key]=value;
  }
  const equipment=[a.weapon?`音擎：${a.weapon.name} · Lv.${a.weapon.level} · ${a.weapon.star} 星`:'',
    ...(a.equip||[]).map(d=>`驱动盘 ${d.equipment_type??d.slot??''}：${d.name??d.suit?.name??'未命名'} · Lv.${d.level??'?'}`)].filter(Boolean).join('\n').slice(0,3000);
  const skills=(a.skills||[]).map(s=>`${s.name??s.skill_type??'技能'}：Lv.${s.level??s.lv??'?'}`).join('\n').slice(0,3000);
  return {id:String(a.id),name:String(a.name_mi18n||a.full_name_mi18n||'未命名角色').slice(0,40),element,panel,
    info:{level:Number(a.level)||0,rank:Number(a.rank)||0,syncedAt:new Date().toISOString(),equipment,skills,
      attributes:(a.properties||[]).map(p=>`${p.property_name||p.property_id}：${p.final}`).join('\n').slice(0,3000),
      panelComplete:['initialAttack','critRate','critDamage','proficiency'].every(k=>Object.hasOwn(panel,k)),
      // Preserve every visible game property, equipped item, skill and mindscape.
      // Only game-record data is copied; login/session data never enters records.
      raw:{properties:a.properties||[],weapon:a.weapon||null,equip:a.equip||[],skills:a.skills||[],ranks:a.ranks||[],
        skill_awaken:a.skill_awaken||null,avatar_profession:a.avatar_profession}}};
}
function createAccountService(loginSession,progress=()=>{},requestOverride){
  let busy=false;
  async function request(base,params){
    if(requestOverride)return responseData(await requestOverride(base,params));
    // Read only cookies belonging to this application's official login window.
    const onlyAuth=cookies=>cookies.filter(c=>/(^|\.)(mihoyo|miyoushe)\.com$/.test(c.domain.replace(/^\./,''))&&COOKIE_NAMES.has(c.name));
    const originCookies=await loginSession.cookies.get({url:base});
    let permitted=onlyAuth(originCookies);
    // A successful official web login may be stored on the Miyoushe passport
    // domain. Recover the complete set without mixing account identities.
    if(!hasLoginCookies(permitted))permitted=onlyAuth(await loginSession.cookies.get({url:'https://passport-api.miyoushe.com/'}));
    if(!hasLoginCookies(permitted))throw Error('客户端没有保存到可用的登录凭据。若已完成扫码，这是登录结果接收失败，请更新客户端后重试。');
    // Keep one value per name; unrelated device cookies cannot masquerade as login.
    const cookie=[...new Map(permitted.map(c=>[c.name,c.value]))].map(([name,value])=>`${name}=${value}`).join('; ');
    const url=new URL(base);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
    let res;
    // The official verification is tied to this session's device fingerprint.
    // Use only values created by the official page in our own login partition.
    const deviceHeaders={};
    const fp=originCookies.find(c=>c.name==='DEVICEFP'),device=originCookies.find(c=>c.name==='_MHYUUID');
    if(fp)deviceHeaders['x-rpc-device_fp']=fp.value;
    if(device)deviceHeaders['x-rpc-device_id']=device.value;
    const signed={DS:ds(params),'x-rpc-app_version':'2.11.1','x-rpc-client_type':'5',...deviceHeaders};
    try{res=await loginSession.fetch(url.href,{headers:{Cookie:cookie,...signed,
      Referer:API_REFERER,'x-rpc-language':'zh-cn'},credentials:'omit',signal:AbortSignal.timeout(20000),redirect:'error'});}
    catch(e){throw networkError(e);}
    if(!res.ok)throw Error(`米游社网络错误（HTTP ${res.status}），请稍后重试。`);
    return responseData(await res.json());
  }
  async function roles(){
    const data=await request(ROLES,{game_biz:'nap_cn'});
    const list=(data?.list||[]).filter(r=>['prod_gf_cn','prod_qd_cn'].includes(r.region));
    if(!list.length)throw Error('此米游社账号未绑定国服绝区零角色。请先在官方账号页面确认绑定。');
    return list.map(r=>({uid:String(r.game_uid),region:r.region,nickname:String(r.nickname||'国服账号').slice(0,80),regionName:String(r.region_name||r.region)}));
  }
  async function sync(uid,server){
    if(busy)throw Error('正在同步，请等待本次读取完成。');busy=true;
    try{
      if(!(await roles()).some(r=>r.uid===String(uid)&&r.region===server))throw Error('请选择当前登录账号绑定的游戏角色。');
      const common={role_id:String(uid),server};
      const basic=await request(RECORD+'/avatar/basic',common);
      if(!Array.isArray(basic?.avatar_list)||!basic.avatar_list.length)throw Error('账号未返回角色列表，现有记录未改变。');
      if(basic.avatar_list.length>200)throw Error('角色数量异常，现有记录未改变。');
      const agents=[],warnings=[];
      for(let i=0;i<basic.avatar_list.length;i++){
        const agent=basic.avatar_list[i];let full=agent;
        try{const detail=await request(RECORD+'/avatar/info',{...common,'id_list[]':agent.id});
          if(!detail?.avatar_list?.length)throw Error('没有详细面板');full={...agent,...detail.avatar_list[0]};}
        catch(e){warnings.push(`${agent.name_mi18n||agent.id}：详细面板未读到`);}
        agents.push(normalizeAgent(full));progress({done:i+1,total:basic.avatar_list.length});
        if(!requestOverride)await new Promise(r=>setTimeout(r,120));
      }
      return {agents,warnings,uid:String(uid),server,syncedAt:new Date().toISOString()};
    }finally{busy=false;}
  }
  return {roles,sync};
}
module.exports={createAccountService,normalizeAgent,responseData,ds,LOGIN,API_REFERER,networkError};
