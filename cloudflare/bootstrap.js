/**
 * ตั้งค่าเริ่มต้นของสะพานครั้งเดียว (One-time installer)
 *
 * เรียกได้เฉพาะผ่าน Apps Script API ของเจ้าของโปรเจกต์เท่านั้น
 * เพราะชื่อฟังก์ชันนี้ไม่ได้อยู่ในรายการเมธอดที่ Cloudflare Worker เรียกได้
 * ต้องลบบรรทัด if (props.getProperty('GAS_BRIDGE_SECRET')) ... ออกก่อนรันครั้งแรก
 * แล้วใส่กลับหลังตั้งค่าเสร็จ เพื่อไม่ให้รันซ้ำได้
 */
function configureBridge(bridgeSecret, spreadsheetId) {
  const props = PropertiesService.getScriptProperties();
  if (typeof bridgeSecret !== 'string' || bridgeSecret.length < 32) throw new Error('รหัสลับสั้นเกินไป');
  if (typeof spreadsheetId !== 'string' || !/^[a-zA-Z0-9-_]{20,}$/.test(spreadsheetId)) throw new Error('รหัสฐานข้อมูลไม่ถูกต้อง');
  props.setProperties({
    GAS_BRIDGE_SECRET: bridgeSecret,
    SPREADSHEET_ID: spreadsheetId,
    CF_NOTIFICATIONS_ENABLED: 'FALSE'
  }, true);
  return { ok: true };
}
