import * as THREE from 'three';
const COLORS={White:0xf5f5f0,Blue:0x2b6fd6,Yellow:0xf2c200,Red:0xE03C31,Orange:0xe8641c,Black:0x222226,Pink:0xf2a0c0,Gray:0x9aa0a6};
export function colorOf(n){return COLORS[n]??0x9aa0a6;}
function holeCap(r){
  const m=new THREE.Mesh(new THREE.CircleGeometry(r,24),new THREE.MeshStandardMaterial({color:0x1c1e22,roughness:.9}));
  return m;
}
export function buildPart(part){
  const g=new THREE.Group();const sockets=[];const P=part.params.P||9.2;
  const mat=new THREE.MeshStandardMaterial({color:colorOf(part.color),roughness:.55,metalness:.05});
  if(part.kind==='straight'){
    const L=part.params.L,ax=part.params.axis;
    const len=L*P;
    g.add(new THREE.Mesh(new THREE.BoxGeometry(len,P,P),mat));
    for(let i=0;i<L;i++){
      const x=(i-(L-1)/2)*P;
      const r=P*0.34;
      const f=holeCap(r);f.position.set(x,0,P/2+0.1);g.add(f);
      const b=holeCap(r);b.position.set(x,0,-P/2-0.1);b.rotation.y=Math.PI;g.add(b);
      const ring=new THREE.Mesh(new THREE.TorusGeometry(r,P*0.06,8,24),new THREE.MeshStandardMaterial({color:0xd8d8d2}));
      ring.position.set(x,0,P/2+0.1);g.add(ring);
      sockets.push({pos:new THREE.Vector3(x,0,0),axis:'z',type:'hole'});
      if(ax==='d'){
        const t=holeCap(r);t.position.set(x,P/2+0.1,0);t.rotation.x=Math.PI/2;g.add(t);
        const u=holeCap(r);u.position.set(x,-P/2-0.1,0);u.rotation.x=-Math.PI/2;g.add(u);
        sockets.push({pos:new THREE.Vector3(x,0,0),axis:'y',type:'hole'});
      }
    }
  }else if(part.kind==='gear'){
    const R=part.params.diaP*P/2,t=6;
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(R,R,t,48),mat);
    disc.rotation.x=Math.PI/2;g.add(disc);
    const n=part.params.teeth;
    const tooth=new THREE.BoxGeometry(2.2,t*0.95,2.6);
    for(let i=0;i<n;i++){const a=i/n*Math.PI*2;const m=new THREE.Mesh(tooth,mat);
      m.position.set(Math.cos(a)*(R+1),0,Math.sin(a)*(R+1));m.rotation.y=-a;g.add(m);}
    const crossM=new THREE.MeshStandardMaterial({color:0x1c1e22});
    const c1=new THREE.Mesh(new THREE.BoxGeometry(7,7,t+1,crossM&&1),crossM);c1.rotation.x=0;g.add(c1);
    sockets.push({pos:new THREE.Vector3(0,0,0),axis:'z',type:'cross'});
    for(let i=0;i<(part.params.holes||0);i++){const a=i/(part.params.holes)*Math.PI*2;
      const hx=Math.cos(a)*R*0.55,hz=Math.sin(a)*R*0.55;
      const h=holeCap(P*0.28);h.position.set(hx,0,t/2+0.1);h.rotation.x=-Math.PI/2;g.add(h);
      sockets.push({pos:new THREE.Vector3(hx,0,0),axis:'z',type:'hole'});}
  }else if(part.kind==='connector'){
    const pinG=new THREE.CylinderGeometry(P*0.22,P*0.22,P*0.9,20);
    for(let i=0;i<2;i++){const m=new THREE.Mesh(pinG,mat);
      m.rotation.z=Math.PI/2;m.position.set((i-0.5)*P,0,0);g.add(m);
      sockets.push({pos:new THREE.Vector3((i-0.5)*P,0,0),axis:'x',type:'pin'});}
  }else{ // shaft
    const len=part.params.lenP*P;
    const cyl=new THREE.Mesh(new THREE.CylinderGeometry(P*0.25,P*0.25,len,20),mat);
    cyl.rotation.z=Math.PI/2;g.add(cyl);
    const fin=new THREE.Mesh(new THREE.BoxGeometry(len,P*0.18,P*0.5),mat);g.add(fin);
    sockets.push({pos:new THREE.Vector3(-len/2,0,0),axis:'x',type:'pin'});
    sockets.push({pos:new THREE.Vector3(len/2,0,0),axis:'x',type:'pin'});
    sockets.push({pos:new THREE.Vector3(0,0,0),axis:'x',type:'cross'});
  }
  g.traverse(o=>{if(o.isMesh){o.castShadow=false;}});
  g.userData.sockets=sockets;g.userData.part=part;
  return {group:g,sockets};
}
