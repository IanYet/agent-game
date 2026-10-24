import SideRays from './vendor/SideRays';
import {useEffectsPreference} from './preferences';

export function GameBackground({enabled}:{enabled:boolean}){
  const effects=useEffectsPreference();
  return <div className="game-background" aria-hidden="true">
    {!effects.static&&<SideRays rayColor1="#e7b7a2" rayColor2="#aebbd5" origin="top-right" speed={.65} intensity={2.2} spread={3.2} density={7} falloff={1.05} glow={.65} dust={.12} mouseInfluence={.18} maxDevicePixelRatio={1.5} paused={!enabled} reducedMotion={effects.reduced}/>}
  </div>;
}
