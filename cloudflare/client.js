// Compatibility adapter for the existing UI; all calls now use same-origin Workers RPC.
(function () {
  function runner(success, failure) {
    return new Proxy({}, { get(_target, method) {
      if (method === 'withSuccessHandler') return callback => runner(callback, failure);
      if (method === 'withFailureHandler') return callback => runner(success, callback);
      return async (...args) => {
        try {
          let idToken;
          if (['lookupStudentByStudentId', 'submitLiffSelfCheckin'].includes(method)) {
            if (!window.liff || !liff.isLoggedIn()) throw new Error('กรุณาเข้าสู่ระบบ LINE ก่อนใช้งาน');
            idToken = liff.getIDToken();
          }
          const response = await fetch('/api/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ method, args, idToken }), cache: 'no-store' });
          const result = await response.json();
          if (!response.ok || !result.ok) throw new Error(result.error || 'ไม่สามารถดำเนินการได้');
          if (success) success(result.data);
        } catch (error) { if (failure) failure(error); else window.showToast?.(error.message, 'danger'); }
      };
    } });
  }
  window.google = { script: { run: runner() } };
})();
