import sharp from "sharp";
const SRC="scripts/.q37/orig.png", D="scripts/.q37/";
const crops={
  coning:[140,50,720,155],
  c1:[72,425,238,198], c2:[468,425,245,198], c3:[872,425,246,198],
  c4:[72,640,238,193], c5:[468,640,245,193],
};
for(const [n,[l,t,w,h]] of Object.entries(crops)) await sharp(SRC).extract({left:l,top:t,width:w,height:h}).toFile(D+n+".png");
const labels=["c1","c2","c3","c4","c5"];
const imgs=await Promise.all(labels.map(n=>sharp(D+n+".png").resize({height:200}).png().toBuffer()));
const metas=await Promise.all(imgs.map(b=>sharp(b).metadata()));
const gap=20;let x=0;const comp=[];const totalW=metas.reduce((a,m)=>a+m.width+gap,0);
for(let i=0;i<imgs.length;i++){comp.push({input:imgs[i],left:x,top:0});x+=metas[i].width+gap;}
await sharp({create:{width:totalW,height:200,channels:3,background:"#fff"}}).composite(comp).png().toFile(D+"_strip.png");
console.log("done, strip",totalW);
