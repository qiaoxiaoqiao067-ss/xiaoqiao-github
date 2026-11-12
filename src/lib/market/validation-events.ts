const eventName='workbench:validation-changed'
export function notifyValidationChanges(){
 window.dispatchEvent(new Event(eventName))
 try {const channel=new BroadcastChannel(eventName);channel.postMessage('changed');channel.close()}catch{/* Same-tab refresh still works. */}
}
export function watchValidationChanges(refresh:()=>void){
 window.addEventListener(eventName,refresh)
 let channel:BroadcastChannel|undefined
 try {channel=new BroadcastChannel(eventName);channel.onmessage=refresh}catch{/* Older browsers use focus refresh. */}
 return ()=>{window.removeEventListener(eventName,refresh);channel?.close()}
}
