import {GameController} from './controller';
import {ConnectorClient} from './connector';
// Keep the runtime independent of React's component refresh lifecycle.
export const controller=new GameController(localStorage,new ConnectorClient(import.meta.env.VITE_CONNECTOR_URL??undefined));
if(import.meta.hot)import.meta.hot.dispose(()=>{void controller.disconnect();});
