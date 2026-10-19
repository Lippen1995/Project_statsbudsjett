/** Local-only research harness, no app/config/source mutations or external services. */
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';

const folder=dirname(fileURLToPath(import.meta.url)),root=resolve(folder,'../../..');
const require=createRequire(resolve(root,'apps/bergen-simulator/package.json'));
const {chromium}=require('playwright');
const workspace=resolve(process.argv[2]??'/tmp/bergen-reconstruction-study');
assert(!workspace.startsWith(root+'/'),'Use an isolated temporary workspace');
const assets=new Map([
 ['skur-r1c.glb',resolve(workspace,'skur-r1c.glb')],
 ['skur-indexed.glb',resolve(workspace,'skur-indexed.glb')],
 ['skur-meshopt.glb',resolve(workspace,'skur-meshopt.glb')],
 ['skur-osm2world.glb',resolve(workspace,'osm/skur-osm2world.glb')],
]);
const vendor=resolve(root,'apps/bergen-simulator/node_modules/three');
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://127.0.0.1'),path=decodeURIComponent(url.pathname);
  let file;
  if(path==='/')file=resolve(folder,'viewer.html');
  else if(path==='/viewer.mjs')file=resolve(folder,'viewer.mjs');
  else if(path.startsWith('/assets/'))file=assets.get(path.slice(8));
  else if(path.startsWith('/vendor/three/')){const p=resolve(vendor,path.slice(14));if(p.startsWith(vendor+'/'))file=p}
  if(!file){res.writeHead(404).end();return}
  res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');
  res.setHeader('Cache-Control','no-store');res.end(await readFile(file));
 }catch{res.writeHead(404).end()}
});
await new Promise(r=>server.listen(4192,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const report={method:'Isolated single-building uniform-shader software renderer; 4 warmups + 12 retained two-RAF/gl.finish probes. No whole-city/hardware FPS claim.',browser:browser.version(),cases:[],errors:[]};
await mkdir(resolve(workspace,'browser'),{recursive:true});
try{
 for(const mobile of [false,true])for(const asset of ['r1c','indexed','meshopt','osm']){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:900},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[],remote=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(!new URL(r.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))remote.push(new URL(r.url()).hostname)});
  await page.goto('http://127.0.0.1:4192/?asset='+asset);
  await page.waitForFunction(()=>window.experiment?.ready,undefined,{timeout:30000});
  const data=await page.evaluate(()=>({metadata:experiment.metadata,ids:experiment.ids,bounds:experiment.bounds,positions:experiment.positions}));
  if(!mobile)await writeFile(resolve(workspace,asset+'-vertices.json'),JSON.stringify(data.positions));
  delete data.positions;
  assert(data.ids.some(id=>['way/393025479','w393025479'].includes(id)),'Source identity lost');
  const samples=[];
  for(let i=0;i<16;i++){const v=await page.evaluate(i=>experiment.probe(0.4+i*0.018),i);if(i>=4)samples.push(v)}
  const sorted=samples.map(v=>v.completionMs).sort((a,b)=>a-b);
  const start=await page.evaluate(()=>experiment.frames());await page.waitForTimeout(700);
  const idle=(await page.evaluate(()=>experiment.frames()))-start;
  assert.equal(idle,0);assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
  const pick=await page.evaluate(()=>experiment.pick());assert(pick,'Object not picked');
  for(const [name,a] of [['front',0.4],['angled',2.0]]){await page.evaluate(a=>experiment.probe(a),a);await page.screenshot({path:resolve(workspace,'browser',`${mobile?'mobile':'desktop'}-${asset}-${name}.jpg`),type:'jpeg',quality:85})}
  const result={mobile,asset,...data,cameraMedianMs:sorted[Math.floor(sorted.length/2)],cameraP95Ms:sorted[Math.ceil(sorted.length*.95)-1],samples,idleFrames:idle,pickedId:pick,errors,remoteRequests:remote};
  report.cases.push(result);
  await page.evaluate(()=>experiment.dispose());await context.close();
 }
}catch(e){report.errors.push(String(e));throw e}
finally{await writeFile(resolve(workspace,'browser/result.json'),JSON.stringify(report,null,2)+'\n');await browser.close();await new Promise(r=>server.close(r))}
console.log(JSON.stringify({cases:report.cases.map(({mobile,asset,cameraMedianMs,cameraP95Ms,idleFrames,metadata})=>({mobile,asset,cameraMedianMs,cameraP95Ms,idleFrames,...metadata})),errors:report.errors},null,2));
