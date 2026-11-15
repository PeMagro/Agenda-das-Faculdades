' Abre a Agenda das Faculdades sem deixar uma janela de terminal aberta.
' Clique com o botao direito neste arquivo > Enviar para > Area de trabalho (criar atalho).
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = pasta
shell.Run """" & pasta & "\node_modules\.bin\electron.cmd"" .", 0, False
