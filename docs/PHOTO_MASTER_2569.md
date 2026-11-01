# RTAFNC_ONE PHOTO MASTER 2569

สถานะ: ACTIVE  
ปีการศึกษา: 2569  
Primary Key: `student_code_7` (รหัสนักเรียน 7 หลัก)  
Owner boundary: Identity / Photo Asset only — **ห้ามบันทึกข้อมูลวินิจฉัย การรักษา ยา หรือข้อมูลสุขภาพใน manifest นี้**

## Source of Truth

รูปต้นฉบับคงอยู่ใน Google Drive ของแต่ละชั้นปี ไม่ทำสำเนาซ้ำโดยไม่จำเป็น ระบบกลางอ้างถึงรูปด้วยรหัสนักเรียน 7 หลักและ File ID ของ Google Drive

| ชั้นปี | Prefix รหัส | Source Folder ID |
|---|---|---|
| ปี 1 | `69` | `1JLbTNb3NuRH8NA8BWiXKj0ENvhZ4uqw_` |
| ปี 2 | `68` | `1YrstAJO2XpDSx9sPiXt_h7Mv3Sl78CoZ` |
| ปี 3 | `67` | `1Napj4NNRwwjRGpUlvNuM9moNXhCsBvaY` |
| ปี 4 | `66` | `1i7R8qm-CvqptQqE-Y99N1ZClwwWBb0pD` |

Central folder: `1tqsLefEYJTA9B-QOVjWMKumy2gnvhUvY`  
Central index spreadsheet: `13IDNOyrpODZXr1Bo3HO8DakpUj0XcQoREE_5CzP6LIg`

## Naming Contract

```text
<student_code_7> <rank_or_title> <full_name>.<ext>
```

กติกา:
1. ระบบยึด `student_code_7` เป็น key หลักเสมอ
2. ห้ามจับคู่รูปด้วยชื่อบุคคลอย่างเดียว
3. ชื่อไฟล์ที่ไม่มี `นพอ.` ยังใช้ได้ ถ้ามีรหัส 7 หลักถูกต้อง
4. ไฟล์เอกสารต้องถูกตัดออกด้วย MIME filter `image/*`
5. ถ้าหาไม่เจอหรือเจอหลายไฟล์ให้ fail closed และเข้าคิวตรวจ

## Resolver Contract

```text
input: student_code_7
validate: ^[0-9]{7}$
route:
  69 -> Year 1 folder
  68 -> Year 2 folder
  67 -> Year 3 folder
  66 -> Year 4 folder
query:
  parent = routed folder
  mimeType startsWith image/
  filename startsWith student_code_7
result:
  1 match  -> OK
  0 match  -> PHOTO_MISSING
  >1 match -> PHOTO_REVIEW_REQUIRED
```

Health Master join:

```text
ServiceRecipients.NumberOrOrder == student_code_7
```

## Web / LIFF Policy

- Client ไม่รับ Google Drive credential
- Client ไม่ query Health Master โดยตรง
- Backend ที่ผ่าน session authorization เป็นผู้ resolve รูป
- Photo registry ไม่มี diagnosis/treatment/medication
- รูป HEIF หรือรูปใหญ่ให้สร้าง JPEG/WebP derivative สำหรับเว็บโดยคงต้นฉบับไว้

## Known Exceptions

- ปี 1: `หนังสือเซ็นยินยอม.pdf` — exclude จาก lookup
- ปี 2: `6803936` เป็น HEIF — ต้องมี web derivative
- ปี 2: `6803913` label variant — ยอมรับด้วยรหัส 7 หลัก
- ปี 3: `6703878` label variant — ยอมรับด้วยรหัส 7 หลัก
- ปี 3: `6703866` PNG ขนาดใหญ่ — สร้าง web derivative
- ปี 4: `6603756`, `6603792`, `6603807` label variant — ยอมรับด้วยรหัส 7 หลัก

## Permission Baseline

ตรวจพบ source folders ทั้ง 4 ชั้นปีแชร์แบบ anyone-with-link writer ณ วันที่ตรวจ จึงต้องจัดเป็น Security Review Required. ระยะยาวควรให้ owner/authorized staff เป็น Writer และให้ LIFF/Web อ่านผ่าน backend เท่านั้น

## Health Master Settings

```text
PHOTO_MODULE_ENABLED = TRUE
PHOTO_MASTER_SPREADSHEET_ID = 13IDNOyrpODZXr1Bo3HO8DakpUj0XcQoREE_5CzP6LIg
PHOTO_MASTER_FOLDER_ID = 1tqsLefEYJTA9B-QOVjWMKumy2gnvhUvY
PHOTO_LOOKUP_KEY = ServiceRecipients.NumberOrOrder
PHOTO_ACADEMIC_YEAR = 2569
PHOTO_ACCESS_MODE = AUTHORIZED_SERVER_LOOKUP
```

Generated/updated: 2026-11-01 (Asia/Bangkok)
