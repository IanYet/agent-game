import {GameController} from './controller';
// Keep the runtime independent of React's component refresh lifecycle.
export const controller=new GameController(localStorage);
if(import.meta.hot)import.meta.hot.dispose(()=>{void controller.disconnect();});
