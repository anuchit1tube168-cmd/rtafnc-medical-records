# RTAFNC Health Ops — MVP

ระบบกลางสำหรับรับรายงานสุขภาพ นพอ. → Parse → Match Student → ดึงรูปจริงจาก Google Drive → DICUT แบบ non-generative → แยกชั้นปี → Render Freestyle Draft → Admin Approve → เก็บข้อมูล/ค้นย้อนหลัง/ติดตาม/Export

## สถานะ

- Environment: **STAGING**
- Production write: **OFF**
- Staging UI: `rtafnc-health-ops-staging` บน Cloudflare Workers
- Google Sheets staging database ถูกสร้างแยกจาก Production แล้ว
- ห้ามใช้ข้อมูลสุขภาพจริงใน STAGING จนกว่า UAT และ RBAC จะผ่าน

## Guardrails บังคับ

1. บุคคลต้องใช้รูปจริงจาก Google Drive เท่านั้น
2. รูปนักเรียนใช้ DICUT / remove-background แบบ non-generative เท่านั้น
3. ห้าม AI สร้างหรือแก้ใบหน้า เครื่องแบบ ทรงผม สีผิว หรือบุคคลทดแทน
4. ถ้าหารูปจริงไม่พบ ให้ `PHOTO_FAILED / NEEDS_REVIEW` และห้าม Final
5. รายงานที่มีหลายชั้นปีต้องแยก Infographic ต่อชั้นปีเสมอ
6. Auto Draft ได้ แต่ Final/Publish ต้อง Admin/อาจารย์ปกครองอนุมัติ
7. AI/Parser ห้ามเดาวินิจฉัย ยา Pain Score หรือผลแพทย์

## Data model (Google Sheets)

- `Students`
- `Users`
- `ReportBatches`
- `HealthEvents`
- `EventUpdates`
- `Treatments`
- `FollowUps`
- `Templates`
- `GeneratedFiles`
- `AuditLogs`
- `RenderJobs`

`student_id` ใช้ NPO_ID 7 หลักเป็นคีย์หลักของนักเรียน และ Health Event เก็บอ้างอิง `student_id` แทนการทำสำเนาข้อมูลคนซ้ำทุกครั้ง

## Pipeline

`RECEIVED → PARSED → MATCHED → RENDERING → DRAFT_READY → APPROVED`

Failure states:

`PARSE_FAILED / PHOTO_FAILED / RENDER_FAILED`

ทุกขั้นต้อง Retry ได้โดยไม่ทำ Health Event หาย

## Template Registry

ตัวอย่างชื่อเวอร์ชัน:

- `HEALTH-FREESTYLE-Y1-1P-v1.0`
- `HEALTH-FREESTYLE-Y1-3P-v1.0`
- `HEALTH-FREESTYLE-Y4-1P-v1.0`

Renderer Production ต้อง deterministic: **Master Template + Approved Data + Real Drive Photo** เท่านั้น

## Production integration ที่ต้องผูกต่อ

Cloudflare Worker → HMAC Google Apps Script Bridge → Google Sheets + Google Drive

ห้าม Browser ติดต่อ Sheets/Drive โดยตรง และห้าม commit Token/Secret/Spreadsheet ID ที่ใช้ Production ลง repository
