// Explicit RPC surface; maintenance/seed/import helpers are never exposed.
export const publicMethods = ['loginUser', 'isDemoEnabled', 'getLiffConfig'];
export const studentMethods = [
  'lookupStudentByStudentId', 'submitLiffSelfCheckin', 'getLiffBindingStatus',
  'bindLiffStudent', 'submitLiffConsent', 'getMyLiffProfile', 'requestStudentPdf',
  'requestStudentConsentPdf'
];
export const staffMethods = [
  'getLineBindings', 'saveLineBinding', 'revokeLineBinding', 'getConsentForms',
  'exportStudentPdf', 'exportStudentConsentPdf', 'pdfHealthCheck',
  'getCurrentUser', 'logoutUser', 'getSettings', 'getDashboardData',
  'getServiceRecipients', 'getServiceRecipientById', 'saveServiceRecipient',
  'updateServiceRecipientStatus', 'getVisits', 'getVisitById', 'saveVisit', 'cancelVisit',
  'saveVitals', 'saveAssessment', 'saveTreatment', 'getMedicines', 'saveMedicine',
  'receiveMedicineStock', 'adjustMedicineStock', 'getInventoryTransactions',
  'dispenseMedicine', 'cancelDispensingAndReturnStock', 'saveContactNotification',
  'getContactNotifications', 'getReferrals', 'saveReferral', 'getFollowUps', 'saveFollowUp',
  'getReports', 'exportReportCsv', 'getUsers', 'saveUser', 'changeUserPassword',
  'updateUserStatus', 'saveSettings', 'getAuditLogs', 'exportAuditLogsCsv',
  'resolveStudentPhoto', 'getRecipientPhoto', 'auditPhotoMaster', 'syncPhotoMasterIndex'
];
export const methods = [...publicMethods, ...studentMethods, ...staffMethods];
