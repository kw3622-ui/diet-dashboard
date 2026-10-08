const sharp=require('sharp');
const path=require('node:path');

const root=path.resolve('diet-dashboard/rpg-dev/assets');
const jobs=[
  ['guardian-male_v0.2.0.png','guardian-male-web_v0.2.0.png',900],
  ['guardian-female_v0.2.0.png','guardian-female-web_v0.2.0.png',900],
  ['health-monsters_v0.2.0.png','health-monsters-web_v0.2.0.png',1050]
];

(async()=>{
  for(const [input,output,width] of jobs){
    await sharp(path.join(root,input)).resize({width,withoutEnlargement:true,kernel:'nearest'}).png({compressionLevel:9,palette:true,quality:92}).toFile(path.join(root,output));
  }
  console.log('PASS optimized RPG sprite assets');
})().catch(error=>{console.error(error);process.exitCode=1});

