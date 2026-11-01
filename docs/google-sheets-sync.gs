// Google Apps Script for the Laporan IPL -> Google Sheets sync
// (see syncYearToSheet in src/lib/googleSheets.ts).
//
// Setup: in the target spreadsheet, Extensions > Apps Script, paste this,
// set SECRET to a long random string (same value as the Vercel env var
// GOOGLE_SHEETS_WEBHOOK_SECRET), then Deploy > New deployment > Web app,
// Execute as: Me, Who has access: Anyone. Put the /exec URL in
// GOOGLE_SHEETS_WEBHOOK_URL.

const SECRET = "GANTI_DENGAN_KODE_RAHASIA";

const RED = "#f4cccc"; // due month, not paid
const GREEN = "#d9ead3"; // IPL Gratis
const GREY = "#efefef"; // inactive unit
const RP = '"Rp "#,##0';

// Payload from syncYearToSheet: values = header + one row per house
// (No. Rumah, Nama, Januari..Desember, Total); a month cell is the amount,
// "" (unpaid), "Gratis" (exempt) or "-" (inactive unit). dueThroughMonth =
// last month whose empty cells count as arrears (0 = none, 12 = all).
function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return ContentService.createTextOutput("unauthorized");
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(body.tab) || ss.insertSheet(body.tab);
  const values = body.values;
  const due = body.dueThroughMonth || 0;

  // clear() (not clearContents) so old colors/summary rows don't linger
  sheet.clear();
  if (values.length < 2) {
    if (values.length) sheet.getRange(1, 1, 1, values[0].length).setValues(values);
    return ContentService.createTextOutput("ok");
  }

  const nRows = values.length; // incl. header
  const nCols = values[0].length; // 2 + 12 months + Total
  const last = nRows; // last data row (1-based)

  sheet.getRange(1, 1, nRows, nCols).setValues(values);
  sheet.getRange(1, 1, 1, nCols).setFontWeight("bold");
  sheet.setFrozenRows(1);
  sheet.getRange(2, 3, nRows - 1, nCols - 2).setNumberFormat(RP);

  // Highlight month cells (columns C..N)
  const colors = values.slice(1).map((row) =>
    row.slice(2, 14).map((v, i) => {
      if (v === "Gratis") return GREEN;
      if (v === "-") return GREY;
      if (v === "" && i + 1 <= due) return RED;
      return null;
    })
  );
  sheet.getRange(2, 3, nRows - 1, 12).setBackgrounds(colors);

  // Summary under the table (one blank row gap):
  //   Total Terkumpul  = sum of each month (+ grand total)
  //   Sudah Bayar      = paid / (paid + unpaid); Gratis and "-" excluded
  const sumRow = last + 2;
  const countRow = last + 3;
  const sumFormulas = [];
  const countFormulas = [];
  for (let c = 3; c <= nCols; c++) {
    const col = columnLetter(c);
    const rng = `${col}2:${col}${last}`;
    sumFormulas.push(`=SUM(${rng})`);
    countFormulas.push(
      c < nCols ? `=COUNT(${rng})&"/"&(COUNT(${rng})+COUNTBLANK(${rng}))` : ""
    );
  }
  sheet.getRange(sumRow, 1, 2, 1).setValues([["Total Terkumpul"], ["Sudah Bayar"]]);
  sheet.getRange(sumRow, 3, 1, nCols - 2).setFormulas([sumFormulas]).setNumberFormat(RP);
  sheet.getRange(countRow, 3, 1, nCols - 2).setFormulas([countFormulas]).setHorizontalAlignment("right");
  sheet.getRange(sumRow, 1, 2, nCols).setFontWeight("bold");

  return ContentService.createTextOutput("ok");
}

function columnLetter(n) {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
