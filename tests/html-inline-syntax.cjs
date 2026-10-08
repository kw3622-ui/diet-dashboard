const fs=require('node:fs');
const vm=require('node:vm');
const file=process.argv[2];
const html=fs.readFileSync(file,'utf8');
const re=/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi;
let match,count=0;
while((match=re.exec(html))){
  if(!match[1].trim())continue;
  const lineOffset=html.slice(0,match.index).split('\n').length;
  new vm.Script(match[1],{filename:file,lineOffset});
  count++;
}
console.log(`PASS ${count} inline scripts`);

