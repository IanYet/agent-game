import {createContext,useContext,useState} from 'react';

export interface ConversationExpansionCommand {expanded:boolean|undefined}
export const ConversationExpansion=createContext<ConversationExpansionCommand>({expanded:undefined});

// A new command applies even when the same button is pressed again. Each
// section can still be toggled independently after the command is applied.
export function useConversationExpansion(initial:boolean){
  const command=useContext(ConversationExpansion);
  const [local,setLocal]=useState(()=>({command,expanded:command.expanded??initial}));
  const expanded=local.command===command?local.expanded:command.expanded??initial;
  const change=(value:boolean)=>setLocal({command,expanded:value});
  return [expanded,change] as const;
}
