/* MS請求書システム 基礎整理版 2026-08-27 */
/* MS請求書作成システム 共通JS */

  
/* Password gate removed in split no-password version. */




  // ====== Input helpers ======
  function formatCommaInput(el){
    const raw = el.value.replace(/,/g,'');
    if(raw === '' || isNaN(raw)) return;
    el.value = Number(raw).toLocaleString('ja-JP');
  }
  function getNumber(el){
    return Number((el.value||'').replace(/,/g,'') || 0);
  }

  // ====== Storage ======
  const KEY = "invoice_app_v3";
  const state = {
    settings: {
      myName:"エムエス・ランドスケープ",
      myAddr:"静岡県伊豆の国市田京1021-5",
      myTel:"055-999-9999",
      mySigner:"菅尾基弘", // 代表者
      registrationNo:"",
      useStamp:true,
      taxRate:10,
      bankText:"【振込先】 静岡銀行　三島支店　普通　9999999　菅尾基弘",
      clientName:"鶴よし建設株式会社 御中"
    },
    sites: [],
    monthly: {}
  };

  function saveAll(){
    const raw = JSON.stringify(state);
    try{ localStorage.setItem(KEY, raw); }catch(e){}
    try{ if(window.MSInvoiceStorage) window.MSInvoiceStorage.set(KEY, raw); }catch(e){ console.warn("共通DB保存:",e); }
  }
  function loadAll(silent=false){
    const raw = localStorage.getItem(KEY);
    if(!raw){ if(!silent) alert("保存データがありません"); return; }
    try{
      const obj = JSON.parse(raw);
      Object.assign(state.settings, obj.settings || {});
      state.sites = Array.isArray(obj.sites) ? obj.sites : [];
      state.monthly = obj.monthly || {};
      try{ if(typeof syncSettingsToForm==="function" && document.getElementById("s_myName")) syncSettingsToForm(); }catch(e){}
      try{ if(typeof refreshSiteTable==="function") refreshSiteTable(); }catch(e){}
      try{ if(typeof refreshSiteSelects==="function") refreshSiteSelects(); }catch(e){}
      try{ if(typeof refreshMonthlyTable==="function") refreshMonthlyTable(); }catch(e){}
      try{ if(typeof refreshSiteSummaryAndHistory==="function") refreshSiteSummaryAndHistory(); }catch(e){}
      if(!silent) alert("読み込みました");
    }catch(e){
      if(!silent) alert("読み込みに失敗しました");
    }
  }
  function clearAll(){
    if(!confirm("全データを削除します。よろしいですか？")) return;
    try{ localStorage.removeItem(KEY); }catch(e){}
    try{
      if(window.MSInvoiceStorage){
        window.MSInvoiceStorage.remove(KEY).finally(()=>location.reload());
        return;
      }
    }catch(e){}
    location.reload();
  }

  // ====== Utils ======
  function uid(){ return "S" + Math.random().toString(36).slice(2,9); }
  function round(n){ return Math.round(Number(n||0)); }
  function yen(n){ return round(n).toLocaleString("ja-JP"); }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }
  function monthListSorted(){ return Object.keys(state.monthly).sort(); }
  function getRec(month, siteId){ return (state.monthly[month] && state.monthly[month][siteId]) || null; }
  function sumBeforeMonth(siteId, month){
    let sum = 0;
    for(const m of monthListSorted()){
      if(m >= month) break;
      const rec = getRec(m, siteId);
      if(rec) sum += Number(rec.thisMonthNet||0);
    }
    return sum;
  }

  // 工事完了は月次画面の「請求区分」で明示する。
  // 95%到達は「保留金待ち」であり、自動的に工事完了にはしない。
  function autoIsFinalMonth(siteId, month, thisMonthNet){
    const rec = getRec(month, siteId);
    return !!(rec && rec.isFinal);
  }

  function sumAllMonths(siteId){
    let sum = 0;
    for(const m of monthListSorted()){
      const rec = getRec(m, siteId);
      if(rec) sum += Number(rec.thisMonthNet||0);
    }
    return sum;
  }


  // ====== 工事情報：自動計算表示 ======
  function siteReceivedNet(siteId){
    return Number(sumAllMonths(siteId) || 0);
  }
  function siteBalanceNet(site){
    return Math.max(0, round(displayContract(site) - siteReceivedNet(site.id)));
  }
  function updateProjectAutoSummary(site=null){
    const finalEl = document.getElementById("p_autoFinal");
    const recvEl  = document.getElementById("p_autoReceived");
    const balEl   = document.getElementById("p_autoBalance");
    const retEl   = document.getElementById("p_autoRetention");
    if(!finalEl || !recvEl || !balEl || !retEl) return;

    if(!site){
      const tmp = {
        id: editingSiteId || "",
        contractNet: (typeof p_contractNet!=="undefined" ? getNumber(p_contractNet) : 0),
        increaseNet: (typeof p_increaseNet!=="undefined" ? getNumber(p_increaseNet) : 0),
        reductionNet: (typeof p_reductionNet!=="undefined" ? getNumber(p_reductionNet) : 0),
        retainEnabled: (typeof p_retainEnabled!=="undefined" ? p_retainEnabled.value==="1" : true),
        retainRate: Number(typeof p_retainRate!=="undefined" ? p_retainRate.value : 5) || 0,
        retainTrigger: Number(typeof p_retainTrigger!=="undefined" ? p_retainTrigger.value : 95) || 0
      };
      site = tmp;
    }
    const finalOrder = displayContract(site);
    const received = site.id ? siteReceivedNet(site.id) : 0;
    const balance = Math.max(0, round(finalOrder - received));
    const statusSite = site.id ? getLatestSiteForCalc(site) : site;
    const retRemain = site.id ? Math.max(0, retentionCap(statusSite) - retentionHeldBeforeMonth(statusSite, site.id, "9999-12")) : 0;

    finalEl.textContent = yen(finalOrder) + " 円";
    recvEl.textContent  = yen(received) + " 円";
    balEl.textContent   = yen(balance) + " 円";
    retEl.textContent   = yen(retRemain) + " 円";

    if(typeof p_displayContract!=="undefined") p_displayContract.value = yen(finalOrder);
  }

  document.addEventListener("input", (e)=>{
    if(["p_contractNet","p_increaseNet","p_reductionNet","p_retainRate","p_retainTrigger"].includes(e.target?.id)){
      updateProjectAutoSummary();
    }
  });
  document.addEventListener("change", (e)=>{
    if(["p_retainEnabled","p_safeEnabled","p_safeRate"].includes(e.target?.id)){
      updateProjectAutoSummary();
    }
  });

  // ====== View ======
  function switchView(view){
    // 4ファイル版：現在のページに対象画面が無ければ invoice_app.html へ移動
    const target = document.getElementById("view-"+view);
    if(!target){
      if(view==="home"){
        location.href="index.html";
      }else{
        localStorage.setItem("ms_invoice_open_view", view);
        location.href="invoice_app.html";
      }
      return;
    }

    document.querySelectorAll(".tab").forEach(b=>{
      b.classList.toggle("active", b.dataset.view===view);
    });
    ["home","settings","sites","monthly","print","summary"].forEach(v=>{
      const el=document.getElementById("view-"+v);
      if(el) el.classList.toggle("hide", v!==view);
    });
    if(view==="home" && typeof refreshMs4Home==="function") refreshMs4Home();
    if(view==="monthly") {
      if(typeof refreshMonthlyTable==="function") refreshMonthlyTable();
      if(typeof refreshSiteSummaryAndHistory==="function") refreshSiteSummaryAndHistory();
    }
    if(view==="print") {
      if(typeof refreshSiteSelects==="function") refreshSiteSelects();
      if(typeof renderPrint==="function") renderPrint();
    }
    if(view==="summary" && typeof renderSummary==="function") renderSummary();
  }

  // ====== Settings ======
  function syncSettingsToForm(){
    s_myName.value = state.settings.myName || "";
    s_myAddr.value = state.settings.myAddr || "";
    s_myTel.value = state.settings.myTel || "";
    s_mySigner.value = state.settings.mySigner || "";
    if(document.getElementById("s_registrationNo")) s_registrationNo.value = state.settings.registrationNo || "";
    s_useStamp.value = state.settings.useStamp ? "1":"0";
    s_taxRate.value = state.settings.taxRate ?? 10;
    s_bankText.value = state.settings.bankText || "";
    s_clientName.value = state.settings.clientName || "";
  }
  function syncFormToSettings(){
    state.settings.myName = s_myName.value.trim();
    state.settings.myAddr = s_myAddr.value.trim();
    state.settings.myTel = s_myTel.value.trim();
    state.settings.mySigner = s_mySigner.value.trim();
    if(document.getElementById("s_registrationNo")) state.settings.registrationNo = s_registrationNo.value.trim();
    state.settings.useStamp = (s_useStamp.value==="1");
    state.settings.taxRate = Number(s_taxRate.value||10);
    state.settings.bankText = s_bankText.value.trim();
    state.settings.clientName = s_clientName.value.trim();
  }
  ["s_myName","s_myAddr","s_myTel","s_mySigner","s_registrationNo","s_useStamp","s_taxRate","s_bankText","s_clientName"].forEach(id=>{
    const el=document.getElementById(id);
    if(el) el.addEventListener("change", ()=>{ syncFormToSettings(); saveAll(); renderPrint(); });
  });

  // ====== Sites ======
  let editingSiteId = null;

  // ====== 発注先マスター請求条件：正式連携 ======
  const CLIENT_MASTER_KEY = "ms_invoice_client_master_v1";

  function loadClientMasters(){
    try{
      const v = JSON.parse(localStorage.getItem(CLIENT_MASTER_KEY) || "[]");
      return Array.isArray(v) ? v : [];
    }catch(e){ return []; }
  }

  function getClientMasterForSite(site){
    if(!site) return null;
    const list = loadClientMasters();
    if(site.clientId){
      const byId = list.find(x=>String(x.id||"")===String(site.clientId));
      if(byId) return byId;
    }
    const name = String(site.clientName||"").trim();
    if(name){
      const byName = list.find(x=>String(x.name||"").trim()===name);
      if(byName) return byName;
    }
    return null;
  }

  function extractPercents(text){
    const s = String(text ?? "").replace(/％/g,"%");
    if(!s || s.includes("なし")) return [];
    return [...s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map(m=>Number(m[1])).filter(Number.isFinite);
  }

  function getEffectiveClientTerms(site){
    const master = getClientMasterForSite(site);
    const snap = (site && site.clientTerms && typeof site.clientTerms === "object") ? site.clientTerms : {};
    const src = master || snap || {};

    const retentionText = String(src.retention || snap.retention || "").trim();
    const safetyText = String(src.safetyFee || snap.safetyFee || "").trim();
    const rp = extractPercents(retentionText);
    const sp = extractPercents(safetyText);

    // マスターに数値があれば最優先。未設定時のみ旧工事データへフォールバック。
    const retainRate = retentionText
      ? (retentionText.includes("なし") ? 0 : (rp[0] ?? Number(site?.retainRate ?? 5)))
      : Number(site?.retainRate ?? 5);
    // 「その他」に 5%・95%到達 などと書いた場合、2つ目の％を発生ラインとして利用。
    const retainTrigger = rp.length >= 2 ? rp[1] : Number(site?.retainTrigger ?? 95);
    const safeRate = safetyText
      ? (safetyText.includes("なし") ? 0 : (sp[0] ?? Number(site?.safeRate ?? 0.5)))
      : Number(site?.safeRate ?? 0.5);

    return {
      source: master ? "master" : (Object.keys(snap).length ? "snapshot" : "legacy"),
      clientId: master?.id || site?.clientId || "",
      clientName: master?.name || site?.clientName || "",
      closingDay: String(src.closingDay || snap.closingDay || ""),
      paymentTerms: String(src.paymentTerms || snap.paymentTerms || ""),
      retention: retentionText,
      safetyFee: safetyText,
      retentionMinAmount: Math.max(0, Number(src.retentionMinAmount ?? snap.retentionMinAmount ?? 0) || 0),
      retentionIncludeIncrease: src.retentionIncludeIncrease !== false && snap.retentionIncludeIncrease !== false,
      retentionIncludeReduction: src.retentionIncludeReduction !== false && snap.retentionIncludeReduction !== false,
      adjustmentTiming: String(src.adjustmentTiming || snap.adjustmentTiming || site?.adjustmentTiming || "anytime") === "final" ? "final" : "anytime",
      retainEnabled: retainRate > 0,
      retainRate: Number.isFinite(retainRate) ? retainRate : 0,
      retainTrigger: Number.isFinite(retainTrigger) ? retainTrigger : 95,
      safeEnabled: safeRate > 0,
      safeRate: Number.isFinite(safeRate) ? safeRate : 0
    };
  }

  function applyClientTermsToSite(site){
    if(!site) return site;
    const t = getEffectiveClientTerms(site);
    return {
      ...site,
      clientTerms:{
        closingDay:t.closingDay, paymentTerms:t.paymentTerms,
        retention:t.retention,
        retentionMinAmount:t.retentionMinAmount,
        retentionIncludeIncrease:t.retentionIncludeIncrease,
        retentionIncludeReduction:t.retentionIncludeReduction,
        adjustmentTiming:t.adjustmentTiming,
        safetyFee:t.safetyFee
      },
      retentionMinAmount:t.retentionMinAmount,
      retentionIncludeIncrease:t.retentionIncludeIncrease,
      retentionIncludeReduction:t.retentionIncludeReduction,
      adjustmentTiming:t.adjustmentTiming,
      retainEnabled:t.retainEnabled, retainRate:t.retainRate, retainTrigger:t.retainTrigger,
      safeEnabled:t.safeEnabled, safeRate:t.safeRate
    };
  }

  // ===== 増減：会社別の反映時期 + 月次入力 =====
  function monthlyAdjustmentTotals(siteId, uptoMonth="9999-12", includeMonth=true){
    let increase=0, reduction=0;
    for(const m of monthListSorted()){
      if(m > uptoMonth || (!includeMonth && m === uptoMonth)) break;
      const r=getRec(m,siteId);
      if(!r) continue;
      increase += Number(r.increaseNet||0);
      reduction += Number(r.reductionNet||0);
    }
    return {increase:round(increase), reduction:round(reduction)};
  }

  function allKnownAdjustments(site){
    const m=monthlyAdjustmentTotals(site?.id||"", "9999-12", true);
    return {
      increase: round(Number(site?.increaseNet||0)+m.increase),
      reduction: round(Number(site?.reductionNet||0)+m.reduction)
    };
  }

  function adjustmentAtMonth(site, month, isFinal, draftIncrease, draftReduction){
    const t=getEffectiveClientTerms(site);
    const before=monthlyAdjustmentTotals(site?.id||"", month||"9999-12", false);
    let curInc=0, curDec=0;
    if(month){
      const r=getRec(month,site?.id);
      curInc = draftIncrease !== undefined ? Number(draftIncrease||0) : Number(r?.increaseNet||0);
      curDec = draftReduction !== undefined ? Number(draftReduction||0) : Number(r?.reductionNet||0);
    }else{
      const all=monthlyAdjustmentTotals(site?.id||"", "9999-12", true);
      before.increase=all.increase; before.reduction=all.reduction;
    }
    const rawInc=round(Number(site?.increaseNet||0)+before.increase+curInc);
    const rawDec=round(Number(site?.reductionNet||0)+before.reduction+curDec);
    const apply=(t.adjustmentTiming!=="final") || !!isFinal;
    return {increase:apply?rawInc:0,reduction:apply?rawDec:0,rawIncrease:rawInc,rawReduction:rawDec,timing:t.adjustmentTiming};
  }

  // 工事一覧などの「最終注文金額」は、登録済みの増減をすべて含む見込最終額。
  function displayContract(site){
    const a=allKnownAdjustments(site);
    return Number(site?.contractNet||0) + a.increase - a.reduction;
  }
  function effContract(site){
    return Math.max(0, Number(site?.contractNet||0) + Number(site?.increaseNet||0) - Number(site?.reductionNet||0));
  }

  // 計算用サイト：会社設定と「その月」までの増減だけを反映する。
  function getSiteForCalc(site, isFinal, month, draftIncrease, draftReduction){
    const linked=applyClientTermsToSite(site);
    const a=adjustmentAtMonth(linked, month, !!isFinal, draftIncrease, draftReduction);
    return {
      ...linked,
      increaseNet:a.increase,
      reductionNet:a.reduction,
      retentionIncreaseNet:a.increase,
      retentionReductionNet:a.reduction,
      adjustmentTiming:a.timing,
      rawIncreaseNet:a.rawIncrease,
      rawReductionNet:a.rawReduction
    };
  }


  // 一覧・ホームなど「現在の工事状態」を表示するときは、
  // 最新の月次増減まで反映した計算用サイトを使う。
  // これにより、工事情報の当初金額だけで保留金を計算してしまう表示差を防ぐ。
  function getLatestSiteForCalc(site){
    if(!site) return site;
    let latestMonth="";
    let latestFinal=false;
    for(const m of monthListSorted()){
      const r=getRec(m,site.id);
      if(!r) continue;
      latestMonth=m;
      latestFinal=!!r.isFinal;
    }
    if(!latestMonth) return applyClientTermsToSite(site);
    try{return getSiteForCalc(site,latestFinal,latestMonth);}catch(e){return applyClientTermsToSite(site);}
  }

  // 月次入力中の増減は保存前でも即時計算へ反映する。
  // 特に「工事完了時に反映」の会社では、工事完了を選んだ瞬間から
  // 当月の追加・減額を最終注文金額・残工事・保留金計算に使う。
  function getMonthlyDraftAdjustment(){
    const incEl=document.getElementById("m_increaseNet");
    const decEl=document.getElementById("m_reductionNet");
    return {
      increase: incEl ? getNumber(incEl) : undefined,
      reduction: decEl ? getNumber(decEl) : undefined
    };
  }

  function retentionBase(site){
    const linked = applyClientTermsToSite(site);
    if(!linked) return 0;

    const contract = Number(linked.contractNet||0);
    const increase = Number(
      linked.retentionIncreaseNet !== undefined
        ? linked.retentionIncreaseNet
        : linked.increaseNet||0
    );
    const reduction = Number(
      linked.retentionReductionNet !== undefined
        ? linked.retentionReductionNet
        : linked.reductionNet||0
    );

    const includeIncrease = linked.retentionIncludeIncrease !== false;
    const includeReduction = linked.retentionIncludeReduction !== false;

    return Math.max(0,
      contract +
      (includeIncrease ? increase : 0) -
      (includeReduction ? reduction : 0)
    );
  }

  function retentionCap(site){
    const linked = applyClientTermsToSite(site);
    if(linked && linked.retainEnabled === false) return 0;
    const base = retentionBase(linked);
    const minAmount = Math.max(0, Number(linked?.retentionMinAmount||0));
    // 判定額が発生基準額未満なら保留金は発生しない。基準額ちょうどは対象。
    if(minAmount > 0 && base < minAmount) return 0;
    return round(base * (Number(linked?.retainRate ?? 0)/100));
  }

  function triggerLine(site){
    const linked = applyClientTermsToSite(site);
    if(!linked || linked.retainEnabled === false || Number(linked.retainRate||0) <= 0){
      return Number.POSITIVE_INFINITY;
    }
    // 発生基準額による免除時は、通常請求を止めるラインも設けない。
    if(retentionCap(linked) <= 0) return Number.POSITIVE_INFINITY;

    // 新ルール：
    // 「95％」を固定割合として再計算せず、
    // 最終注文金額から会社設定で算出した保留金を差し引いた額を通常請求上限とする。
    // 例：100万 + 増額10万（増額を保留計算に含めない）・保留5%
    //     保留金5万 → 通常請求上限105万
    const finalOrder = Math.max(0,
      Number(linked.contractNet||0) +
      Number(linked.retentionIncreaseNet !== undefined ? linked.retentionIncreaseNet : linked.increaseNet||0) -
      Number(linked.retentionReductionNet !== undefined ? linked.retentionReductionNet : linked.reductionNet||0)
    );
    return Math.max(0, finalOrder - retentionCap(linked));
  }

  function resetSiteForm(){
    editingSiteId = null;
    p_name.value="";
    if(typeof p_clientName!=="undefined") p_clientName.value="";
    p_orderNo.value="";
    p_workNo.value="";
    if(typeof p_orderManager!=="undefined") p_orderManager.value="";
    if(typeof p_billingManager!=="undefined") p_billingManager.value="";
    p_contractNet.value="";
    p_increaseNet.value="0";
    p_reductionNet.value="0";
    p_displayContract.value="—";
    if(typeof p_retainEnabled!=="undefined") p_retainEnabled.value="1";
    if(typeof p_safeEnabled!=="undefined") p_safeEnabled.value="1";
    if(typeof p_retainRate!=="undefined") p_retainRate.value="5";
    if(typeof p_retainTrigger!=="undefined") p_retainTrigger.value="95";
    if(typeof p_safeRate!=="undefined") p_safeRate.value="0.5";
    if(typeof p_regDate!=="undefined" && !p_regDate.value){
      p_regDate.value = new Date().toISOString().slice(0,10);
    }
    if(typeof btnSiteSave!=="undefined") btnSiteSave.textContent="工事を登録";
    if(typeof btnSiteCancel!=="undefined") btnSiteCancel.classList.add("hide");
    updateProjectAutoSummary();
  }
  function updateDisplayContractPreview(){
    const tmp = {
      contractNet: getNumber(p_contractNet),
      increaseNet: getNumber(p_increaseNet),
      reductionNet: getNumber(p_reductionNet)
    };
    p_displayContract.value = `${yen(displayContract(tmp))} 円`;
  }
  ["p_contractNet","p_increaseNet","p_reductionNet"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.addEventListener("input", updateDisplayContractPreview);
  });

  function saveSite(){
    const name = p_name.value.trim();
    if(!name){ alert("工事名を入力してください。"); p_name.focus(); return; }

    const data = {
      name,
      clientName: (typeof p_clientName!=="undefined" ? p_clientName.value.trim() : ""),
      orderNo: p_orderNo.value.trim(),
      workNo: p_workNo.value.trim(),
      orderManager: (typeof p_orderManager!=="undefined" ? p_orderManager.value.trim() : ""),
      billingManager: (typeof p_billingManager!=="undefined" ? p_billingManager.value.trim() : ""),
      contractNet: getNumber(p_contractNet),
      increaseNet: getNumber(p_increaseNet),
      reductionNet: getNumber(p_reductionNet),
      retainEnabled: (typeof p_retainEnabled!=="undefined" ? p_retainEnabled.value==="1" : true),
      retainRate: Number(typeof p_retainRate!=="undefined" ? p_retainRate.value : 5) || 0,
      retainTrigger: Number(typeof p_retainTrigger!=="undefined" ? p_retainTrigger.value : 95) || 0,
      safeEnabled: (typeof p_safeEnabled!=="undefined" ? p_safeEnabled.value==="1" : true),
      safeRate: Number(typeof p_safeRate!=="undefined" ? p_safeRate.value : 0.5) || 0,
      regDate: (typeof p_regDate!=="undefined" ? p_regDate.value : "")
    };

    if(editingSiteId){
      const i = state.sites.findIndex(s=>s.id===editingSiteId);
      if(i>=0) state.sites[i] = {...state.sites[i], ...data};
    }else{
      state.sites.push({id:uid(), ...data});
    }

    saveAll();
    refreshSiteTable();
    refreshSiteSelects();
    if(typeof refreshMs4Home==="function") refreshMs4Home();
    resetSiteForm();
  }

  function startEditSite(id){
    const s = state.sites.find(x=>x.id===id);
    if(!s) return;
    editingSiteId = id;

    p_name.value = s.name || "";
    p_orderNo.value = s.orderNo || "";
    p_workNo.value = s.workNo || "";
    p_contractNet.value = Number(s.contractNet||0).toLocaleString("ja-JP");
    p_increaseNet.value = Number(s.increaseNet||0).toLocaleString("ja-JP");
    p_reductionNet.value = Number(s.reductionNet||0).toLocaleString("ja-JP");
    updateDisplayContractPreview();

    if(typeof p_manager!=="undefined") p_manager.value = s.manager || "";
    if(typeof p_regDate!=="undefined") p_regDate.value = s.regDate || "";

    const btn = document.getElementById("btnSiteSave");
    if(btn) btn.textContent = "現場を更新";
    const c = document.getElementById("btnSiteCancel");
    if(c) c.classList.remove("hide");
    window.scrollTo({top:0, behavior:"smooth"});
  }

  function cancelEditSite(){ resetSiteForm(); }
  function addSite(){ return saveSite(); } // 互換

  function deleteSite(id){
    if(!confirm("この現場を削除しますか？")) return;
    state.sites = state.sites.filter(s=>s.id!==id);
    for(const m of Object.keys(state.monthly)){
      if(state.monthly[m] && state.monthly[m][id]) delete state.monthly[m][id];
    }
    saveAll();
    refreshSiteTable();
    refreshSiteSelects();
    refreshMonthlyTable();
    refreshSiteSummaryAndHistory();
    refreshHomeDashboard();
  }
  function refreshSiteTable(){
    const tb = document.querySelector("#sitesTable tbody");
    tb.innerHTML="";
    if(state.sites.length===0){
      tb.innerHTML = `<tr><td colspan="6" class="hint">まだ現場がありません。左で追加してください。</td></tr>`;
      return;
    }
    state.sites.forEach(s=>{
      const tr = document.createElement("tr");
      const finalOrder = displayContract(s);
      const received = sumAllMonths(s.id);
      const balance = Math.max(0, finalOrder - received);

      // 保留金残（全期間の控除累計から算出）
      const statusSite = getLatestSiteForCalc(s);
      const cap = retentionCap(statusSite);
      const trig = triggerLine(statusSite);
      const heldTotal = retentionHeldTotal(s.id);
      const reached = (received >= trig);
      const retRemain = reached ? Math.max(0, cap - heldTotal) : 0;
      tr.innerHTML = `
        <td><b>${escapeHtml(s.name)}</b>
          <div class="hint">最終注文金額: ${yen(finalOrder)} 円 ／ 担当: ${escapeHtml(s.manager||'-')} ／ 登録日: ${escapeHtml(s.regDate||'-')} ／ ID: ${escapeHtml(s.id)}
          ${retRemain>0 ? `／ <span class="ret-badge">保留金残 ${yen(retRemain)}円</span>` : ``}</div>
        </td>
        <td class="nowrap col-order"><span class="pill">${escapeHtml((s.orderNo||"-").toUpperCase())}</span> <span class="pill">${escapeHtml(s.workNo||"-")}</span></td>
        <td class="right mono col-money">${yen(finalOrder)} 円</td>
        <td class="right mono col-money">${yen(received)} 円</td>
        <td class="right mono col-money">${yen(balance)} 円</td>
        <td class="right"><button class="secondary" onclick="startEditSite('${s.id}')">編集</button> <button class="danger" onclick="deleteSite('${s.id}')">削除</button></td>
      `;
      tb.appendChild(tr);
    });
  }
  function refreshSiteSelects(){
    const opts = state.sites.map(s=>`<option value="${s.id}">${escapeHtml(s.name)}</option>`).join("");
    const empty = `<option value="">（現場なし）</option>`;
    const targets = [
      document.getElementById("m_site"),
      document.getElementById("pr_site")
    ].filter(Boolean);

    targets.forEach(el=>{
      const keep = el.value || "";
      el.innerHTML = opts || empty;
      if(keep && state.sites.some(s=>s.id===keep)) el.value = keep;
    });
  }

  // ====== ホーム（未請求／完了の自動振り分け） ======
  function siteBillingStatus(s){
    const finalOrder = displayContract(s);
    const received = sumAllMonths(s.id);
    const balance = Math.max(0, finalOrder - received);
    const statusSite = getLatestSiteForCalc(s);
    const cap = retentionCap(statusSite);
    const trig = triggerLine(statusSite);
    const heldTotal = retentionHeldTotal(s.id);
    const reached = (received >= trig);
    const retRemain = reached ? Math.max(0, cap - heldTotal) : 0;
    return {finalOrder, received, balance, retRemain, pending:(balance>0 || retRemain>0)};
  }

  function currentYM(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  }

  function openMonthlyForSite(id){
    switchView('monthly');
    if(!m_month.value) m_month.value = currentYM();
    m_site.value = id;
    loadMonthlyToForm();
    refreshMonthlyTable();
    refreshSiteSummaryAndHistory();
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function openSiteEditFromHome(id){
    switchView('sites');
    startEditSite(id);
  }

  function homeJobRow(s, st, done){
    return `
      <div class="ms-job">
        <div>
          <div class="ms-job-name">${escapeHtml(s.name)}</div>
          <div class="ms-job-sub">注文No：${escapeHtml(s.orderNo||'-')} ／ 工事No：${escapeHtml(s.workNo||'-')} ／ 担当：${escapeHtml(s.manager||'-')}</div>
        </div>
        <div class="ms-money"><div class="k">最終注文金額</div><div class="v">${yen(st.finalOrder)} 円</div></div>
        <div class="ms-money"><div class="k">請求済（出来高累計）</div><div class="v">${yen(st.received)} 円</div></div>
        <div class="ms-money remain"><div class="k">${done?'請求残':(st.retRemain>0?'保留金待ち':'未請求')}</div><div class="v">${yen(st.balance)} 円${st.retRemain>0?`<div style="font-size:10px;color:#b00020;margin-top:2px;">保留金残 ${yen(st.retRemain)} 円</div>`:''}</div></div>
        <div class="ms-action">
          ${done?'':`<button onclick="openMonthlyForSite('${s.id}')">開く</button>`}
          <button class="secondary" onclick="openSiteEditFromHome('${s.id}')">工事情報</button>
          <button class="secondary" onclick="switchView('print');pr_site.value='${s.id}';renderPrint();">請求書</button>
        </div>
      </div>`;
  }

  function refreshHomeDashboard(){
    const pending=[]; const done=[];
    let amount=0;
    state.sites.forEach(s=>{
      const st=siteBillingStatus(s);
      if(st.pending){ pending.push({s,st}); amount += st.balance + st.retRemain; }
      else done.push({s,st});
    });
    const pc=document.getElementById('homePendingCount');
    const pa=document.getElementById('homePendingAmount');
    const dc=document.getElementById('homeDoneCount');
    const pl=document.getElementById('homePendingLabel');
    const dl=document.getElementById('homeDoneLabel');
    const pList=document.getElementById('homePendingList');
    const dList=document.getElementById('homeDoneList');
    if(pc) pc.textContent=`${pending.length} 件`;
    if(pa) pa.textContent=`${yen(amount)} 円`;
    if(dc) dc.textContent=`${done.length} 件`;
    if(pl) pl.textContent=`${pending.length}件`;
    if(dl) dl.textContent=`${done.length}件`;
    if(pList) pList.innerHTML=pending.length ? pending.map(x=>homeJobRow(x.s,x.st,false)).join('') : '<div class="ms-empty">未請求の工事はありません。</div>';
    if(dList) dList.innerHTML=done.length ? done.map(x=>homeJobRow(x.s,x.st,true)).join('') : '<div class="ms-empty">請求完了した工事はまだありません。</div>';
  }

  // ====== Monthly ======
  function monthKey(){ return (m_month.value || "").trim(); }
  function getMonthly(month){
    if(!state.monthly[month]) state.monthly[month]={};
    return state.monthly[month];
  }
  function saveMonthly(){
    const month = monthKey();
    const siteId = m_site.value;
    if(!month){ alert("対象月を入力してください"); return; }
    if(!siteId){ alert("現場を選択してください"); return; }

    const thisMonth = getNumber(m_thisMonthNet);
    const isFinal = (m_isFinal.value === "1");
    const increaseNet = document.getElementById("m_increaseNet") ? getNumber(document.getElementById("m_increaseNet")) : 0;
    const reductionNet = document.getElementById("m_reductionNet") ? getNumber(document.getElementById("m_reductionNet")) : 0;
    // 「保留金だけを請求」ボタンから保存された場合だけ自動精算を許可する。
    // 通常の工事完了は、今月の出来高をユーザーが確認して手入力する。
    const finalEl = document.getElementById("m_isFinal");
    const retentionOnlyClaim = !!(finalEl && finalEl.dataset && finalEl.dataset.retentionOnlyClaim === "1");
    const site = state.sites.find(s=>s.id===siteId);
    if(!site){ alert("工事情報が見つかりません"); return; }

    // 保留金待ちの工事を完了する月は、出来高0でも保留金だけ請求できる。
    const mobj = getMonthly(month);
    mobj[siteId] = { thisMonthNet: thisMonth, increaseNet, reductionNet, isFinal: isFinal, retentionOnlyClaim, retHeldNet: 0 };
    if(finalEl && finalEl.dataset) delete finalEl.dataset.retentionOnlyClaim;
    saveAll();

    try{ if(typeof refreshSiteTable==="function") refreshSiteTable(); }catch(e){}
    try{ if(typeof refreshMonthlyTable==="function") refreshMonthlyTable(); }catch(e){}
    try{ if(typeof refreshSiteSummaryAndHistory==="function") refreshSiteSummaryAndHistory(); }catch(e){}
    try{ if(typeof refreshHomeDashboard==="function") refreshHomeDashboard(); }catch(e){}
    alert("月次を保存しました");
  }
  function loadMonthlyToForm(){
    const month = monthKey();
    const siteId = m_site.value;
    if(!month || !siteId) return;

    const rec = getRec(month, siteId);
    if(!rec){
      m_thisMonthNet.value = "0";
      formatCommaInput(m_thisMonthNet);
      if(document.getElementById("m_increaseNet")){ m_increaseNet.value="0"; formatCommaInput(m_increaseNet); }
      if(document.getElementById("m_reductionNet")){ m_reductionNet.value="0"; formatCommaInput(m_reductionNet); }
      m_isFinal.value = "0";
      refreshSiteSummaryAndHistory();
      return;
    }

    m_thisMonthNet.value = String(rec.thisMonthNet ?? 0);
    formatCommaInput(m_thisMonthNet);
    if(document.getElementById("m_increaseNet")){ m_increaseNet.value=String(rec.increaseNet ?? 0); formatCommaInput(m_increaseNet); }
    if(document.getElementById("m_reductionNet")){ m_reductionNet.value=String(rec.reductionNet ?? 0); formatCommaInput(m_reductionNet); }

    m_isFinal.value = rec.isFinal ? "1" : "0";

    refreshSiteSummaryAndHistory();
  }

  function refreshMonthlyTable(){
    const month = monthKey();
    const tb = document.querySelector("#monthlyTable tbody");
    if(!tb) return;
    tb.innerHTML="";
    if(!month){
      tb.innerHTML = `<tr><td colspan="4" class="hint">対象月を入力してください。</td></tr>`;
      return;
    }
    if(state.sites.length===0){
      tb.innerHTML = `<tr><td colspan="4" class="hint">現場がありません。</td></tr>`;
      return;
    }
    const data = state.monthly[month] || {};
    state.sites.forEach(s=>{
      const rec = data[s.id];
      const received = sumBeforeMonth(s.id, month);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><b>${escapeHtml(s.name)}</b></td>
        <td class="right mono">${yen(received)} 円</td>
        <td class="right mono">${rec ? yen(rec.thisMonthNet) : "—"} 円</td>
        <td>${rec ? (rec.isFinal ? "工事完了" : "通常") : "未入力"}</td>
      `;
      tb.appendChild(tr);
    });
  }

  function deleteMonthly(siteId, month){
    if(!confirm(`${month} のデータを削除しますか？`)) return;
    if(state.monthly[month] && state.monthly[month][siteId]){
      delete state.monthly[month][siteId];
      if(Object.keys(state.monthly[month]).length===0) delete state.monthly[month];
    }
    saveAll();
    refreshSiteTable();
    refreshMonthlyTable();
    refreshSiteSummaryAndHistory();
  }

  // ====== 保留金：前月までの控除累計（保存値優先）=====
// monthlyレコードに retHeldNet（その月に控除した保留金：税抜）を保存する。
// 既存データに無い場合は「推定」で計算してフォールバックする。
function retentionHeldBeforeMonth(siteForCalc, siteId, month){
  let held = 0;

  for(const m of monthListSorted()){
    if(m >= month) break;
    const rec = getRec(m, siteId);
    if(!rec) continue;

    if(typeof rec.retHeldNet === "number"){
      held += Number(rec.retHeldNet || 0);
    }else{
      // 旧データ互換：推定
      const base = retentionBase(siteForCalc);
      const rate = Number(siteForCalc.retainRate ?? 0)/100;
      const cap = retentionCap(siteForCalc);
      const trigger = triggerLine(siteForCalc);

      // 旧推定は「その月までの累計」がtrigger以上なら控除が始まる想定
      // （※厳密には、当アプリの現行ルールと一致させるため migrateRetention() で補正する）
      const receivedBefore = sumBeforeMonth(siteId, m);
      const thisNet = Number(rec.thisMonthNet||0);
      const cum = receivedBefore + thisNet;
      if(cum < trigger) continue;

      const monthHold = Math.min(Math.max(0, cap - held), Math.round(thisNet * rate));
      held += monthHold;
    }
  }
  return held;
}

// 保留金のロジック
function retentionHeldTotal(siteId){
  let held = 0;
  for(const m of monthListSorted()){
    const rec = getRec(m, siteId);
    if(!rec) continue;
    if(typeof rec.retHeldNet === "number") held += Number(rec.retHeldNet || 0);
  }
  return held;
}

// （控除/解除）
function calcRetention(site, siteId, month, receivedNet, thisMonthNet, isFinal){
  // ルール：
  // ・累計が発生ライン(95%)以上になった月から保留金が発生
  // ・控除は「保留金上限の残り」をその月の請求から一括で控除
  // ・出来高が不足する場合のみ、控除できる範囲で控除し、残りは次月以降へ繰越
  const siteForCalc = getSiteForCalc(site, !!isFinal, month);

  const base = retentionBase(siteForCalc);
  const rate = Number(siteForCalc.retainRate ?? 0) / 100;
  const cap  = retentionCap(siteForCalc);
  const trigger = triggerLine(siteForCalc);

  const cum = receivedNet + thisMonthNet;
  if(cum < trigger) return {mode:"none", amount:0, cap, trigger, base};

  const heldSoFar = retentionHeldBeforeMonth(siteForCalc, siteId, month);
  const remain = Math.max(0, cap - heldSoFar);

  // 最終月でも控除は行う（保留金だけ請求の月は別処理）
  const monthHold = Math.min(remain, Math.max(0, thisMonthNet));
  return {mode:"deduct", amount:monthHold, cap, trigger, base, heldSoFar};
}


// ====== 既存データの保留金控除を「現行ルール」で再計算して保存（移行）=====
function migrateRetention(){
  // 月順で、現場ごとに累計して retHeldNet を付与（現行ルール：一括控除）
  const months = monthListSorted();
  if(months.length===0) return;

  for(const site of state.sites){
    const siteId = site.id;
    let heldSoFar = 0;

    for(const month of months){
      const rec = getRec(month, siteId);
      if(!rec) continue;

      const receivedBefore = sumBeforeMonth(siteId, month);
      const thisNet = Number(rec.thisMonthNet||0);
      const cum = receivedBefore + thisNet;

      // 保留金だけ請求（月次出来高0）の月は控除ではない
      if(thisNet === 0){
        rec.retHeldNet = 0;
        continue;
      }

      const isFinalWork = autoIsFinalMonth(siteId, month, thisNet);
      const siteForCalc = getSiteForCalc(site, isFinalWork, month);

      const base = retentionBase(siteForCalc);
      const rate = Number(siteForCalc.retainRate ?? 0)/100;
      const cap  = retentionCap(siteForCalc);
      const trigger = triggerLine(siteForCalc);

      let hold = 0;
      if(cum >= trigger && heldSoFar < cap){
        const remain = Math.max(0, cap - heldSoFar);
        hold = Math.min(remain, thisNet);
      }else{
        hold = 0;
      }

      rec.retHeldNet = hold;
      heldSoFar += hold;
      if(heldSoFar >= cap) heldSoFar = cap;
    }
  }
  saveAll();
}
  function refreshSiteSummaryAndHistory(){
    const month = monthKey();
    const siteId = m_site.value;
    const site = state.sites.find(s=>s.id===siteId);

    if(!site || !month){
      sum_contract.textContent="—";
      sum_increase.textContent="—";
      sum_reduction.textContent="—";
      sum_displayContract.textContent="—";
      sum_effective.textContent="—";
      const eMin=document.getElementById("sum_retMin"); if(eMin)eMin.textContent="—";
      sum_prevCum.textContent="—";
      sum_retCap.textContent="—";
      sum_trigger.textContent="—";
      sum_balance.textContent="—";
      const elRemain = document.getElementById("sum_retRemain");
      if(elRemain) elRemain.textContent="—";
      ["sum_workCum","sum_thisRetHeld","sum_actualBilled","sum_workBalance"].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent="—";});
      renderHistoryTable(null);
      return;
    }

    const prev = sumBeforeMonth(siteId, month);

    const thisMonthDraft = getNumber(m_thisMonthNet);
    const cumDraft = prev + thisMonthDraft;

    // 工事完了はユーザーが「請求区分」で明示する。
    const isFinalWork = (m_isFinal.value === "1");
    const draftAdj = getMonthlyDraftAdjustment();
    const draftInc = draftAdj.increase;
    const draftDec = draftAdj.reduction;
    const siteForCalc = getSiteForCalc(site, isFinalWork, month, draftInc, draftDec);

    const base = retentionBase(siteForCalc);
    const cap = retentionCap(siteForCalc);
    const trig = triggerLine(siteForCalc);

    // 95%到達後は保留金5%を一括で「保留金待ち」とする。
    // 途中出来高が97%・98%になっても、請求累計は95%ラインで止める。
    const reached = Number.isFinite(trig) && (cumDraft >= trig);
    // 工事完了月でも保留金は消さない。
    // 通常の「工事完了」は最終出来高を確定する月であり、保留金の解除月ではない。
    // 保留金の解除は専用の「保留金を請求」操作だけで行う。
    // 保留金請求の保存後は dataset が消えるため、保存済みレコードの印も確認する。
    // これにより保存直後・再読込後とも、実請求済累計と未請求額へ保留金請求分を反映する。
    const savedRecForSummary = getRec(month, siteId);
    const retentionOnlyDraft =
      !!document.getElementById("m_isFinal")?.dataset?.retentionOnlyClaim ||
      savedRecForSummary?.retentionOnlyClaim === true;
    const retRemain = (reached && !retentionOnlyDraft) ? cap : 0;

    const elRemain = document.getElementById("sum_retRemain");
    if(elRemain) elRemain.textContent = `${yen(retRemain)} 円`;

    // 目立つアラート表示
    const alertBox = document.getElementById("retAlert");
    const alertAmt = document.getElementById("retAlertAmt");
    if(alertBox && alertAmt){
      if(retRemain > 0){
        alertAmt.textContent = yen(retRemain);
        alertBox.classList.remove("hide");
      }else{
        alertBox.classList.add("hide");
      }
    }

    const disp = Math.max(0, Number(siteForCalc.contractNet||0)+Number(siteForCalc.increaseNet||0)-Number(siteForCalc.reductionNet||0));

    // 月次画面の入力中プレビューも、正式ルールと同じ累計上限制で計算する。
    let actualBilledBefore = 0;
    for(const mm of monthListSorted()){
      if(mm >= month) break;
      if(!getRec(mm, siteId)) continue;
      try{ actualBilledBefore += Number(calcBillForSite(mm, site).billNet||0); }catch(e){}
    }
    const hasRetention = Number.isFinite(trig) && trig < disp && cap > 0;
    // 工事完了月でも、通常の最終出来高請求では保留金を控除する。
    // 保留金を解除して残額を請求するのは、専用の「保留金を請求」操作だけ。
    const targetCum = retentionOnlyDraft
      ? disp
      : (hasRetention ? Math.min(cumDraft, trig) : Math.min(cumDraft, disp));
    const draftBill = Math.max(0, round(targetCum - actualBilledBefore));
    const actualBilledCum = actualBilledBefore + draftBill;
    // 95%到達後は「残工事なし」という正式仕様。出来高残は0扱いにする。
    const workBalance = reached ? 0 : Math.max(0, disp - cumDraft);
    const balance = Math.max(0, disp - actualBilledCum);

    sum_contract.textContent = `${yen(site.contractNet)} 円`;
    sum_increase.textContent = `${yen(Number(siteForCalc.increaseNet||0))} 円`;
    sum_reduction.textContent = `${yen(Number(siteForCalc.reductionNet||0))} 円`;
    sum_displayContract.textContent = `${yen(Number(siteForCalc.contractNet||0)+Number(siteForCalc.increaseNet||0)-Number(siteForCalc.reductionNet||0))} 円`;
    sum_effective.textContent = `${yen(base)} 円`;
    const eMin=document.getElementById("sum_retMin");
    if(eMin){
      const terms=getEffectiveClientTerms(siteForCalc);
      const minAmount=Math.max(0,Number(terms.retentionMinAmount||0));
      eMin.textContent=minAmount>0 ? `${yen(minAmount)} 円` : "基準なし";
    }
    sum_prevCum.textContent = `${yen(prev)} 円`;
    sum_retCap.textContent = `${yen(cap)} 円`;
    sum_trigger.textContent = Number.isFinite(trig) ? `${yen(trig)} 円` : "なし";
    sum_balance.textContent = `${yen(balance)} 円`;
    const e1=document.getElementById("sum_workCum"); if(e1) e1.textContent=`${yen(cumDraft)} 円`;
    const e2=document.getElementById("sum_thisRetHeld"); if(e2) e2.textContent=`${yen(draftBill)} 円`;
    const e3=document.getElementById("sum_actualBilled"); if(e3) e3.textContent=`${yen(actualBilledCum)} 円`;
    const e4=document.getElementById("sum_workBalance"); if(e4) e4.textContent=`${yen(workBalance)} 円`;

    renderHistoryTable(siteId);
  }

  function renderHistoryTable(siteId){
    const tb = document.querySelector("#siteHistoryTable tbody");
    if(!tb) return;
    tb.innerHTML="";
    if(!siteId){
      tb.innerHTML = `<tr><td colspan="6" class="hint">現場を選ぶと履歴が表示されます。</td></tr>`;
      return;
    }
    const months = monthListSorted();
    const rows = [];
    for(const m of months){
      const rec = getRec(m, siteId);
      if(rec) rows.push({month:m, rec});
    }
    if(rows.length===0){
      tb.innerHTML = `<tr><td colspan="6" class="hint">この現場の月次データはまだありません。</td></tr>`;
      return;
    }
    rows.forEach(r=>{
      const tr = document.createElement("tr");
      const site = state.sites.find(s=>s.id===siteId);
      let billed = 0;
      let held = 0;
      let status = r.rec.isFinal ? "工事完了" : "通常";
      if(site){
        try{
          const c = calcBillForSite(r.month,site);
          billed = Number(c.billNet||0);
          const rowCalcSite = getSiteForCalc(site,!!r.rec.isFinal,r.month);
          const trig = triggerLine(rowCalcSite);
          const cap = retentionCap(rowCalcSite);
          const cum = Number(sumBeforeMonth(siteId,r.month)||0)+Number(r.rec.thisMonthNet||0);
          if(!r.rec.isFinal && Number.isFinite(trig) && cum >= trig && cap>0){ held=cap; status="保留金待ち"; }
        }catch(e){}
      }
      tr.innerHTML = `
        <td><b>${r.month}</b></td>
        <td class="right mono">${yen(r.rec.thisMonthNet)} 円</td>
        <td class="right mono">${yen(held)} 円</td>
        <td class="right mono"><b>${yen(billed)} 円</b></td>
        <td>${status}</td>
        <td class="right">
          <button class="secondary" onclick="jumpToMonth('${r.month}')">この月へ</button>
          <button class="danger" onclick="deleteMonthly('${siteId}','${r.month}')">削除</button>
        </td>
      `;
      tb.appendChild(tr);
    });
  }
  function jumpToMonth(month){
    m_month.value = month;
    refreshMonthlyTable();
    loadMonthlyToForm();
  }

  // ★完全版：印刷（95%到達後は保留金を控除／最終月は保留金残を請求に戻す）
  function renderPrint(){
    syncFormToSettings();

    const month  = (pr_month.value||"").trim();
    const siteId = pr_site.value;
    const site   = state.sites.find(s=>s.id===siteId);

    const setText = (key, text) => {
  // id と data-bind の両方に反映（簡易表／詳細表の両方を更新）
  const el = document.getElementById(key);
  if(el) el.textContent = text;
  document.querySelectorAll(`[data-bind="${key}"]`).forEach(n=>{ n.textContent = text; });
};

    setText("pvDate", pr_billDate.value
      ? new Date(pr_billDate.value).toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'})
      : "—"
    );
    setText("pvClient", state.settings.clientName || "—");
    setText("pvMyName", state.settings.myName || "—");
    setText("pvMyAddr", state.settings.myAddr || "—");
    setText("pvMyTel",  state.settings.myTel  || "—");
    setText("pvSigner", state.settings.mySigner || "—");
    setText("pvRegistrationNo", state.settings.registrationNo || "—");
    setText("pvBank",   state.settings.bankText || "—");

    if(!site){
      setText("pvSite","（現場を選択）");
      setText("pvOrderNo","—");
      setText("pvWorkNo","—");
      setText("pvStaff","　");
      ["pvContractNet","pvIncreaseNet","pvReductionNet","pvFinalOrderNet",
       "pvReceivedNet","pvThisMonthNet","pvCumNet","pvBillNet","pvTax"
      ].forEach(id=>setText(id,"0 円"));
      setText("pvTotalGross","¥0");
      setText("pvRetentionBox","　");
      return;
    }

    setText("pvSite",   site.name);
    setText("pvOrderNo",site.orderNo || "—");
    setText("pvWorkNo", site.workNo  || "—");
    setText("pvStaff",  site.manager ? site.manager : "　");

    const rec = getRec(month, siteId) || {thisMonthNet:0,isFinal:false};
    const thisMonthNet = Number(rec.thisMonthNet || 0);

    const contractNet0 = Number(site.contractNet||0);
    const isFinalWork = !!rec.isFinal;
    const siteForCalc = getSiteForCalc(site,isFinalWork,month);
    const increaseNet0 = Number(siteForCalc.increaseNet||0);
    const reductionNet0 = Number(siteForCalc.reductionNet||0);
    const finalOrderNet0 = Math.max(0,contractNet0+increaseNet0-reductionNet0);

    const receivedNet  = Number(sumBeforeMonth(siteId, month) || 0);
    const cumNet       = receivedNet + thisMonthNet;

    const increaseNetEff = increaseNet0;
    const reductionNetEff = reductionNet0;
    const finalOrderNetEff = finalOrderNet0;

    const base = effContract(siteForCalc);
    const rate = Number(siteForCalc.retainRate||0)/100;
    const cap  = round(base * rate);
    const triggerBase = displayContract(site);
      const trigger = triggerBase * (Number(siteForCalc.retainTrigger||95)/100);

    setText("pvRetentionBox", `${yen(cap)} 円`);

    const heldBefore = retentionHeldBeforeMonth(siteForCalc, siteId, month);
    const reached = (cumNet >= trigger);

    const retRemain = reached ? Math.max(0, cap - heldBefore) : 0;

    // ★保留金だけ請求：当月出来高0、⑤>=④、保留金残あり
const retentionOnly = (thisMonthNet === 0 && receivedNet >= finalOrderNetEff && retRemain > 0);
// ===== 印刷レイアウト切替 =====
// ★要望：通常月でも②〜⑤を含む「詳細表」を必ず出す（簡易表は使わない）
const simpleMode = false;

const tblD = document.getElementById("pvTableDetailed");
const tblS = document.getElementById("pvTableSimple");
if(tblD && tblS){
  tblD.classList.toggle("hide", simpleMode);
  tblS.classList.toggle("hide", !simpleMode);
}


let billNet = 0;
try{ billNet = Number(calcBillForSite(month, site).billNet||0); }catch(e){ billNet = 0; }

const taxRate = Number(state.settings.taxRate || 10);
    const tax   = round(billNet * (taxRate/100));
    const gross = billNet + tax;

    setText("pvContractNet",   `${yen(contractNet0)} 円`);

    // ★要望：最終月以外（通常月）は ②追加工事・③減額工事 を印字しない（表の形は維持して空欄）
    if(isFinalWork){
      setText("pvLblIncrease",  "② 追加工事（税抜）");
      setText("pvLblReduction", "③ 減額工事（税抜）");
      setText("pvIncreaseNet",  `${yen(increaseNet0)} 円`);
      setText("pvReductionNet", `${yen(reductionNet0)} 円`);
    }else{
      setText("pvLblIncrease",  "　");
      setText("pvLblReduction", "　");
      setText("pvIncreaseNet",  "　");
      setText("pvReductionNet", "　");
    }

    setText("pvFinalOrderNet", `${yen(finalOrderNetEff)} 円`);

    setText("pvReceivedNet",  `${yen(receivedNet)} 円`);
    setText("pvThisMonthNet", `${yen(thisMonthNet)} 円`);
    setText("pvCumNet",       `${yen(cumNet)} 円`);

    setText("pvBillNet", `${yen(billNet)} 円`);
    setText("pvTax",        `${yen(tax)} 円`);
    setText("pvTotalGross", `¥${yen(gross)}`);
  }

  
  // ====== 総括請求書（指定月の現場を横断集計） ======
  function toReiwaYMD(dateStr){
    if(!dateStr) return "—";
    try{
      const d = new Date(dateStr);
      if(isNaN(d.getTime())) return "—";
      const y = d.getFullYear();
      const m = d.getMonth()+1;
      const day = d.getDate();
      const reiwa = y - 2018; // 2019=令和1
      if(reiwa >= 1){
        return `令和${reiwa}年${m}月${day}日`;
      }
      // 令和以前は西暦表示
      return d.toLocaleDateString('ja-JP',{year:'numeric',month:'long',day:'numeric'});
    }catch(e){
      return "—";
    }
  }

  // 指定月の「実際の請求額」を正式な保留金ルールで計算する。
  // 通常月・工事完了月：保留金がある場合は、累計実請求額を通常請求上限で頭打ち。
  // 工事完了月は増減を確定するが、保留金そのものは解除しない。
  // 保留金だけ請求ボタンの場合のみ、残っている保留金を一括請求する。
  function calcBillForSite(month, site){
    const siteId=site.id;
    const rec=getRec(month,siteId);
    if(!rec) return {billNet:0,tax:0,gross:0,isFinalWork:false,retentionOnly:false,targetCum:0};

    const isFinalWork=!!rec.isFinal;
    const calcSite=getSiteForCalc(site,isFinalWork,month);
    const finalOrder=Math.max(0,Number(calcSite.contractNet||0)+Number(calcSite.increaseNet||0)-Number(calcSite.reductionNet||0));
    const trigger=triggerLine(calcSite);
    const hasRetention=Number.isFinite(trigger) && trigger < finalOrder && retentionCap(calcSite)>0;
    const workCum=Math.max(0,Number(sumBeforeMonth(siteId,month)||0)+Number(rec.thisMonthNet||0));

    let billedBefore=0;
    for(const mm of monthListSorted()){
      if(mm>=month) break;
      const rr=getRec(mm,siteId); if(!rr) continue;
      const ps=getSiteForCalc(site,!!rr.isFinal,mm);
      const pFinal=Math.max(0,Number(ps.contractNet||0)+Number(ps.increaseNet||0)-Number(ps.reductionNet||0));
      const pTrigger=triggerLine(ps);
      const pHasRetention=Number.isFinite(pTrigger) && pTrigger < pFinal && retentionCap(ps)>0;
      const pWork=Math.max(0,Number(sumBeforeMonth(siteId,mm)||0)+Number(rr.thisMonthNet||0));
      // 旧データ互換：以前の「出来高0＋工事完了」は保留金のみ請求として扱う。
      const pRetentionOnly = rr.retentionOnlyClaim === true ||
        (rr.retentionOnlyClaim === undefined && !!rr.isFinal && Number(rr.thisMonthNet||0) === 0);
      const pTarget=pRetentionOnly
        ? pFinal
        : (pHasRetention ? Math.min(pWork,pTrigger) : Math.min(pWork,pFinal));
      billedBefore=Math.max(billedBefore,round(pTarget));
    }

    const retentionOnlyExplicit = rec.retentionOnlyClaim === true ||
      (rec.retentionOnlyClaim === undefined && isFinalWork && Number(rec.thisMonthNet||0) === 0);

    // 保留金のみ請求は「未請求残を全部」ではなく、実際の保留金残だけを請求する。
    const retentionClaimRemain = Math.max(0, Math.min(retentionCap(calcSite), finalOrder - billedBefore));
    const targetCum=retentionOnlyExplicit
      ? Math.min(finalOrder, billedBefore + retentionClaimRemain)
      : (hasRetention ? Math.min(workCum,trigger) : Math.min(workCum,finalOrder));
    const billNet=Math.max(0,round(targetCum-billedBefore));
    const retentionOnly=isFinalWork && billNet>0 && Number.isFinite(trigger) && billedBefore>=Math.round(trigger-1);
    const taxRate=Number(state.settings.taxRate||10);
    const tax=round(billNet*(taxRate/100));
    return {billNet,tax,gross:billNet+tax,isFinalWork,retentionOnly,targetCum:round(targetCum),billedBefore:round(billedBefore),workCum:round(workCum),finalOrder:round(finalOrder)};
  }

  // その現場の請求回数（gross>0 の月をカウント）
  function invoiceCountUntil(site, month){
    let c = 0;
    for(const m of monthListSorted()){
      if(m > month) break;
      const r = getRec(m, site.id);
      if(!r) continue;
      const x = calcBillForSite(m, site);
      if(x.gross > 0) c++;
    }
    return c;
  }

  function renderSummary(){
    syncFormToSettings();

    const month = (document.getElementById("sr_month")?.value || "").trim();
    const billDate = (document.getElementById("sr_billDate")?.value || "").trim();

    // 表示反映
    const set = (id, val)=>{ const el=document.getElementById(id); if(el) el.textContent = val; };
    set("svClient", state.settings.clientName || "—");
    set("svMyName", state.settings.myName || "—");
    set("svMyAddr", state.settings.myAddr || "—");
    set("svMyTel",  state.settings.myTel  || "—");
    set("svSigner", state.settings.mySigner || "—");
    set("svBank",   state.settings.bankText || "—");
    set("svDate", billDate ? toReiwaYMD(billDate) : "—");

    const tbody = document.getElementById("svTbody");
    const dbg = document.getElementById("svDebug");
    if(dbg){
      const mcount = monthListSorted().length;
      dbg.textContent = `データ状況：現場 ${state.sites.length}件／月次 ${mcount}ヶ月（キー: ${KEY}）`;
    }
    if(!tbody) return;

    if(!month){
      tbody.innerHTML = `<tr><td colspan="3" class="hint">対象月を選択してください。</td></tr>`;
      set("svSum1","0 円"); set("svSafe","0 円"); set("svSumNet","0 円");
      return;
    }

    const rows = [];
    let sumGross = 0;
    let sumSafe = 0;

    for(const site of state.sites){
      const rec = getRec(month, site.id);
      if(!rec) continue;

      const r = calcBillForSite(month, site);
      if(r.gross <= 0) continue;

      const count = invoiceCountUntil(site, month);
      const timesLabel = (r.isFinalWork ? "工事完了" : `${count}回目`);
      const terms = getEffectiveClientTerms(site);
      const safe = terms.safeEnabled ? round(r.gross * (Number(terms.safeRate||0)/100)) : 0;
      rows.push({name: site.name, timesLabel, gross: r.gross, safe});
      sumGross += r.gross;
      sumSafe += safe;
    }

    if(rows.length === 0){
      tbody.innerHTML = `<tr><td colspan="3" class="hint">この月に請求がある現場はありません。</td></tr>`;
      set("svSum1","0 円"); set("svSafe","0 円"); set("svSumNet","0 円");
      return;
    }

    tbody.innerHTML = rows.map(r=>`
      <tr>
        <td><b>${escapeHtml(r.name)}</b></td>
        <td style="text-align:center; font-weight:900;">${escapeHtml(r.timesLabel)}</td>
        <td class="num">${yen(r.gross)} 円</td>
      </tr>
    `).join("");

    const total = Math.max(0, sumGross - sumSafe);

    set("svSum1",   `${yen(sumGross)} 円`);
    set("svSafe",   `${yen(sumSafe)} 円`);
    set("svSumNet", `${yen(total)} 円`);
  }
function exportData(){
    exportBox.classList.remove("hide");
    exportBox.value = JSON.stringify(state, null, 2);
    exportBox.select();
  }

  // ====== init（4ファイル分割版） ======
  const MS_INVOICE_PAGE = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  function initInvoiceWorkPage(){
    // 分割ページ共通：まず保存済みデータを必ず読み込む
    try{ loadAll(true); }catch(e){ console.warn("保存データ読込:",e); }

    // 月次専用ページは invoice_app の設定画面を持たないため、ここで個別初期化する
    if(document.getElementById("view-monthly") && !document.getElementById("view-settings")){
      try{ migrateRetention(); }catch(e){}
      try{ refreshSiteSelects(); }catch(e){ console.warn("工事選択更新:",e); }
      try{ refreshMonthlyTable(); }catch(e){}
      try{ refreshSiteSummaryAndHistory(); }catch(e){}

      const bind=(id,event,fn)=>{
        const el=document.getElementById(id);
        if(el && !el.dataset.msInvoiceBound){
          el.dataset.msInvoiceBound="1";
          el.addEventListener(event,fn);
        }
      };
      bind("m_month","change",()=>{ refreshMonthlyTable(); refreshSiteSummaryAndHistory(); });
      bind("m_site","change",()=>{ loadMonthlyToForm(); refreshSiteSummaryAndHistory(); });
      bind("m_increaseNet","input",refreshSiteSummaryAndHistory);
      bind("m_reductionNet","input",refreshSiteSummaryAndHistory);
      bind("m_thisMonthNet","input",refreshSiteSummaryAndHistory);
      bind("m_isFinal","change",refreshSiteSummaryAndHistory);
    }

    // invoice_app.html に存在する画面だけ初期化する
    if(document.getElementById("view-settings")){
      try{ syncSettingsToForm(); }catch(e){}
      try{ migrateRetention(); }catch(e){}
      try{ syncSettingsToForm(); }catch(e){}
      try{ refreshSiteTable(); }catch(e){}
      try{ refreshSiteSelects(); }catch(e){}
      try{ refreshMonthlyTable(); }catch(e){}
      try{ refreshSiteSummaryAndHistory(); }catch(e){}
      try{ renderPrint(); }catch(e){}
      try{ renderSummary(); }catch(e){}

      const bind=(id,event,fn)=>{
        const el=document.getElementById(id);
        if(el) el.addEventListener(event,fn);
      };

      bind("m_month","change",()=>{ refreshMonthlyTable(); refreshSiteSummaryAndHistory(); });
      bind("m_site","change",()=>{ loadMonthlyToForm(); refreshSiteSummaryAndHistory(); });
      bind("m_increaseNet","input",refreshSiteSummaryAndHistory);
      bind("m_reductionNet","input",refreshSiteSummaryAndHistory);
      bind("m_thisMonthNet","input",refreshSiteSummaryAndHistory);
      bind("m_isFinal","change",refreshSiteSummaryAndHistory);

      bind("pr_month","change",renderPrint);
      bind("pr_site","change",renderPrint);
      bind("pr_billDate","change",renderPrint);

      bind("sr_month","change",renderSummary);
      bind("sr_billDate","change",renderSummary);
      bind("sr_safeRate","change",renderSummary);
      bind("sr_safeRate","input",renderSummary);

      if(document.getElementById("p_contractNet")){
        try{ updateDisplayContractPreview(); }catch(e){}
      }
    }
  }

  function initInvoiceIndexPage(){
    // index.html は保存データだけ読み込み、ダッシュボードを描画する
    try{
      const raw = localStorage.getItem(KEY);
      if(raw){
        const obj = JSON.parse(raw);
        Object.assign(state.settings, obj.settings || {});
        state.sites = Array.isArray(obj.sites) ? obj.sites : [];
        state.monthly = obj.monthly || {};
      }
    }catch(e){
      console.warn("index data load:", e);
    }
  }

  if(MS_INVOICE_PAGE === "index.html" || MS_INVOICE_PAGE === ""){
    initInvoiceIndexPage();
  }else{
    initInvoiceWorkPage();
  }

  // ====== IndexedDB 共通保存：全HTMLで同じ工事・月次データを再読込 ======
  function applySharedInvoiceState(){
    try{
      const raw = localStorage.getItem(KEY);
      if(!raw) return;
      const obj = JSON.parse(raw);
      Object.assign(state.settings, obj.settings || {});
      state.sites = Array.isArray(obj.sites) ? obj.sites : [];
      state.monthly = obj.monthly || {};

      try{ if(typeof syncSettingsToForm==="function" && document.getElementById("s_myName")) syncSettingsToForm(); }catch(e){}
      try{ if(typeof refreshSiteTable==="function") refreshSiteTable(); }catch(e){}
      try{ if(typeof refreshSiteSelects==="function") refreshSiteSelects(); }catch(e){}
      try{ if(typeof refreshMonthlyTable==="function") refreshMonthlyTable(); }catch(e){}
      try{ if(typeof refreshSiteSummaryAndHistory==="function") refreshSiteSummaryAndHistory(); }catch(e){}
      try{ if(typeof refreshMs4Home==="function") refreshMs4Home(); }catch(e){}
      try{ if(typeof renderPrint==="function" && document.getElementById("view-print")) renderPrint(); }catch(e){}
      try{ if(typeof renderSummary==="function" && document.getElementById("view-summary")) renderSummary(); }catch(e){}

      const sid=localStorage.getItem("ms_invoice_selected_site")||"";
      if(sid){
        const ms=document.getElementById("m_site");
        const ps=document.getElementById("pr_site");
        if(ms && [...ms.options].some(o=>o.value===sid)){ ms.value=sid; try{loadMonthlyToForm();}catch(e){} }
        if(ps && [...ps.options].some(o=>o.value===sid)){ ps.value=sid; try{renderPrint();}catch(e){} }
      }
    }catch(e){ console.warn("共通DB読込:",e); }
  }

  window.addEventListener("msinvoice-storage-ready", applySharedInvoiceState);
  try{
    if(window.MSInvoiceStorage && window.MSInvoiceStorage.ready){
      window.MSInvoiceStorage.ready.then(applySharedInvoiceState);
    }
  }catch(e){}



document.addEventListener("DOMContentLoaded", () => {
  const monthEl = document.getElementById("m_month");
  const siteEl  = document.getElementById("m_site");

  function autoLoadMonthly() {
    const monthlyView = document.getElementById("view-monthly");
    if (!monthlyView || monthlyView.classList.contains("hide")) return;
    if (typeof loadMonthlyToForm === "function") loadMonthlyToForm();
  }

  if (monthEl) {
    monthEl.addEventListener("change", autoLoadMonthly);
    monthEl.addEventListener("input", autoLoadMonthly);
  }
  if (siteEl) siteEl.addEventListener("change", autoLoadMonthly);
});



(function(){
  function addComma(n){
    if (n === null || n === undefined || n === "") return "";
    const num = Number(String(n).replace(/,/g,""));
    if (isNaN(num)) return n;
    return num.toLocaleString("ja-JP");
  }
  function formatText(el){
    const txt = el.textContent || "";
    if (!txt) return;
    if (txt.includes("円")){
      const v = txt.replace(/[^0-9-]/g,"");
      if (v !== "") el.textContent = addComma(v) + " 円";
    } else {
      const v = txt.replace(/[^0-9-]/g,"");
      if (v !== "") el.textContent = addComma(v);
    }
  }
  function formatInput(el){
    if (!el.value) return;
    const raw = String(el.value).replace(/,/g,"");
    let ok = true;
    for (let i=0;i<raw.length;i++){
      const c = raw[i];
      if (!(c>='0' && c<='9') && !(i===0 && c==='-')) { ok=false; break; }
    }
    if (!ok) return;
    el.value = addComma(raw);
  }
  function formatAll(){
    document.querySelectorAll(".num, .amount, .money").forEach(formatText);
    document.querySelectorAll("input.money, input.num, input.amount").forEach(formatInput);
  }
  const origLoad = window.loadMonthlyToForm;
  if (typeof origLoad === "function"){
    window.loadMonthlyToForm = function(){
      origLoad();
      formatAll();
    };
  }
  document.addEventListener("DOMContentLoaded", ()=>setTimeout(formatAll,0));
})();

  // ===== MS interface Ver.2 =====
  function msSiteReceived(siteId){
    return Number(sumAllMonths(siteId) || 0);
  }
  function msSiteBalance(site){
    const finalOrder = Number(displayContract(site) || 0);
    const received = msSiteReceived(site.id);
    return Math.max(0, Math.round(finalOrder - received));
  }
  function updateMsCurrent(siteId){
    const sel = siteId || (typeof m_site!=="undefined" ? m_site.value : "");
    const site = state.sites.find(s=>s.id===sel);
    const n=document.getElementById("msCurrentSite");
    const d=document.getElementById("msCurrentDetail");
    if(!n||!d) return;
    if(!site){
      n.textContent="工事を選択してください";
      d.textContent="未請求工事一覧から「今月の請求」を選ぶと、対象工事へ直接移動します。";
      return;
    }
    const bal=msSiteBalance(site);
    n.textContent=site.name || "（工事名なし）";
    d.textContent=`最終注文金額 ¥${yen(displayContract(site))} ／ 未請求 ¥${yen(bal)}`;
  }
  function goMonthlyFromHome(siteId){
    switchView("monthly");
    refreshSiteSelects();
    if(typeof m_site!=="undefined"){
      m_site.value=siteId;
      m_site.dispatchEvent(new Event("change"));
    }
    updateMsCurrent(siteId);
  }
  function goPrintFromHome(siteId){
    switchView("print");
    refreshSiteSelects();
    if(typeof pr_site!=="undefined"){
      pr_site.value=siteId;
      pr_site.dispatchEvent(new Event("change"));
    }
    renderPrint();
    updateMsCurrent(siteId);
  }
  function refreshMsHome(){
    const pending=[], done=[];
    let pendingTotal=0;
    state.sites.forEach(site=>{
      const received=msSiteReceived(site.id);
      const finalOrder=Number(displayContract(site)||0);
      const balance=Math.max(0,Math.round(finalOrder-received));
      const row={site,received,finalOrder,balance};
      if(balance>0){ pending.push(row); pendingTotal+=balance; }
      else done.push(row);
    });
    const pc=document.getElementById("homePendingCount");
    const pt=document.getElementById("homePendingTotal");
    const dc=document.getElementById("homeDoneCount");
    const pb=document.getElementById("homePendingBadge");
    const db=document.getElementById("homeDoneBadge");
    if(pc) pc.textContent=pending.length;
    if(pt) pt.textContent=yen(pendingTotal);
    if(dc) dc.textContent=done.length;
    if(pb) pb.textContent=`${pending.length}件`;
    if(db) db.textContent=`${done.length}件`;

    const pbody=document.querySelector("#homePendingTable tbody");
    if(pbody){
      pbody.innerHTML="";
      if(!pending.length) pbody.innerHTML='<tr><td colspan="5" class="hint">未請求の工事はありません。</td></tr>';
      pending.forEach(({site,received,finalOrder,balance})=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`<td><b>${escapeHtml(site.name||"")}</b></td>
          <td class="right mono">${yen(finalOrder)} 円</td>
          <td class="right mono">${yen(received)} 円</td>
          <td class="right mono" style="font-weight:900;color:#a65d00;">${yen(balance)} 円</td>
          <td class="right"><button onclick="goMonthlyFromHome('${site.id}')">開く</button></td>`;
        pbody.appendChild(tr);
      });
    }
    const dbody=document.querySelector("#homeDoneTable tbody");
    if(dbody){
      dbody.innerHTML="";
      if(!done.length) dbody.innerHTML='<tr><td colspan="4" class="hint">請求完了した工事はありません。</td></tr>';
      done.forEach(({site,received,finalOrder})=>{
        const tr=document.createElement("tr");
        tr.innerHTML=`<td><b>${escapeHtml(site.name||"")}</b></td>
          <td class="right mono">${yen(finalOrder)} 円</td>
          <td class="right mono">${yen(received)} 円</td>
          <td class="right"><button class="secondary" onclick="goPrintFromHome('${site.id}')">請求書確認</button></td>`;
        dbody.appendChild(tr);
      });
    }
    updateMsCurrent();
  }
  function showMsNotice(){
    if(document.getElementById("msNoticeModal")) return;
    const bg=document.createElement("div");
    bg.id="msNoticeModal";
    bg.className="ms-modal-bg";
    bg.innerHTML=`<div class="ms-modal">
      <div class="ms-modal-h">MS 請求書作成システムからのお知らせ</div>
      <div class="ms-modal-b">
        <b>請求業務を分かりやすくするため、工事を2つに自動分類します。</b><br>
        ・「未請求の工事」には請求残金がある工事を表示します。<br>
        ・請求残金が0円になると「請求完了した工事」へ自動で移動します。<br>
        ・未請求一覧の「今月の請求」から、その工事の月次入力へ直接進めます。<br><br>
        <span style="color:#667;">※請求計算・保存データ・印刷の基本ロジックは従来版を使用しています。</span>
      </div>
      <div class="ms-modal-f"><button onclick="document.getElementById('msNoticeModal').remove()">閉じる</button></div>
    </div>`;
    bg.addEventListener("click",e=>{if(e.target===bg) bg.remove();});
    document.body.appendChild(bg);
  }




document.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>{
    try{
      const currentPage=(location.pathname.split("/").pop()||"index.html").toLowerCase();
      if(currentPage==="index.html" || currentPage===""){
        if(typeof refreshMsHome==="function") refreshMsHome();
        if(typeof refreshMs4Home==="function") refreshMs4Home();
        // home表示はindex.htmlだけで行う
      }
      if(typeof m_site!=="undefined") m_site.addEventListener("change",()=>updateMsCurrent(m_site.value));
      if(typeof pr_site!=="undefined") pr_site.addEventListener("change",()=>updateMsCurrent(pr_site.value));
    }catch(e){ console.error("MS interface init:",e); }
  },80);
});

  // ===== MS積算システム準拠ホーム Ver.4 =====
  let ms4SelectedSiteId = "";
  let ms4ListMode = "pending";


  function sumActualBilled(siteId){
    const site=state.sites.find(s=>s.id===siteId);
    if(!site) return 0;
    let sum=0;
    for(const m of monthListSorted()){
      if(!getRec(m,siteId)) continue;
      try{ sum += Number(calcBillForSite(m,site).billNet||0); }catch(e){}
    }
    return Math.max(0,round(sum));
  }
  function ms4Received(siteId){
    return Number(sumActualBilled(siteId) || 0);
  }
  function ms4Balance(site){
    return Math.max(0, Math.round(Number(displayContract(site)||0) - ms4Received(site.id)));
  }
  function ms4RetentionWaiting(site){
    const order = Math.max(0, Number(displayContract(site)||0));
    const billed = ms4Received(site.id);
    const trig = triggerLine(site);
    const cap = retentionCap(site);
    return cap>0 && Number.isFinite(trig) && billed >= Math.round(trig-1) && billed < order;
  }

  function ms4SelectSite(siteId){
    ms4SelectedSiteId = siteId || "";
    const site = state.sites.find(s=>s.id===ms4SelectedSiteId);
    const n=document.getElementById("ms4CurrentName");
    const o=document.getElementById("ms4CurrentOrder");
    const b=document.getElementById("ms4CurrentBalance");
    if(!n||!o||!b) return;
    if(!site){
      n.textContent="工事を選択してください";
      o.textContent="—";
      b.textContent="—";
      return;
    }
    n.textContent=site.name || "（工事名なし）";
    o.textContent=yen(displayContract(site))+" 円";
    b.textContent=yen(ms4Balance(site))+" 円";
    refreshMs4Home();
  }
  function ms4ShowList(mode){
    ms4ListMode = mode === "done" ? "done" : "pending";
    const p=document.getElementById("ms4PendingTab");
    const d=document.getElementById("ms4DoneTab");
    if(p){p.className=ms4ListMode==="pending"?"active":"plain";}
    if(d){d.className=ms4ListMode==="done"?"active":"plain";}
    refreshMs4Home();
  }
  function refreshMs4Home(){
    const list=document.getElementById("ms4SiteList");
    if(!list) return;
    const pending=[],done=[];
    state.sites.forEach(site=>{
      const received=ms4Received(site.id);
      const order=Number(displayContract(site)||0);
      const balance=Math.max(0,Math.round(order-received));
      const row={site,received,order,balance};
      (balance>0?pending:done).push(row);
    });
    const sm=document.getElementById("ms4ListSummary");
    if(sm) sm.textContent=`未請求 ${pending.length}件 ／ 完了 ${done.length}件`;

    const rows = ms4ListMode==="done" ? done : pending;
    list.innerHTML="";
    if(!rows.length){
      list.innerHTML=`<div class="ms4-empty">${ms4ListMode==="done"?"請求完了した工事はありません。":"未請求の工事はありません。"}</div>`;
    } else {
      rows.forEach(({site,received,order,balance})=>{
        const item=document.createElement("div");
        item.className="ms4-site-item";
        const selected=site.id===ms4SelectedSiteId;
        item.innerHTML=`
          <div>
            <div class="ms4-site-name">${escapeHtml(site.name||"")}${selected?' <span class="current-mark">選択中</span>':''}</div>
            <div class="ms4-site-meta">
              最終注文 ${yen(order)} 円　／　請求済 ${yen(received)} 円
              ${ms4ListMode==="pending"?(ms4RetentionWaiting(site)?`　／　<span class="ms4-site-amt">保留金待ち ${yen(balance)} 円</span>`:`　／　<span class="ms4-site-amt">残 ${yen(balance)} 円</span>`):""}
            </div>
          </div>
          <div class="ms4-site-buttons">
            <button class="ms4-open" onclick="ms4SelectSite('${site.id}')">選択</button>
            ${ms4ListMode==="pending"?`<button class="ms4-subbtn" onclick="MSInvoiceOpenMonthlyWithMonth('${site.id}')">請求</button>`:""}
          </div>`;
        list.appendChild(item);
      });
    }

    // If nothing selected, select first pending site for convenience only when possible.
    if(!ms4SelectedSiteId){
      const first = pending[0] || done[0];
      if(first){
        ms4SelectedSiteId = first.site.id;
        const n=document.getElementById("ms4CurrentName");
        const o=document.getElementById("ms4CurrentOrder");
        const b=document.getElementById("ms4CurrentBalance");
        if(n)n.textContent=first.site.name||"（工事名なし）";
        if(o)o.textContent=yen(first.order)+" 円";
        if(b)b.textContent=yen(first.balance)+" 円";
      }
    }
  }
  function ms4RequireSite(){
    if(ms4SelectedSiteId && state.sites.some(s=>s.id===ms4SelectedSiteId)) return true;
    alert("左の工事一覧から工事を選択してください。");
    return false;
  }
  function ms4GoMonthly(){
    if(!ms4RequireSite()) return;
    switchView("monthly");
    refreshSiteSelects();
    if(typeof m_site!=="undefined"){
      m_site.value=ms4SelectedSiteId;
      m_site.dispatchEvent(new Event("change"));
    }
  }
  function ms4GoPrint(){
    if(!ms4RequireSite()) return;
    switchView("print");
    refreshSiteSelects();
    if(typeof pr_site!=="undefined"){
      pr_site.value=ms4SelectedSiteId;
      pr_site.dispatchEvent(new Event("change"));
    }
    renderPrint();
  }



/* ===== 4ファイル分割版 ページ間連携 ===== */
(function(){
  const page=(location.pathname.split('/').pop()||'index.html').toLowerCase();
  const getSid=()=>localStorage.getItem("ms_invoice_selected_site")||"";
  const setSid=id=>{ if(id) localStorage.setItem("ms_invoice_selected_site",id); };

  const originalSwitch=window.switchView;
  window.MSInvoiceNav=function(view,siteId){
    if(siteId) setSid(siteId);
    if(view==="home"){ location.href="index.html"; return; }
    if(view==="settings" || view==="master"){ location.href="invoice_master.html"; return; }
    if(view==="monthly"){ location.href="invoice_monthly.html"; return; }
    localStorage.setItem("ms_invoice_open_view",view||"sites");
    location.href="invoice_app.html";
  };

  window.switchView=function(view){
    if(document.getElementById("view-"+view) && typeof originalSwitch==="function"){
      return originalSwitch(view);
    }
    return MSInvoiceNav(view);
  };

  const originalSelect=window.ms4SelectSite;
  window.ms4SelectSite=function(id){
    setSid(id);
    if(typeof originalSelect==="function"){ try{ originalSelect(id); }catch(e){} }
  };

  window.ms4GoMonthly=function(){
    const id=(typeof ms4SelectedSiteId!=="undefined"&&ms4SelectedSiteId)||getSid();
    if(!id){ alert("左の工事一覧から工事を選択してください。"); return; }
    setSid(id);
    location.href="invoice_monthly.html";
  };

  window.ms4GoPrint=function(){
    const id=(typeof ms4SelectedSiteId!=="undefined"&&ms4SelectedSiteId)||getSid();
    if(!id){ alert("左の工事一覧から工事を選択してください。"); return; }
    MSInvoiceNav("print",id);
  };

  document.addEventListener("DOMContentLoaded",()=>{
    setTimeout(()=>{
      try{
        if(page==="invoice_app.html"){
          const view=localStorage.getItem("ms_invoice_open_view")||"monthly";
          const sid=getSid();
          if(typeof originalSwitch==="function") originalSwitch(view);
          if(typeof refreshSiteSelects==="function") refreshSiteSelects();
          if(sid && view==="monthly" && typeof m_site!=="undefined"){
            m_site.value=sid; m_site.dispatchEvent(new Event("change"));
          }
          if(sid && view==="print" && typeof pr_site!=="undefined"){
            pr_site.value=sid; pr_site.dispatchEvent(new Event("change"));
            if(typeof renderPrint==="function") renderPrint();
          }
        }
        if(page==="index.html" && getSid()){
          if(typeof ms4SelectedSiteId!=="undefined") ms4SelectedSiteId=getSid();
          if(typeof refreshMs4Home==="function") refreshMs4Home();
        }
      }catch(e){ console.warn(e); }
    },100);
  });
})();


/* ===== 分割版 最終ブートストラップ ===== */
document.addEventListener("DOMContentLoaded", ()=>{
  const page=(location.pathname.split("/").pop()||"index.html").toLowerCase();

  if(page==="index.html" || page===""){
    try{
      if(typeof refreshMs4Home==="function") refreshMs4Home();
    }catch(e){ console.warn("home refresh:",e); }
  }

  if(page==="invoice_app.html"){
    const view=localStorage.getItem("ms_invoice_open_view") || "sites";
    const sid=localStorage.getItem("ms_invoice_selected_site") || "";
    setTimeout(()=>{
      try{
        switchView(view);
        if(sid){
          if(typeof refreshSiteSelects==="function") refreshSiteSelects();
          const ms=document.getElementById("m_site");
          const ps=document.getElementById("pr_site");
          if(view==="monthly" && ms){
            ms.value=sid;
            ms.dispatchEvent(new Event("change"));
          }
          if(view==="print" && ps){
            ps.value=sid;
            ps.dispatchEvent(new Event("change"));
            if(typeof renderPrint==="function") renderPrint();
          }
        }
      }catch(e){ console.warn("app open:",e); }
    },50);
  }
});


/* ===== 分割版：indexからinvoice_appへ直接移動 ===== */
window.MSInvoiceOpen = function(view){
  if(view==="settings" || view==="master"){
    window.location.href = "invoice_master.html";
    return;
  }
  if(view==="monthly"){
    window.location.href = "invoice_monthly.html";
    return;
  }
  try{
    localStorage.setItem("ms_invoice_open_view", view || "sites");
  }catch(e){}
  window.location.href = "invoice_app.html";
};



/* ===== invoice_app 起動時の指定画面表示を最終保証 ===== */
document.addEventListener("DOMContentLoaded", function(){
  const page=(location.pathname.split("/").pop()||"").toLowerCase();
  if(page!=="invoice_app.html") return;

  setTimeout(function(){
    const view=localStorage.getItem("ms_invoice_open_view") || "sites";
    const ids=["settings","sites","monthly","print","summary"];
    ids.forEach(function(v){
      const el=document.getElementById("view-"+v);
      if(el) el.classList.toggle("hide", v!==view);
    });

    document.querySelectorAll(".tab").forEach(function(b){
      b.classList.toggle("active", b.dataset.view===view);
    });

    try{
      if(view==="sites"){
        if(typeof refreshSiteTable==="function") refreshSiteTable();
        if(typeof refreshSiteSelects==="function") refreshSiteSelects();
      }else if(view==="monthly"){
        if(typeof refreshMonthlyTable==="function") refreshMonthlyTable();
        if(typeof refreshSiteSummaryAndHistory==="function") refreshSiteSummaryAndHistory();
      }else if(view==="print"){
        if(typeof refreshSiteSelects==="function") refreshSiteSelects();
        if(typeof renderPrint==="function") renderPrint();
      }else if(view==="summary"){
        if(typeof renderSummary==="function") renderSummary();
      }else if(view==="settings"){
        if(typeof syncSettingsToForm==="function") syncSettingsToForm();
      }
    }catch(e){
      console.warn("指定画面初期化:",e);
    }
  },120);
});



/* ===== Windows file:// 対応：ページ間の選択工事・画面指定はURLでも引き継ぐ ===== */
(function(){
  function param(name){
    try{return new URLSearchParams(location.search).get(name)||"";}catch(e){return "";}
  }
  function currentSiteId(){
    const fromUrl=param("site");
    if(fromUrl) return fromUrl;
    try{
      if(typeof ms4SelectedSiteId!=="undefined" && ms4SelectedSiteId) return ms4SelectedSiteId;
    }catch(e){}
    try{return localStorage.getItem("ms_invoice_selected_site")||"";}catch(e){return "";}
  }
  function withParams(file,view,site){
    const p=new URLSearchParams();
    if(view) p.set("view",view);
    if(site) p.set("site",site);
    const q=p.toString();
    return file+(q?"?"+q:"");
  }

  // URLから受け取った値を、そのページ内の既存処理にも渡す。
  document.addEventListener("DOMContentLoaded",function(){
    const site=param("site"), view=param("view"), month=param("month");
    try{ if(site) localStorage.setItem("ms_invoice_selected_site",site); }catch(e){}
    try{ if(view) localStorage.setItem("ms_invoice_open_view",view); }catch(e){}

    if(site || month){
      setTimeout(function(){
        try{
          // 月次請求では、URLで受け取った請求月を最初に1回だけ設定する。
          // その後に工事を選び、既存の loadMonthlyToForm() を通常どおり通す。
          const monthEl=document.getElementById("m_month");
          if(monthEl && /^\d{4}-\d{2}$/.test(month)){
            monthEl.value=month;
          }

          if(site){
            if(typeof ms4SelectedSiteId!=="undefined") ms4SelectedSiteId=site;
            if(typeof refreshMs4Home==="function") refreshMs4Home();
            if(typeof refreshSiteSelects==="function") refreshSiteSelects();
            const m=document.getElementById("m_site");
            if(m && [...m.options].some(o=>o.value===site)){
              m.value=site;
              try{loadMonthlyToForm();}catch(e){}
              try{refreshSiteSummaryAndHistory();}catch(e){}
            }
            const pr=document.getElementById("pr_site");
            if(pr && [...pr.options].some(o=>o.value===site)){
              pr.value=site;
              try{renderPrint();}catch(e){}
            }
          }
        }catch(e){console.warn("URL工事・請求月選択:",e);}
      },180);
    }
  });

  window.MSInvoiceOpen=function(view){
    const site=currentSiteId();
    if(view==="settings" || view==="master"){
      location.href=withParams("invoice_master.html","",site); return;
    }
    if(view==="monthly"){
      location.href=withParams("invoice_monthly.html","",site); return;
    }
    location.href=withParams("invoice_app.html",view||"sites",site);
  };

  window.MSInvoiceNav=function(view,siteId){
    const site=siteId||currentSiteId();
    if(view==="home"){ location.href=withParams("index.html","",site); return; }
    if(view==="settings" || view==="master"){ location.href=withParams("invoice_master.html","",site); return; }
    if(view==="monthly"){ location.href=withParams("invoice_monthly.html","",site); return; }
    location.href=withParams("invoice_app.html",view||"sites",site);
  };

  window.ms4GoMonthly=function(){
    const site=currentSiteId();
    if(!site){alert("左の工事一覧から工事を選択してください。");return;}
    location.href=withParams("invoice_monthly.html","",site);
  };

  window.ms4GoPrint=function(){
    const site=currentSiteId();
    if(!site){alert("左の工事一覧から工事を選択してください。");return;}
    location.href=withParams("invoice_app.html","print",site);
  };
})();
