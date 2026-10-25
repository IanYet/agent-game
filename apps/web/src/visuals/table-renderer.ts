import {NeutralToneMapping,OrthographicCamera,WebGLRenderer} from 'three';

export const TABLE_VIEW_HEIGHT=11;

export function createTableCamera(){
  const camera=new OrthographicCamera(-10,10,TABLE_VIEW_HEIGHT/2,-TABLE_VIEW_HEIGHT/2,.1,60);
  camera.position.z=18;
  return camera;
}

export function createTableRenderer(canvas:HTMLCanvasElement){
  // Retain the displayed GPU buffer for the lens's small, cropped sample.
  const renderer=new WebGLRenderer({canvas,alpha:false,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setClearColor('#090b11',1);
  renderer.toneMapping=NeutralToneMapping;
  renderer.shadowMap.enabled=true;
  return renderer;
}

export function resizeTableRenderer(renderer:WebGLRenderer,camera:OrthographicCamera,width:number,height:number,pixelBudget:number){
  const viewWidth=TABLE_VIEW_HEIGHT*width/Math.max(1,height);
  camera.left=-viewWidth/2;camera.right=viewWidth/2;camera.updateProjectionMatrix();
  const ratio=Math.min(devicePixelRatio||1,1.25,Math.sqrt(pixelBudget/Math.max(1,width*height)));
  renderer.setPixelRatio(ratio);renderer.setSize(Math.max(1,width),Math.max(1,height),false);
  return viewWidth;
}
