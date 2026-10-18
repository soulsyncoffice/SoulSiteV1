const socket = io('http://localhost:3000');
let profileId = localStorage.getItem('profileId');

async function createProfile() {
  const orb = { color:'#7f5', seed: Math.random() };
  const tags = ['music','books'];
  const res = await fetch('http://localhost:3000/api/profile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orb,tags})});
  const data = await res.json();
  profileId = data.id;
  localStorage.setItem('profileId', profileId);
  socket.emit('identify', profileId);
}

if (!profileId) createProfile(); else socket.emit('identify', profileId);

socket.on('match', (m)=>{
  alert('It\'s a match with ' + m.with);
});

// Three.js simple orb
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({canvas});
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.z = 5;
const geom = new THREE.SphereGeometry(1.2, 32, 32);
const mat = new THREE.MeshStandardMaterial({color:0x7f5, roughness:0.6, metalness:0.1});
const orb = new THREE.Mesh(geom, mat);
scene.add(orb);
const light = new THREE.DirectionalLight(0xffffff,1);
light.position.set(5,5,5);
scene.add(light);
function resize(){
  renderer.setSize(window.innerWidth, window.innerHeight*0.6);
  camera.aspect = window.innerWidth / (window.innerHeight*0.6);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
function animate(){ requestAnimationFrame(animate); orb.rotation.y += 0.005; renderer.render(scene,camera);} animate();

// Simple matching flow: pick a random existing profile
async function pickCandidate(){
  const res = await fetch('http://localhost:3000/api/candidates');
  const list = await res.json();
  return list[0];
}

document.getElementById('yes').addEventListener('click', async ()=>{
  const cand = await pickCandidate();
  if (!cand) return alert('No candidates yet');
  await fetch('http://localhost:3000/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voter_id:profileId,target_id:cand.id,vote:true})});
  alert('Vote sent');
});

document.getElementById('no').addEventListener('click', async ()=>{
  const cand = await pickCandidate();
  if (!cand) return alert('No candidates yet');
  await fetch('http://localhost:3000/api/vote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({voter_id:profileId,target_id:cand.id,vote:false})});
});
