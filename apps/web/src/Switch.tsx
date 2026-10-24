export function Switch({label,checked,onChange,disabled=false,title,className=''}:{label:string;checked:boolean;onChange:(checked:boolean)=>void;disabled?:boolean;title?:string;className?:string}){
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} title={title} className={`ui-switch ${className}`} onClick={()=>onChange(!checked)}>
    <span>{label}</span><i aria-hidden="true"><span/></i><small>{checked?'开':'关'}</small>
  </button>;
}
