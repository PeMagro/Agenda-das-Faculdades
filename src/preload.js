const { contextBridge, ipcRenderer } = require('electron');

async function invocar(canal, ...args) {
  const resposta = await ipcRenderer.invoke(canal, ...args);
  if (!resposta.ok) throw new Error(resposta.erro);
  return resposta.dados;
}

contextBridge.exposeInMainWorld('api', {
  banco: (metodo, args) => invocar('banco', metodo, args),
  info: () => ipcRenderer.invoke('app:info'),
  abrirPastaBanco: () => ipcRenderer.invoke('app:abrirPastaBanco'),
  claudeStatus: () => ipcRenderer.invoke('claude:status'),
  claudeEnviar: (args) => invocar('claude:enviar', args),
});
