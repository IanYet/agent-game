import {RESOURCES,type Board,type Edge,type Hex,type Resource,type Vertex} from './types';

export function shuffle<T>(items:readonly T[],random:()=>number):T[]{
  const result=items.slice();
  for(let i=result.length-1;i>0;i--){const n=random();if(!Number.isFinite(n)||n<0||n>=1)throw Error('随机源必须返回 0（含）到 1（不含）之间的数');const j=Math.floor(n*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
}
const CORNERS=[[1,1],[0,2],[-1,1],[-1,-1],[0,-2],[1,-1]];
const DIRECTIONS=[[-1,0],[-1,1],[0,1],[1,0],[1,-1],[0,-1]];
export const NUMBER_SEQUENCE=[5,2,6,3,8,10,9,12,11,4,8,10,9,4,5,6,3,11];
function rotate(q:number,r:number,times:number):[number,number]{for(let i=0;i<times;i++)[q,r]=[-r,q+r];return [q,r];}

export function createBoard(random:()=>number):Board {
  const terrain=shuffle([...RESOURCES.flatMap(r=>Array<Resource>(r==='ore'||r==='brick'?3:4).fill(r)),'desert' as const],random);
  const hexes:Hex[]=[];const points=new Map<string,{x:number;y:number;hexes:string[]}>();
  for(let r=-2;r<=2;r++)for(let q=Math.max(-2,-r-2);q<=Math.min(2,-r+2);q++){
    const id=`h${hexes.length}`,vertices=CORNERS.map(([dx,dy])=>`${2*q+r+dx},${3*r+dy}`);
    vertices.forEach(key=>{const [x,y]=key.split(',').map(Number);const v=points.get(key)??{x,y,hexes:[]};v.hexes.push(id);points.set(key,v);});
    hexes.push({id,q,r,resource:terrain[hexes.length],number:null,letter:null,vertices,edges:[]});
  }
  const ordered=[...points.entries()].sort((a,b)=>a[1].y-b[1].y||a[1].x-b[1].x);
  const pointIds=new Map(ordered.map(([key],i)=>[key,`v${i}`]));
  const vertices:Vertex[]=ordered.map(([key,v])=>({id:pointIds.get(key)!,x:v.x*Math.sqrt(3)/2,y:v.y/2,hexes:v.hexes,edges:[],neighbors:[]}));
  const edgeMap=new Map<string,Edge>(),edges:Edge[]=[];
  for(const hex of hexes){
    hex.vertices=hex.vertices.map(key=>pointIds.get(key)!);
    for(let i=0;i<6;i++){
      const ends=[hex.vertices[i],hex.vertices[(i+1)%6]].sort((a,b)=>Number(a.slice(1))-Number(b.slice(1))) as [string,string],key=ends.join(':');
      let edge=edgeMap.get(key);if(!edge){edge={id:`e${edges.length}`,vertices:ends,hexes:[]};edges.push(edge);edgeMap.set(key,edge);
        for(const id of ends){const vertex=vertices.find(v=>v.id===id)!;vertex.edges.push(edge.id);vertex.neighbors.push(ends.find(x=>x!==id)!);}}
      edge.hexes.push(hex.id);hex.edges.push(edge.id);
    }
  }
  // The A–R discs spiral anticlockwise from a random corner, skipping the desert.
  const rotation=Math.floor(random()*6),spiral:[number,number][]=[];
  for(const radius of [2,1]){let q=radius,r=-radius;for(const [dq,dr] of DIRECTIONS)for(let i=0;i<radius;i++){spiral.push(rotate(q,r,rotation));q+=dq;r+=dr;}}
  spiral.push([0,0]);let token=0;
  for(const [q,r] of spiral){const hex=hexes.find(h=>h.q===q&&h.r===r)!;if(hex.resource==='desert')continue;hex.number=NUMBER_SEQUENCE[token];hex.letter=String.fromCharCode(65+token++);}
  const midpoint=(edge:Edge)=>{const a=vertices.find(v=>v.id===edge.vertices[0])!,b=vertices.find(v=>v.id===edge.vertices[1])!;return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
  const coast=edges.filter(e=>e.hexes.length===1).sort((a,b)=>{const x=midpoint(a),y=midpoint(b);return Math.atan2(x.y,x.x)-Math.atan2(y.y,y.x);});
  // Six shuffled sea-frame sections. The double-port sections leave one empty edge between ports.
  const frames=shuffle<('any'|Resource)[]>([['any','wool'],['any'],['any','brick'],['wood'],['any','wheat'],['ore']],random);
  const ports=frames.flatMap((frame,side)=>frame.map((resource,i)=>{const edge=coast[side*5+(frame.length===2?i*3:1)];return {edge:edge.id,resource,vertices:edge.vertices};}));
  return {hexes,vertices,edges,ports};
}
