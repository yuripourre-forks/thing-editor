
type ThingEditorServer = {
	fs:(comand: 'fs/saveFile' | 'fs/readFile', filename: string, content?:string) => Uint8Array | undefined,
	versions: {[key:string]:()=>string}
}

interface Window {
	thingEditorServer: ThingEditorServer
}
