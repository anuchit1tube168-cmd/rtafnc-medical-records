# RTAFNC Health Ops — Confirmed System Blueprint

## Outcome
ระบบกลางสำหรับงานสุขภาพ นพอ. ที่รับข้อความรายงานแบบเดิมจาก LINE/เว็บ แล้วแปลงเป็นข้อมูลโครงสร้าง ติดตามเคสย้อนหลัง และสร้าง Infographic Freestyle จาก Master Template โดยใช้รูปจริงของนักเรียนเท่านั้น

## Users / RBAC
- **ADMIN / อาจารย์ปกครอง**: ดูและแก้ทุกเคส, อนุมัติ Final, จัดการ Master/Template, Export
- **REPORTER / หัวหน้าชั้น**: ส่งรายงาน, สร้าง Draft, ติดตามเคสตามสิทธิ์ชั้นปี
- **VIEWER / ผู้บังคับบัญชา**: Dashboard/สรุปที่ได้รับอนุญาต, read-only

Role ตรวจฝั่ง Server เท่านั้น

## Event model
ประเภท Health Event:
- ILLNESS
- ACCIDENT
- HOSPITAL_REFERRAL
- EMERGENCY
- FOLLOW_UP

Lifecycle:
`RECEIVED → FOLLOWING → HOSPITAL → WAITING_DOCTOR → TREATMENT → RETURNED → CLOSED`

ทุกการเปลี่ยนสถานะต้องเก็บ Event Update/Audit ไม่ overwrite ประวัติเดิมแบบไร้ร่องรอย

## Ingestion workflow
1. Paste ข้อความ หรือรับจาก LINE OA/LIFF
2. เก็บ `raw_text` แบบ immutable
3. Parse แบบ deterministic/AI-assisted โดยห้ามสร้างข้อมูลทางการแพทย์ที่ไม่มีต้นฉบับ
4. Match Student ด้วย NPO_ID 7 หลักก่อน ชื่อเต็มเป็นอันดับรอง
5. Match รูปจริงใน Authoritative Drive folder
6. Review/แก้ parsed data
7. บันทึก `approved_data`
8. สร้าง Draft แยกตามชั้นปี
9. Admin Approve
10. Export PNG/PDF/CSV และบันทึก Drive link

## Real Photo / Renderer Guard
Production renderer ต้องเป็น deterministic compositor:

`MASTER_TEMPLATE + APPROVED_DATA + REAL_DRIVE_PHOTO → DICUT → COMPOSITE → FINAL`

ห้ามส่งรูปนักเรียนเข้า Image Generation
ห้าม AI สร้าง/เปลี่ยนหน้า ชุด ผม สีผิว หรือบุคคลทดแทน
หากไม่พบรูปให้สถานะ `PHOTO_FAILED / NEEDS_REVIEW` และห้าม Final

รายงานหลายชั้นปีต้องสร้าง Infographic แยกชั้นปีเสมอ

## Dashboard
Today Command Center ต้องมี:
- ผู้ป่วยวันนี้
- แยกชั้นปี
- ส่ง รพ. / รอผลแพทย์
- เคสยังไม่ปิด
- Follow-up วันนี้ / overdue
- Pending infographic approvals
- Trend 7 วัน / 30 วัน
- กลุ่มอาการ/วินิจฉัยที่พบบ่อย

## Search / Timeline
ค้นได้จาก:
- ชื่อ / NPO_ID
- ชั้นปี
- วันที่
- ประเภทเหตุ
- อาการ / วินิจฉัย
- สถานะ
- โรงพยาบาล
- ยา / การรักษา

Student Profile แสดง Timeline ของ Health Events, Referrals, Follow-ups และ Generated Files ตามสิทธิ์

## Follow-up rules
- Hospital / ER / Accident → follow-up ภายใน 24 ชม.
- เคสทั่วไปยังไม่ปิด → เตือนวันถัดไป
- overdue แสดงบน Dashboard

## Data tables
- Students
- Users
- ReportBatches
- HealthEvents
- EventUpdates
- Treatments
- FollowUps
- Templates
- GeneratedFiles
- AuditLogs
- RenderJobs

## Data states
Parser field status:
- EXACT
- INFERRED_FORMAT
- MISSING
- NEEDS_REVIEW

AI ห้ามเดา diagnosis, medication, pain score หรือผลแพทย์

## Architecture
`Cloudflare UI → Cloudflare Worker/API → HMAC GAS Bridge → Google Sheets + Google Drive`

Browser ห้ามเข้าถึง Google Sheets/Drive โดยตรง

Authentication:
- Admin/อาจารย์: Google Workspace
- Reporter: LINE LIFF
- server-side identity binding + RBAC

## Failure handling
Pipeline:
`RECEIVED → PARSED → MATCHED → RENDERING → DRAFT_READY → APPROVED`

Failure states:
- PARSE_FAILED
- PHOTO_FAILED
- RENDER_FAILED

Retry เฉพาะขั้นได้โดย Health Event ไม่หาย

## Duplicate protection
ใช้ `source_message_id + reporter + timestamp + student + event fingerprint`

เมื่อคล้ายเคสเดิม ให้เลือก Update existing หรือ Create new

## Privacy
- Least privilege
- เบอร์โทรใน Infographic mask เป็นค่าเริ่มต้น
- ห้าม public Drive links
- Audit สำคัญ: View/Edit/Approve/Export
- Soft delete + restore workflow

## Environments
`DEV → STAGING/UAT → PRODUCTION`

ข้อมูลจริงอยู่ Production เท่านั้น
STAGING ใช้ข้อมูลจำลอง
Production write ห้ามเปิดก่อน UAT ผ่าน

## MVP acceptance
ต้องผ่านเส้นทางเต็ม:
`LINE/Paste → Parse → Match Student → Real Photo → Split Class Year → Freestyle Draft → Approve → Drive → Dashboard → Search → Follow-up → Export`

ต้องทดสอบอย่างน้อย:
- 1 คน
- 3 คน
- หลายชั้นปีในข้อความเดียว
- ส่งโรงพยาบาล
- รูปไม่พบ
- duplicate report
- renderer failure
