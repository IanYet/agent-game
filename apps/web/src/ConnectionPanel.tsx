import {useState} from 'react';
import {ArrowUpRight,Check,Download,Link2,Loader2,RefreshCw,Unplug} from 'lucide-react';
import type {AppSnapshot} from './runtime/types';
import {Modal} from './Modal';
import {ConnectorInstallHelp} from './ConnectorInstallHelp';
import {Dot,PrimaryButton} from './UiBits';
import {version as connectorVersion} from '../../connector/version.json';

const releaseUrl=`${import.meta.env.VITE_CONNECTOR_RELEASES_URL??'https://github.com/IanYet/agent-game/releases'}/tag/v${connectorVersion}`;
const downloads=[
  [`同桌连接器 v${connectorVersion} · Windows 64 位`,import.meta.env.VITE_CONNECTOR_DOWNLOAD_URL??releaseUrl,'EXE / x64'],
  [`同桌连接器 v${connectorVersion} · macOS Apple Silicon`,import.meta.env.VITE_CONNECTOR_MACOS_ARM64_DOWNLOAD_URL??releaseUrl,'ZIP / arm64'],
  [`同桌连接器 v${connectorVersion} · macOS Intel`,import.meta.env.VITE_CONNECTOR_MACOS_X64_DOWNLOAD_URL??releaseUrl,'ZIP / x64'],
];
export function ConnectorDownloads(){return <div className="connector-downloads">{downloads.map(([label,url,detail])=><a key={label} href={url} className="download-link"><Download size={15}/><span>{label}<small>{detail}</small></span><ArrowUpRight size={15}/></a>)}</div>;}
export function ConnectionPanel({state,onClose,onConnect,onDisconnect,onContinue,selection,symbol}:{state:AppSnapshot;onClose:()=>void;onConnect:()=>Promise<void>;onDisconnect:()=>Promise<void>;onContinue?:()=>void;selection?:string;symbol?:string}){
  const [pending,setPending]=useState(false),[error,setError]=useState('');
  const connect=async()=>{setPending(true);setError('');try{await onConnect();}catch(e){setError((e as Error).message);}finally{setPending(false);}};
  const available=state.connector?.harnesses.filter(h=>h.available).length??0;
  return <Modal wide symbol={symbol} title={state.connected?'搭档已连接。':'让你的 Agent 入座。'} subtitle={selection?`已选 ${selection}`:'本地连接 / CONNECTION'} onClose={onClose} footer={<><div className="footer-reason" role="status">{error|| (state.connectorUpdateRequired?'连接器版本不兼容，请退出旧版并下载更新。':pending?'正在检测本机程序与模型目录…':state.connected?available?'连接成功。请手动继续；当前桌保持原运行状态。':'连接成功，但没有就绪的程序。请安装、登录后重新检测。':'先启动本机连接器，再建立连接。') }</div><div className="footer-actions">{state.connected?<><button className="text-button" disabled={pending} onClick={async()=>{setPending(true);try{await onDisconnect();}catch(e){setError((e as Error).message);}finally{setPending(false);}}}><Unplug size={14}/>断开</button><PrimaryButton onClick={onContinue??onClose} disabled={!!onContinue&&!available}>{onContinue?'继续':'完成'}<ArrowUpRight size={20}/></PrimaryButton></>:<PrimaryButton disabled={pending||state.connectorUpdateRequired} onClick={connect}>{pending?<Loader2 size={15} className="spin"/>:<Link2 size={15}/>}连接本机<ArrowUpRight size={20}/></PrimaryButton>}{state.connectorUpdateRequired&&<button className="button outline" onClick={connect} disabled={pending}>更新后重试</button>}</div></>}>
    {state.connected?<><div className="connected-heading"><Dot/><span>127.0.0.1:{state.connector?.port??3211}</span><small>连接器 v{state.connector?.version}</small></div><div className="harness-results">{state.connector?.harnesses.map(h=><section key={h.id}><div><span>{h.available?<Check size={15}/>:<span>—</span>}</span><h3>{h.name}</h3><small>{h.available?'已就绪':'未就绪'}</small></div><p>{h.detail}</p><small>{h.version??'未检测到版本'} · {h.models?.length??0} 个独立模型</small></section>)}</div><button className="text-button" onClick={connect} disabled={pending}><RefreshCw size={13}/>重新检测程序与目录</button><p className="quiet-note">每位 Agent 使用自己所选程序的模型目录、登录与独立会话。连接不会开始游戏或恢复推理。</p></>:<><ol className="connection-steps"><li><b>01</b><div><h3>启动同桌连接器</h3><p>Windows 双击启动；macOS 解压后将应用移到「应用程序」。连接器在托盘或菜单栏运行。</p><ConnectorDownloads/><ConnectorInstallHelp/></div></li><li><b>02</b><div><h3>登录你自己的 Agent 程序</h3><p>Codex 使用本机 ChatGPT 登录；dsh 和 WorkBuddy 使用各自已有的登录和模型配置。</p></div></li><li><b>03</b><div><h3>建立本机连接</h3><p>浏览器提示本地网络访问时选择允许。检测结果会显示在这里，由你决定何时继续。</p></div></li></ol><p className="quiet-note">登录凭据留在本机。游戏状态与最近 20 条已完成记录保存在当前浏览器。</p></>}
  </Modal>;
}
