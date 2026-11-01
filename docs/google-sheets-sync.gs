// Google Apps Script for the Laporan IPL -> Google Sheets sync
// (see syncYearToSheet in src/lib/googleSheets.ts).
//
// Setup: in the target spreadsheet, Extensions > Apps Script, paste this,
// set SECRET to a long random string (same value as the Vercel env var
// GOOGLE_SHEETS_WEBHOOK_SECRET), then Deploy > New deployment > Web app,
// Execute as: Me, Who has access: Anyone. Put the /exec URL in
// GOOGLE_SHEETS_WEBHOOK_URL.

const SECRET = "GANTI_DENGAN_KODE_RAHASIA";

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return ContentService.createTextOutput("unauthorized");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.tab) || ss.insertSheet(body.tab);
  const values = body.values;

  sheet.clearContents();
  if (values.length > 0) {
    sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
    sheet.getRange(1, 1, 1, values[0].length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return ContentService.createTextOutput("ok");
}
