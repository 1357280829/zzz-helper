// Reproducible release-only data snapshot. No account credentials are used.
const fs=require('node:fs/promises'),path=require('node:path');
const catalog=require('../src/catalog.js');
const root=path.resolve(__dirname,'../src/data'),assets=path.join(root,'images');
async function get(url){for(let i=0;i<4;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error(`${r.status} ${url}`);return Buffer.from(await r.arrayBuffer());}catch(e){if(i===3)throw e;}}}
async function pool(items,action){let index=0;await Promise.all(Array.from({length:6},async()=>{while(index<items.length){const x=items[index++];await action(x);}}));}
async function portrait(raw){
 const icon=raw.icon.split('/').at(-1).replace(/\.(?:png|webp)$/,'');
 const suffix=icon.replace(/^IconRole/,'');
 // The upstream Circle68 currently aliases Remielle's portrait. Roxy's Select68 is correct.
 const candidates=String(raw.id)==='1621'?['IconRoleSelect'+suffix,icon]:['IconRoleCircle'+suffix,'IconRoleSelect'+suffix,icon];
 for(const candidate of candidates){
  try{return {bytes:await get('https://static.nanoka.cc/assets/zzz/'+candidate+'.webp'),icon:candidate};}
  catch(e){if(candidate===icon)throw e;}
 }
}
(async()=>{
 await fs.mkdir(assets,{recursive:true});
 const manifest=JSON.parse(await get('https://static.nanoka.cc/manifest.json')),version=manifest.zzz.live;
 if(typeof version!=='string'||!/^\d+(?:\.\d+)+(?:\+\d+)?$/.test(version))throw Error('Invalid release version in manifest');
 // A raw response has no version marker. Never reuse the old flat cache across
 // releases: a partially completed fetch could otherwise mix two game versions.
 const cache=path.join(root,'.cache',encodeURIComponent(version));
 await fs.mkdir(cache,{recursive:true});
 async function localized(kind,id){
  const name=kind+'-'+id+'.json',cached=path.join(cache,name);let raw;
  try{raw=JSON.parse(await fs.readFile(cached,'utf8'));}
  catch(_){raw=JSON.parse(await get(base+'zh/'+kind+'/'+id+'.json'));await fs.writeFile(cached,JSON.stringify(raw));}
  await fs.writeFile(path.join(root,name),JSON.stringify(raw));return raw;
 }
 const base=`https://static.nanoka.cc/zzz/${version}/`,imageBase='https://static.nanoka.cc/assets/zzz/';
 const summaries={};for(const kind of ['character','weapon','equipment'])summaries[kind]=JSON.parse(await get(base+kind+'.json'));
 const data={version,fetchedAt:new Date().toISOString(),source:'https://zzz.nanoka.cc',characters:{},weapons:{},sets:{}};
 const portraitSources={};
 await pool(catalog.characters,async c=>{
  if(!summaries.character[c.id])throw Error('Character is absent from release '+version+': '+c.id);
  const raw=await localized('character',c.id);
  data.characters[c.id]=raw;const image=path.join(assets,'agent-'+c.id+'.webp');
  try{await fs.access(image);}catch(_){await fs.writeFile(image,await get(imageBase+raw.icon+'.webp'));}
  // Circle assets are the official face portraits, rather than fullbody art.
  // Record their source in the snapshot and refresh with each fetched snapshot.
  const head=await portrait(raw);portraitSources[c.id]=head.icon;
  await fs.writeFile(path.join(assets,'head-'+c.id+'.webp'),head.bytes);
  if(!head.icon.startsWith('IconRoleCircle'))console.log('Portrait fallback:',c.id,head.icon);
 });console.log('Released characters and avatars:',Object.keys(data.characters).length);
 data.portraitSources=portraitSources;
 for(const [kind,target]of [['weapon','weapons'],['equipment','sets']])await pool(Object.keys(summaries[kind]),async id=>{
  const raw=await localized(kind,id);
  data[target][id]=raw;
  const icon=summaries[kind][id].icon.split('/').at(-1).replace(/\.png$/, '');const image=path.join(assets,kind+'-'+id+'.webp');
  try{await fs.access(image);}catch(_){try{await fs.writeFile(image,await get(imageBase+icon+'.webp'));}catch(e){console.log('Icon unavailable:',kind,id);}}
 });
 await fs.writeFile(path.join(root,'game-data.js'),'/* Release snapshot; see docs/DATA-SOURCES.md. */\n(function(r,d){if(typeof module==="object"&&module.exports)module.exports=d;else r.GameData=d;})(globalThis,'+JSON.stringify(data)+');\n');
 console.log('Snapshot',version,'weapons',Object.keys(data.weapons).length,'sets',Object.keys(data.sets).length);
})();
