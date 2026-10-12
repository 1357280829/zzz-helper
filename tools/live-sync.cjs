// Upgrade the user's own app records using the already authorized, persistent login.
// Never print account identity or authentication values.
const {app,session}=require('electron'),fs=require('node:fs/promises'),path=require('node:path');
const M=require('../src/model.js'),{createAccountService}=require('../src/account.cjs');
app.setPath('userData',path.join(app.getPath('appData'),'ZZZ Buff Studio'));app.disableHardwareAcceleration();
app.whenReady().then(async()=>{try{
 const file=path.join(app.getPath('userData'),'records.json');const old=JSON.parse(await fs.readFile(file,'utf8'));await fs.copyFile(file,file+'.before-v2-'+Date.now());
 const state=M.validateState(old),service=createAccountService(session.fromPartition('persist:miyoushe-account')),roles=await service.roles();
 const shot=await service.sync(roles[0].uid,roles[0].region);M.applyAccountSnapshot(state,shot);const valid=M.validateState(state);
 await fs.writeFile(file+'.tmp',JSON.stringify(valid,null,2));await fs.rename(file+'.tmp',file);
 console.log('REAL_SYNC_OK roles='+roles.length+' agents='+shot.agents.length+' partial='+shot.warnings.length);
 const owned=valid.characters.filter(c=>c.owned),equipment=owned.flatMap(c=>M.build(valid,c.id,'existing').discs);
 console.log('REAL_DETAILS_OK properties='+owned.reduce((n,c)=>n+c.existing.raw.properties.length,0)+' discs='+equipment.length+' knownSets='+equipment.filter(d=>M.D.sets[d.setId]).length);
 const lucy=owned.find(c=>c.id==='1151');if(lucy){const b=M.build(valid,'1151','existing');console.log('LUCY_DETAIL_SHAPE core='+b.core+' special='+b.skills.special+' rank='+b.rank+' weaponKnown='+Boolean(M.D.weapons[b.weapon?.id]));}
 app.quit();
 }catch(e){console.error(e.message);app.exit(1);}});
