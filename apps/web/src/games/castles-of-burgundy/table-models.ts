import {CanvasTexture,ExtrudeGeometry,Group,Mesh,MeshMatcapMaterial,Shape,SRGBColorSpace} from 'three';
import {COLORS} from './data';
import {PALETTE} from './artwork';

export class BurgundyTableModels {
  private body:ExtrudeGeometry;
  private faces:MeshMatcapMaterial[]=[];
  private sides:MeshMatcapMaterial[]=[];
  private textures:CanvasTexture[]=[];
  constructor(){
    const shape=new Shape();for(let i=0;i<6;i++){const angle=Math.PI/2+i*Math.PI/3,x=Math.cos(angle)*.74,y=Math.sin(angle)*.74;if(i)shape.lineTo(x,y);else shape.moveTo(x,y);}shape.closePath();
    this.body=new ExtrudeGeometry(shape,{depth:.18,bevelEnabled:true,bevelSize:.035,bevelThickness:.035,bevelSegments:3,steps:1});this.body.translate(0,0,-.09);
    const positions=this.body.getAttribute('position'),uv=this.body.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setXY(i,.5+positions.getX(i)/1.6,.5+positions.getY(i)/1.6);
    for(const kind of COLORS){
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const ctx=canvas.getContext('2d')!;
      ctx.fillStyle=PALETTE[kind];ctx.fillRect(0,0,512,512);ctx.strokeStyle='#f1e3bd';ctx.fillStyle='#f1e3bd';ctx.lineWidth=9;ctx.lineCap='round';ctx.lineJoin='round';
      ctx.globalAlpha=.32;ctx.beginPath();for(let i=0;i<6;i++){const angle=-Math.PI/2+i*Math.PI/3,x=256+Math.cos(angle)*210,y=256+Math.sin(angle)*210;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();ctx.globalAlpha=.9;
      const path=new Path2D(kind==='castle'?'M150 355V190H195V150H235V190H275V150H315V190H360V355ZM230 355V280H280V355':kind==='ship'?'M135 320H375L335 375H175ZM255 140V320M235 165L155 290H235ZM280 185L350 290H280':kind==='mine'?'M135 365L215 190L265 275L310 160L390 365ZM205 365L255 300L305 365M190 150L335 280M250 135Q320 145 350 210':kind==='animal'?'M180 280L145 205L210 230Q255 205 300 230L365 205L330 280V340Q255 395 180 340ZM215 285H220M290 285H295M230 345H280':kind==='building'?'M140 235L255 150L370 235ZM160 235V365H350V235M210 365V285H300V365':'M140 200Q200 175 255 210Q310 175 370 200V340Q310 320 255 355Q200 320 140 340ZM255 210V355');ctx.stroke(path);
      const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;this.textures.push(texture);this.faces.push(new MeshMatcapMaterial({map:texture}));this.sides.push(new MeshMatcapMaterial({color:PALETTE[kind]}));
    }
  }
  create(index:number,scale:number){const group=new Group(),i=index%COLORS.length;group.scale.setScalar(scale);group.add(new Mesh(this.body,[this.faces[i],this.sides[i]]));return group;}
  dispose(){this.body.dispose();this.faces.forEach(m=>m.dispose());this.sides.forEach(m=>m.dispose());this.textures.forEach(t=>t.dispose());}
}
