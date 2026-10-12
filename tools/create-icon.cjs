// Shared geometric logo: high-resolution PNG, Windows ICO and macOS ICNS.
const fs=require('node:fs');const path=require('node:path');const zlib=require('node:zlib');
const polygons=[[[61,76],[190,76],[184,101],[104,173],[170,173],[163,198],[40,198],[48,174],[129,101],[54,101]],[[174,40],[219,40],[210,86],[197,75],[185,87],[173,75],[197,51],[174,53]]];
function inside(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if(((p[i][1]>y)!==(p[j][1]>y))&&(x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0]))c=!c;}return c;}
function render(size){
const data=Buffer.alloc(size*(size*4+1));
for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const i=y*(size*4+1)+1+x*4;
  const px=x*256/size,py=y*256/size;
  const cx=Math.max(30,Math.min(225,px)),cy=Math.max(30,Math.min(225,py));
  const visible=(px-cx)**2+(py-cy)**2<=30**2;
  const dark=polygons.some(p=>inside(px,py,p));
  data[i]=dark?28:214;data[i+1]=dark?37:243;data[i+2]=dark?21:107;data[i+3]=visible?255:0;
}
const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]);
}
function crc32(b){let c=0xffffffff;for(const n of b){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
function chunk(type,b){const t=Buffer.from(type),out=Buffer.alloc(b.length+12);out.writeUInt32BE(b.length);t.copy(out,4);b.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([t,b])),b.length+8);return out;}
const png=render(256);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
fs.writeFileSync(path.resolve(__dirname,'../src/app-icon.png'),render(1024));
fs.writeFileSync(path.resolve(__dirname,'../src/app.ico'),Buffer.concat([ico,png]));
const images=[['ic07',128],['ic08',256],['ic09',512],['ic10',1024]].map(([type,size])=>{
  const image=render(size),header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(image.length+8,4);
  return Buffer.concat([header,image]);
});
const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+images.reduce((sum,b)=>sum+b.length,0),4);
fs.writeFileSync(path.resolve(__dirname,'../src/app.icns'),Buffer.concat([header,...images]));
