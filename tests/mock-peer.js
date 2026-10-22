(function(){
class EE{constructor(){this.h={}}on(e,f){(this.h[e]=this.h[e]||[]).push(f);return this}emit(e,...a){(this.h[e]||[]).slice().forEach(f=>f(...a))}}
class MockConn extends EE{constructor(id){super();this.peer=id;this.open=false;this.closed=false;this.sent=[]}
  send(d){if(!this.open)throw new Error('not open');this.sent.push(d)}
  close(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close')}}
window.__peers=[];window.__uncaughtTimer=[];
window.Peer=class extends EE{
  constructor(id,opts){super();if(typeof id==='object'){opts=id;id=undefined}this.reqId=id||('obs-'+Math.random().toString(36).slice(2,7));this._open=false;this._disconnected=false;this._destroyed=false;this.conns=[];this.incomingList=[];window.__peers.push(this)}
  get open(){return this._open}get disconnected(){return this._disconnected}get destroyed(){return this._destroyed}get id(){return this.reqId}
  serverOpen(){this._open=true;this.emit('open',this.reqId)}
  connect(id){if(this._disconnected){this.emit('error',{type:'disconnected'});return undefined}const c=new MockConn(id);this.conns.push(c);return c}
  disconnect(){if(this._disconnected)return;this._disconnected=true;this._open=false;this.emit('disconnected',this.reqId)}
  destroy(){if(this._destroyed)return;this.conns.forEach(c=>c.close());this.incomingList.forEach(c=>c.close());this.disconnect();this._destroyed=true;this.emit('close')}
  reconnect(){if(this._disconnected&&!this._destroyed){this._disconnected=false}else if(this._destroyed)throw new Error('destroyed')}
  socketDrop(){this.emit('error',{type:'network'});this.disconnect()}
  incoming(){const c=new MockConn('obs');this.incomingList.push(c);this.emit('connection',c);return c}
};
window.__MockConn=MockConn;
})();
