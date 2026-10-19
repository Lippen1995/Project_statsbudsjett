import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const key=new URLSearchParams(location.search).get('asset')??'r1c';
const files={r1c:'skur-r1c.glb',indexed:'skur-indexed.glb',meshopt:'skur-meshopt.glb',osm:'skur-osm2world.glb'};
if(!Object.hasOwn(files,key))throw Error('Unknown experiment');
const started=performance.now(),errors=[];
window.addEventListener('error',e=>errors.push(e.message));
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
document.body.append(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#bfd0d2');
scene.add(new THREE.HemisphereLight('#e8f1f0','#776e5a',2));
const sun=new THREE.DirectionalLight('#fff1d9',2);sun.position.set(-30,50,20);scene.add(sun);
const camera=new THREE.PerspectiveCamera(45,innerWidth/innerHeight,0.1,500);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
const positions=[],resources={geometries:new Set(),textures:new Set(),materials:new Set()};
const loadStart=performance.now();
const bytes=await fetch('/assets/'+files[key]).then(r=>{if(!r.ok)throw Error('Missing artifact');return r.arrayBuffer()});
const fetched=performance.now();
const gltf=await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(bytes,'');
const parsed=performance.now();
gltf.scene.updateMatrixWorld(true);
const ids=[],arrays=new Set();let triangles=0,attributeBytes=0,indexBytes=0;
gltf.scene.traverse(o=>{
 if(o.userData.sourceId)ids.push(o.userData.sourceId);
 if(o.userData.osmId)ids.push(o.userData.osmId);
 if(!o.isMesh)return;
 const g=o.geometry;resources.geometries.add(g);
 const old=Array.isArray(o.material)?o.material:[o.material];old.forEach(m=>{for(const v of Object.values(m))if(v?.isTexture)resources.textures.add(v);m.dispose()});
 // A uniform cheap diagnostic shader isolates geometry; it is not a material-fidelity comparison.
 o.material=new THREE.MeshLambertMaterial({vertexColors:!!g.getAttribute('color'),side:THREE.DoubleSide});
 resources.materials.add(o.material);
 for(const a of Object.values(g.attributes))arrays.add(a.array??a.data.array);
 if(g.index)indexBytes+=g.index.array.byteLength;
 const p=g.getAttribute('position'),v=new THREE.Vector3();
 const count=g.index?.count??p.count;triangles+=count/3;
 for(let i=0;i<count;i++){v.fromBufferAttribute(p,g.index?g.index.getX(i):i).applyMatrix4(o.matrixWorld);positions.push(v.x,v.y,v.z)}
});
for(const array of arrays)attributeBytes+=array.byteLength;
const bounds=new THREE.Box3().setFromObject(gltf.scene),center=bounds.getCenter(new THREE.Vector3());
// Translation only, equal metre scale. This display centering is NOT georegistration.
gltf.scene.position.set(-center.x,-bounds.min.y,-center.z);
scene.add(gltf.scene);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(120,120),new THREE.MeshLambertMaterial({color:'#c0bba8'}));floor.rotation.x=-Math.PI/2;floor.position.y=-0.05;scene.add(floor);
let frames=0;
function render(){renderer.render(scene,camera);frames++}
controls.addEventListener('change',render);
function pose(angle=0){const a=angle+0.4,r=43;camera.position.set(Math.cos(a)*r,13,Math.sin(a)*r);controls.target.set(0,4,0);controls.update();render()}
pose();
const gl=renderer.getContext();gl.finish();
const ready=performance.now();
document.getElementById('label').textContent=({r1c:'R1C · source-anchored, inferred historical detail',indexed:'R1C · exact indexed geometry',meshopt:'R1C · quantized/compressed experiment',osm:'OSM2World · SCHEMATIC height & generic windows'})[key];
window.experiment={
 ready:true,ids,positions,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},
 metadata:{key,bytes:bytes.byteLength,triangles,attributeBytes,indexBytes,fetchMs:fetched-loadStart,parseMs:parsed-fetched,interactiveMs:ready-started,renderer:gl.getParameter(gl.RENDERER),geometryCount:resources.geometries.size,textureCount:resources.textures.size},
 frames:()=>frames,errors,
 async probe(angle){const start=performance.now();pose(angle);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));gl.finish();return{completionMs:performance.now()-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles}},
 pick(){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),camera);const hit=ray.intersectObject(gltf.scene,true)[0];if(!hit)return null;let o=hit.object;while(o&&!o.userData.sourceId&&!o.userData.osmId)o=o.parent;return o?.userData.sourceId??o?.userData.osmId??null},
 dispose(){controls.dispose();for(const g of resources.geometries)g.dispose();for(const m of resources.materials)m.dispose();for(const t of resources.textures){t.dispose();t.image?.close?.()}floor.geometry.dispose();floor.material.dispose();renderer.dispose();renderer.forceContextLoss()}
};
