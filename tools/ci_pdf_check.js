// ios-check だけで使う：起動の数秒後に、架空の書類から PDF を作り、結果を console に出す（成功なら CI_PDF_OK）
setTimeout(async () => {
  try {
    const C = window.SeikyushoCore, Paper = window.SeikyushoPaper;
    const raw = (await window.Capacitor.Plugins.Preferences.get({ key: "seikyusho-app-v1" })).value;
    const data = JSON.parse(raw);
    const doc = data.docs[0];
    const html = Paper.pdfDocument(Paper.paperHtml(doc, data.me, { color: "navy", rounding: "floor", seal: data.settings.seal }));
    const r = await window.Capacitor.Plugins.SeikyushoPdf.makePdf({ html, fileName: Paper.pdfFileName(doc) });
    console.log("CI_PDF_OK pages=" + r.pages + " path=" + r.path);
  } catch (e) {
    console.log("CI_PDF_FAIL " + (e && e.message));
  }
}, 8000);
