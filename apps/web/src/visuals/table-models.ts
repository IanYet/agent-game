import {
  Box3, BufferGeometry, CanvasTexture, CircleGeometry, ExtrudeGeometry,
  Group, LatheGeometry, Mesh, MeshMatcapMaterial,
  RepeatWrapping, Shape, SRGBColorSpace, Vector2, Vector3,type Light,
} from 'three';
import {Box,Vec3} from 'cannon-es';
import {ChessTableModels} from '../games/chess/table-models';
import {AzulTableModels} from '../games/azul/table-models';
import {SplendorTableModels} from '../games/splendor/table-models';
import {CatanTableModels} from '../games/catan/table-models';
import {BurgundyTableModels} from '../games/castles-of-burgundy/table-models';
import {PuertoRicoTableModels} from '../games/puerto-rico/table-models';
import {PlainChipModels} from './plain-chip-models';
import type {TableSurfaces} from './table-surfaces';
import {POKER_CHIP_COLORS,CARD_SUIT_COLORS,CITADELS_CHIP_COLORS} from './table-palette';

export type TableTheme='holdem'|'doudizhu'|'chess'|'azul'|'citadels'|'splendor'|'catan'|'castles-of-burgundy'|'puerto-rico';
interface GameModelSet {create:(index:number,scale:number)=>Group;dispose:()=>void;lights?:readonly Light[];pixelBudget?:number}

// The same suit outlines supply the floating models and chip artwork.
function suitShape(index:number){
  const s=new Shape();
  if(index===0){
    s.moveTo(0,.95);s.bezierCurveTo(-.24,.58,-.85,.16,-.85,-.22);
    s.bezierCurveTo(-.85,-.72,-.28,-.73,-.11,-.34);
    s.bezierCurveTo(-.10,-.56,-.21,-.74,-.37,-.86);s.lineTo(.37,-.86);
    s.bezierCurveTo(.21,-.74,.10,-.56,.11,-.34);
    s.bezierCurveTo(.28,-.73,.85,-.72,.85,-.22);
    s.bezierCurveTo(.85,.16,.24,.58,0,.95);
  }else if(index===1){
    s.moveTo(0,-.82);s.bezierCurveTo(-.13,-.62,-.85,-.12,-.85,.36);
    s.bezierCurveTo(-.85,.95,-.22,1.04,0,.52);
    s.bezierCurveTo(.22,1.04,.85,.95,.85,.36);
    s.bezierCurveTo(.85,-.12,.13,-.62,0,-.82);
  }else if(index===2){
    s.moveTo(0,.94);s.lineTo(.71,0);s.lineTo(0,-.94);s.lineTo(-.71,0);
  }else{
    s.moveTo(0,.91);s.bezierCurveTo(.47,.91,.61,.36,.29,.12);
    s.bezierCurveTo(.73,.37,1.02,-.04,.79,-.42);
    s.bezierCurveTo(.62,-.69,.26,-.63,.11,-.36);
    s.bezierCurveTo(.10,-.57,.23,-.75,.38,-.87);s.lineTo(-.38,-.87);
    s.bezierCurveTo(-.23,-.75,-.10,-.57,-.11,-.36);
    s.bezierCurveTo(-.26,-.63,-.62,-.69,-.79,-.42);
    s.bezierCurveTo(-1.02,-.04,-.73,.37,-.29,.12);
    s.bezierCurveTo(-.61,.36,-.47,.91,0,.91);
  }
  s.closePath();return s;
}

const chipColors=POKER_CHIP_COLORS,suitColors=CARD_SUIT_COLORS;
const chipIvory=chipColors[2],chipInk='#382f36',chipMark='#f2e8d7';

export class TableModels{
  private gameModels?:GameModelSet;
  private geometries:BufferGeometry[]=[];
  private materials:MeshMatcapMaterial[]=[];
  private textures:CanvasTexture[]=[];
  private outlines=[0,1,2,3].map(suitShape);
  private suits:ExtrudeGeometry[]=[];
  private chips:LatheGeometry[]=[];
  private faces:MeshMatcapMaterial[]=[];
  private chipBodies:MeshMatcapMaterial[]=[];
  private suitMaterials:MeshMatcapMaterial[]=[];
  private disc!:CircleGeometry;

  constructor(private theme:TableTheme,private surfaces:TableSurfaces){
    if(theme==='chess'){this.gameModels=new ChessTableModels();return;}
    if(theme==='splendor'){this.gameModels=new SplendorTableModels();return;}
    if(theme==='azul'){this.gameModels=new AzulTableModels();return;}
    if(theme==='catan'){this.gameModels=new CatanTableModels();return;}
    if(theme==='castles-of-burgundy'){this.gameModels=new BurgundyTableModels();return;}
    if(theme==='puerto-rico'){this.gameModels=new PuertoRicoTableModels();return;}
    if(theme==='citadels'){this.gameModels=new PlainChipModels(CITADELS_CHIP_COLORS);return;}
    if(theme!=='holdem'&&theme!=='doudizhu')throw new Error(`未注册的牌桌物件主题：${theme}`);
    this.disc=new CircleGeometry(.704,64);this.geometries.push(this.disc);
    if(theme==='doudizhu')this.suitMaterials=suitColors.map(color=>this.material({color}));
    if(theme==='holdem')chipColors.forEach((hex,index)=>{
      const profile=[[0,-.15],[.66,-.15],[.724,-.135],[.75,-.105],[.75,.105],[.724,.135],[.66,.15],[0,.15]];
      const geometry=new LatheGeometry(profile.map(([x,y])=>new Vector2(x,y)),96);
      this.chips.push(geometry);this.geometries.push(geometry);
      const side=this.chipSideTexture(hex);this.textures.push(side);
      this.chipBodies.push(this.material({map:side}));
      const face=this.chipTexture(hex,index);this.textures.push(face);
      this.faces.push(this.material({map:face}));
    });
    else this.outlines.forEach(shape=>{
      const geometry=new ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelThickness:.065,bevelSize:.065,bevelSegments:3,steps:1,curveSegments:10});
      geometry.computeBoundingBox();const center=geometry.boundingBox!.getCenter(new Vector3());
      geometry.translate(-center.x,-center.y,-center.z);
      this.suits.push(geometry);this.geometries.push(geometry);
    });
  }

  private material(options:ConstructorParameters<typeof MeshMatcapMaterial>[0]){
    const m=new MeshMatcapMaterial(options);this.materials.push(m);return m;
  }

  private chipSideTexture(color:string){
    const canvas=document.createElement('canvas');canvas.width=2048;canvas.height=256;
    const ctx=canvas.getContext('2d')!;
    ctx.fillStyle=color;ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle=color===chipIvory?chipInk:chipMark;
    // Lathe UVs follow the eight profile rings; markings cover the curved outer band.
    const top=Math.round(canvas.height*2/7),bottom=Math.round(canvas.height*5/7);
    for(let i=0;i<12;i++){
      const left=Math.round(i*canvas.width/12),right=Math.round((i+.28)*canvas.width/12);
      ctx.fillRect(left,top,right-left,bottom-top);
    }
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.wrapS=RepeatWrapping;texture.anisotropy=8;return texture;
  }

  private chipTexture(color:string,index:number){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    const ctx=canvas.getContext('2d')!,ink=color===chipIvory?chipInk:chipMark;
    ctx.fillStyle=color;ctx.fillRect(0,0,512,512);
    ctx.fillStyle='#10141b12';ctx.beginPath();ctx.arc(256,256,202,0,Math.PI*2);ctx.fill();
    for(const [radius,alpha] of [[230,.48],[217,.14],[199,.28],[182,.08]] as const){
      ctx.strokeStyle=ink;ctx.globalAlpha=alpha;ctx.lineWidth=radius===230?4:2;
      ctx.beginPath();ctx.arc(256,256,radius,0,Math.PI*2);ctx.stroke();
    }
    ctx.globalAlpha=1;
    const pip=(suit:number,x:number,y:number,size:number)=>{
      ctx.save();ctx.translate(x,y);ctx.scale(size,-size);
      ctx.beginPath();this.outlines[suit].getPoints(20).forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
      ctx.closePath();ctx.fillStyle=ink;ctx.fill();ctx.restore();
    };
    pip(index%4,256,256,115);
    [0,1,2,3].forEach(suit=>{const angle=suit*Math.PI/2-Math.PI/2;pip(suit,256+Math.cos(angle)*164,256+Math.sin(angle)*164,23);});
    const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=8;return texture;
  }

  create(index:number,scale:number){
    const mesh=this.createModel(index,scale);this.surfaces.apply(mesh,index);
    // Models are still at the body origin here. Include every child transform,
    // bevel and protrusion, then leave a little room for the contact solver.
    const bounds=new Box3().setFromObject(mesh).expandByScalar(.04*scale);
    const center=bounds.getCenter(new Vector3()),half=bounds.getSize(new Vector3()).multiplyScalar(.5);
    const shape=new Box(new Vec3(half.x,half.y,half.z));
    // Opposite edges describe the same separation direction.
    shape.convexPolyhedronRepresentation.uniqueEdges=[new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,0,1)];
    return {mesh,collider:{shape,offset:new Vec3(center.x,center.y,center.z)},radius:center.length()+half.length()};
  }

  get lights(){return this.gameModels?.lights??[];}
  get pixelBudget(){return this.gameModels?.pixelBudget??1.25e6;}

  private createModel(index:number,scale:number):Group{
    if(this.gameModels)return this.gameModels.create(index,scale);
    const mesh=new Group();mesh.scale.setScalar(scale);
    if(this.theme==='holdem'){
      const color=index%chipColors.length;
      mesh.add(new Mesh(this.chips[color],this.chipBodies[color]));
      for(const side of [-1,1]){
        const face=new Mesh(this.disc,this.faces[color]);face.position.y=side*.151;face.rotation.x=-side*Math.PI/2;mesh.add(face);
      }
      return mesh;
    }
    const suit=index%4;mesh.add(new Mesh(this.suits[suit],this.suitMaterials[index%this.suitMaterials.length]));
    return mesh;
  }

  dispose(){this.gameModels?.dispose();this.geometries.forEach(g=>g.dispose());this.materials.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
