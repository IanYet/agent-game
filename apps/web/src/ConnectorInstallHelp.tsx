export function ConnectorInstallHelp() {
  return <details>
    <summary>macOS 首次启动与安全提示</summary>
    <p>需要 macOS 13.5 或更新版本。M 系列芯片选择 Apple Silicon，Intel 芯片选择 Intel。解压 ZIP，先阅读根目录的「请先阅读.txt」，将「同桌连接器.app」拖入「应用程序」，再双击打开。</p>
    <p>当前包只有 ad-hoc 本地签名，没有 Developer ID 身份签名，也未经过 Apple 公证；ad-hoc 不代表 Apple 已审核或认证。</p>
    <p>1. 先尝试打开一次，阅读并关闭系统提示。</p>
    <p>2. 确认下载来源可信、文件未被篡改后，打开「系统设置」→「隐私与安全性」，向下滚动到安全性区域，针对「同桌连接器」点击「仍要打开」。按系统要求验证身份。</p>
    <p>3. 再次出现提示时，确认仍信任这一个应用，再点击「打开」。</p>
    <p>受管理的 Mac 可能限制放行。若提示恶意软件、将损坏电脑、授权撤销或应用已损坏，请停止打开并核对下载或联系维护者；这些不是普通的身份提示。无需全局关闭 Gatekeeper 或删除隔离属性。<a href="https://support.apple.com/zh-cn/102445" target="_blank" rel="noreferrer">Apple 官方说明</a>。</p>
    <p>两端启动后均有完整窗口。关闭窗口会继续在托盘／菜单栏运行，可从图标恢复；「退出连接器」会停止本次连接器启动的 Agent 会话并释放端口。端口被占用时，在连接器窗口中打开「端口与进程」重新检测，先确认占用者，再选择正常退出或逐项清理。</p>
  </details>;
}
