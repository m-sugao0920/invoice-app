/* MS請求書システム 共通保存層 2026-08-28
   Windows の file:// 起動と GitHub Pages の両方で、複数HTMLから同じデータを参照するための IndexedDB 保存層。
   既存 localStorage は互換・自動移行用として残す。 */
(function(){
  'use strict';

  const DB_NAME = 'MSInvoiceSystemDB';
  const STORE_NAME = 'shared';
  const DB_VERSION = 1;
  const SHARED_KEYS = [
    'invoice_app_v3',
    'ms_invoice_client_master_v1',
    'ms_invoice_company_master_v1'
  ];

  function openDB(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const req=indexedDB.open(DB_NAME,DB_VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function idbGet(key){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=tx.objectStore(STORE_NAME).get(key);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error || new Error('IndexedDB get failed'));
      tx.oncomplete=()=>db.close();
    });
  }

  async function idbSet(key,value){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).put(value,key);
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{const e=tx.error || new Error('IndexedDB set failed');db.close();reject(e);};
      tx.onabort=()=>{const e=tx.error || new Error('IndexedDB set aborted');db.close();reject(e);};
    });
  }

  async function idbRemove(key){
    const db=await openDB();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite');
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete=()=>{db.close();resolve();};
      tx.onerror=()=>{const e=tx.error || new Error('IndexedDB remove failed');db.close();reject(e);};
    });
  }

  function localGet(key){
    try{return localStorage.getItem(key);}catch(e){return null;}
  }
  function localSet(key,value){
    try{localStorage.setItem(key,value);}catch(e){}
  }
  function localRemove(key){
    try{localStorage.removeItem(key);}catch(e){}
  }

  async function syncKey(key){
    try{
      const shared=await idbGet(key);
      if(shared !== undefined && shared !== null){
        localSet(key, typeof shared==='string' ? shared : JSON.stringify(shared));
        return {key,source:'indexeddb'};
      }
      const local=localGet(key);
      if(local !== null){
        await idbSet(key,local);
        return {key,source:'localStorage-migrated'};
      }
      return {key,source:'empty'};
    }catch(e){
      console.warn('MSInvoiceStorage sync failed:',key,e);
      return {key,source:'localStorage-fallback',error:e};
    }
  }

  const api={
    dbName:DB_NAME,
    keys:SHARED_KEYS.slice(),
    async get(key){
      try{
        const v=await idbGet(key);
        if(v !== undefined && v !== null) return typeof v==='string' ? v : JSON.stringify(v);
      }catch(e){}
      return localGet(key);
    },
    async set(key,value){
      const text=typeof value==='string' ? value : JSON.stringify(value);
      localSet(key,text);
      try{await idbSet(key,text);}catch(e){console.warn('MSInvoiceStorage save fallback:',key,e);}
      return text;
    },
    async remove(key){
      localRemove(key);
      try{await idbRemove(key);}catch(e){console.warn('MSInvoiceStorage remove fallback:',key,e);}
    },
    async sync(keys){
      const list=Array.isArray(keys)&&keys.length?keys:SHARED_KEYS;
      return Promise.all(list.map(syncKey));
    }
  };

  /* ===== 固定発注先（Aパターン専用） =====
     通常ユーザーは登録・編集・削除を行わない。
     初回起動時に自動登録し、既存データがある場合は内容を上書きせず固定フラグだけ補完する。 */
  const FIXED_CLIENT_ID = 'MS_FIXED_CLIENT_A';
  const FIXED_CLIENT_DEFAULT = {
    id: FIXED_CLIENT_ID,
    fixedClient: true,
    fixedRole: 'A_PATTERN_CLIENT',
    name: '鶴よし建設株式会社',
    zip: '',
    address: '',
    tel: '',
    closingDay: '末日',
    paymentTerms: '翌月末払い',
    retention: '5%',
    retentionMinAmount: 300000,
    adjustmentTiming: 'final',
    retentionIncludeIncrease: true,
    retentionIncludeReduction: true,
    safetyFee: '0.5%',
    printPattern: 'A',
    managers: []
  };

  function normalizeFixedName(v){
    return String(v||'').replace(/\s+/g,'').replace(/御中$/,'');
  }

  async function ensureFixedClient(){
    const key='ms_invoice_client_master_v1';
    let list=[];
    try{
      const raw=localGet(key);
      const parsed=JSON.parse(raw||'[]');
      list=Array.isArray(parsed)?parsed:[];
    }catch(e){ list=[]; }

    let i=list.findIndex(x=>String(x?.id||'')===FIXED_CLIENT_ID);
    if(i<0){
      const target=normalizeFixedName(FIXED_CLIENT_DEFAULT.name);
      i=list.findIndex(x=>normalizeFixedName(x?.name)===target);
    }

    if(i>=0){
      // すでにユーザーが登録済みの場合は、その内容を尊重して固定属性だけ付ける。
      list[i]={...list[i],id:FIXED_CLIENT_ID,fixedClient:true,fixedRole:'A_PATTERN_CLIENT'};
    }else{
      list.push({...FIXED_CLIENT_DEFAULT});
    }

    const text=JSON.stringify(list);
    localSet(key,text);
    try{ await idbSet(key,text); }catch(e){ console.warn('固定発注先の保存はlocalStorageで継続します:',e); }
    window.MSInvoiceFixedClient={
      id:FIXED_CLIENT_ID,
      defaults:{...FIXED_CLIENT_DEFAULT},
      isFixed(client){ return !!client && (client.fixedClient===true || String(client.id||'')===FIXED_CLIENT_ID); }
    };
    return list;
  }

  window.MSInvoiceStorage=api;
  api.ready=api.sync().then(async result=>{
    await ensureFixedClient();
    window.dispatchEvent(new CustomEvent('msinvoice-storage-ready',{detail:result}));
    return result;
  });
})();
