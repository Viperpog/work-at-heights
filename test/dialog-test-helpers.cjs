// Other regression suites previously dismissed native notices. Exercise the real
// branded notice button instead; recovery/reset decisions are never auto-chosen.
async function acceptNotices(contents) {
  await contents.executeJavaScript(`{
    const dismissNotice=()=>{
      const dialog=document.getElementById('wahDialog');
      if(!dialog?.open || dialog.dataset.kind!=='notice')return;
      if(document.getElementById('wahDialogPrimary').textContent.includes('Choose Another CSV')) {
        dialog.dispatchEvent(new Event('cancel',{cancelable:true}));
      } else document.getElementById('wahDialogPrimary').click();
    };
    new MutationObserver(dismissNotice).observe(document.getElementById('wahDialog'),{attributes:true,attributeFilter:['open']});
    window.alert=()=>{throw Error('Unexpected native alert');};
    window.confirm=()=>{throw Error('Unexpected native confirm');};
    dismissNotice();
  }`, true);
}
module.exports = { acceptNotices };
