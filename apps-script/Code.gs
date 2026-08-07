// ═══════════════════════════════════════════════════════════════════════
//  BBA SPORTS ACADEMY — Google Apps Script v7
//
//  SOURCE OF TRUTH. Edit here, commit, then paste into the Apps Script
//  editor. v6 and earlier lived only in the editor with no history, which
//  is how a silent breakage survived two full months unnoticed.
//
//  ── WHAT v7 FIXES ────────────────────────────────────────────────────
//  Monthly rows were never cleared, and paid students still showed as
//  unpaid, because of ONE root cause:
//
//  The website (bbashuttle.com/fees → Cloud Function sheetsSync.ts) writes
//  to Sheets with valueInputOption 'USER_ENTERED', which parses values as
//  if typed by a human. "Aug 2026" parses as a DATE. So the Month cell held
//  a date serial, and Apps Script read it back as a Date object — never a
//  string. Every comparison of the form
//        String(cell).trim() === "Jul 2026"
//  was therefore false forever. clearCentreMonthRows() found 0 matching
//  rows and returned SILENTLY (no log at all), so both the 1st-of-month
//  trigger and the manual menu item appeared to succeed while doing
//  nothing. The same mismatch made runMonthlyFeeCheck mark every
//  website-paid student as unpaid.
//
//  Fixed on both sides:
//   • Cloud Function now writes the month as forced text ('Aug 2026).
//   • This script no longer string-compares raw cells. canonicalMonth()
//     normalises Date objects, "Aug 2026", "August 2026", "2026-08" and
//     stray non-breaking spaces to one canonical "Aug 2026".
//   • Nothing no-ops silently any more — every path writes to admin_logs.
//   • monthlyRollover CATCHES UP: it rolls every month older than the
//     current one, so a missed month (June is still sitting there) heals
//     itself on the next run instead of lingering forever.
//
//  Centres: Dadar · Ruia · Bandra · RBI Colony
// ═══════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────
//  CONSTANTS
// ───────────────────────────────────────────────────────────────────────

var LOGO_FILE_ID   = "1i-xmnnsTngJY19YE6qyjQGkUyvaMFnI8";
var CONTACT_NAME   = "Prathamesh";
var CONTACT_MOBILE = "90221 02921";

// WEBSITE is plain display text. Do NOT put markdown "[text](url)" syntax
// here — Apps Script does not render markdown, so parents would see raw
// brackets in every invoice. This has silently regressed twice; some
// editors auto-linkify domains on paste. Check this line after pasting.
var WEBSITE      = "www.bbashuttle.com";
var WEBSITE_URL  = "https://www.bbashuttle.com";
var FEE_URL      = "https://www.bbashuttle.com/fees";

var FIREBASE_SYNC_URL = "https://asia-south1-bba-sports-prod.cloudfunctions.net/submitFeePayment";
// ⚠️ SECURITY: this key is in git history and should be rotated — generate a
// new random string, set it as SHEETS_API_KEY in functions/.env, redeploy the
// Cloud Functions, THEN update this constant to match.
var FIREBASE_API_KEY  = "812f9c987cded3d3f8903aef29819b7d31047c46";

var SHEETS = {
  CONFIG     : "Centre_Config",
  PLAYERS    : "Player_Directory",
  INVOICES   : "Invoice_Log",
  ADMIN      : "admin_logs",
  PAYMENTS   : {
    "Dadar"            : "Payments_Dadar",
    "Ruia College"     : "Payments_Ruia",
    "Bandra Gymkhana"  : "Payments_Bandra",
    "RBI Colony"       : "Payments_RBI"
  }
};

// Column indexes, named so an off-by-one is visible rather than buried.
var PAY_COL   = { TIMESTAMP:0, INVOICE:1, STUDENT_ID:2, NAME:3, BATCH:4, AMOUNT:5, MONTH:6, MODE:7, STATUS:8 };
var INV_COL   = { INVOICE:0, DATE:1, STUDENT_ID:2, NAME:3, CENTRE:4, MONTH:5, BATCH:6, AMOUNT:7, MODE:8 };

var MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];


// ───────────────────────────────────────────────────────────────────────
//  APPEARANCE & STATUS OPTIONS — safe to edit, no logic depends on colours
// ───────────────────────────────────────────────────────────────────────

var HEADER_BG = "#0A0A0A";   // header row background
var HEADER_FG = "#E84C1E";   // header row text

/**
 * The Status dropdown.
 *
 * "Pending Verification" MUST stay spelled exactly like this — it is the
 * literal string that BOTH writers put on every new payment: the website
 * (functions/src/fees/sheetsSync.ts) and the legacy Google Form path in
 * this file. Change or reorder the wording and every incoming row lands
 * outside the dropdown and gets flagged invalid.
 *
 * Adding a third option (e.g. "Rejected") is safe — just append it here
 * and give it a colour below, then re-run the menu item.
 */
var STATUS_OPTIONS = ["Pending Verification", "Verified"];

var STATUS_COLORS = {
  "Pending Verification": { bg: "#FFF4E5", fg: "#B26A00" },  // amber
  "Verified"            : { bg: "#E6F4EA", fg: "#137333" }   // green
};


// ───────────────────────────────────────────────────────────────────────
//  MONTH NORMALISATION — the heart of the v7 fix.
//
//  A Month cell can legitimately contain any of these, depending on which
//  system wrote it and when:
//    • a Date object      (website rows written before the USER_ENTERED fix)
//    • "Aug 2026"         (legacy Google Form rows, and website rows after it)
//    • "2026-08"          (if anything ever writes the raw YearMonth)
//    • "August 2026"      (a human typing into the sheet)
//    • any of the above with a non-breaking space
//
//  Everything downstream compares canonicalMonth(cell) === canonicalMonth(x),
//  never the raw values. Never reintroduce a raw === comparison on a month.
// ───────────────────────────────────────────────────────────────────────

function canonicalMonth(v) {
  if (v === null || v === undefined || v === "") return "";

  // Real Date — Sheets parsed the text into a date under USER_ENTERED.
  if (Object.prototype.toString.call(v) === "[object Date]") {
    if (isNaN(v.getTime())) return "";
    return MONTHS[v.getMonth()] + " " + v.getFullYear();
  }

  var s = String(v).replace(/ /g, " ").trim();
  if (!s) return "";

  // "2026-08" / "2026-08-15"
  var iso = s.match(/^(\d{4})-(\d{1,2})/);
  if (iso) {
    var mi = Number(iso[2]) - 1;
    if (mi >= 0 && mi < 12) return MONTHS[mi] + " " + iso[1];
  }

  // "Aug 2026" / "August 2026" / "aug-2026" / "Aug, 2026"
  var named = s.match(/^([A-Za-z]+)[\s\-,]+(\d{4})$/);
  if (named) {
    var abbr = named[1].toLowerCase().slice(0, 3);
    for (var i = 0; i < 12; i++) {
      if (MONTHS[i].toLowerCase() === abbr) return MONTHS[i] + " " + named[2];
    }
  }

  // Last resort — let JS try (covers "1 Aug 2026", full date strings).
  var d = new Date(s);
  if (!isNaN(d.getTime())) return MONTHS[d.getMonth()] + " " + d.getFullYear();

  // Unrecognised: return as-is so it shows up verbatim in diagnostics
  // instead of being silently swallowed.
  return s;
}

/** Sortable rank for a canonical month. -1 when unparseable. */
function monthRank(v) {
  var c = canonicalMonth(v);
  var m = c.match(/^([A-Za-z]{3}) (\d{4})$/);
  if (!m) return -1;
  var idx = MONTHS.indexOf(m[1]);
  return idx < 0 ? -1 : (Number(m[2]) * 12 + idx);
}

/**
 * Current month label. Built from the MONTHS array rather than
 * toLocaleString("default", ...), whose output depends on the script's
 * locale setting and can silently become "August 2026" or "08/2026".
 */
function getMonthLabel(date) {
  var d = date || new Date();
  return MONTHS[d.getMonth()] + " " + d.getFullYear();
}

/** Month label for the month before the given date (default: now). */
function getPrevMonthLabel(date) {
  var d = new Date((date || new Date()).getTime());
  d.setDate(1);          // avoid the 31st→short-month rollover trap
  d.setMonth(d.getMonth() - 1);
  return getMonthLabel(d);
}


// ───────────────────────────────────────────────────────────────────────
//  ADMIN MENU
// ───────────────────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("BBA Admin")
    .addItem("Run monthly fee check now", "runMonthlyFeeCheck")
    .addItem("Run monthly rollover now (catches up)", "monthlyRollover")
    .addSeparator()
    .addItem("Diagnose month values…", "diagnoseMonths")
    .addItem("Apply table styling (safe)", "applySafeStyling")
    .addItem("Set up Status dropdown + colours", "applyStatusSetup")
    .addItem("Rebuild a tab as a plain sheet…", "promptRebuildTab")
    .addItem("Clear one centre's month…", "promptClearCentreMonth")
    .addSeparator()
    .addItem("Retry failed Firebase syncs", "retryFailedSyncs")
    .addItem("One-time setup (new spreadsheet)", "setupSpreadsheet")
    .addToUi();
}


// ───────────────────────────────────────────────────────────────────────
//  DIAGNOSTICS — shows exactly what is in every Month cell.
//
//  Exists because the v6 failure was invisible: the sheet looked fine, the
//  trigger reported success, and admin_logs was empty. Run this whenever a
//  month "won't clear" and the answer is on screen in seconds.
// ───────────────────────────────────────────────────────────────────────

function diagnoseMonths() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var out = [];

  Object.keys(SHEETS.PAYMENTS).forEach(function (centre) {
    var tab = SHEETS.PAYMENTS[centre];
    var sheet = ss.getSheetByName(tab);
    if (!sheet) { out.push(tab + ": TAB MISSING"); return; }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) { out.push(tab + ": empty (header only)"); return; }

    var counts = {};
    for (var r = 1; r < data.length; r++) {
      var raw = data[r][PAY_COL.MONTH];
      var key = canonicalMonth(raw) || "(blank)";
      var type = Object.prototype.toString.call(raw) === "[object Date]" ? "Date" : "text";
      var label = key + "  [stored as " + type + "]";
      counts[label] = (counts[label] || 0) + 1;
    }

    var lines = Object.keys(counts).sort().map(function (k) {
      return "   " + counts[k] + " × " + k;
    });
    out.push(tab + "  (" + (data.length - 1) + " rows)\n" + lines.join("\n"));
  });

  var inv = getSheet(SHEETS.INVOICES).getDataRange().getValues().slice(1);
  var invCounts = {};
  inv.forEach(function (row) {
    var key = canonicalMonth(row[INV_COL.MONTH]) || "(blank)";
    invCounts[key] = (invCounts[key] || 0) + 1;
  });
  var invLines = Object.keys(invCounts).sort().map(function (k) {
    return "   " + invCounts[k] + " × " + k;
  });
  out.push("Invoice_Log  (" + inv.length + " rows)\n" + invLines.join("\n"));

  out.push("\nToday reads as: " + getMonthLabel() + "\nPrevious month: " + getPrevMonthLabel());

  var text = out.join("\n\n");
  Logger.log(text);
  SpreadsheetApp.getUi().alert("Month values by tab", text, SpreadsheetApp.getUi().ButtonSet.OK);
}


// ───────────────────────────────────────────────────────────────────────
//  SAFE TABLE STYLING
//
//  Gives the machine-written tabs the banded, easy-to-scan look of a real
//  Google Sheets Table — frozen bold header, alternating row colours,
//  auto-sized columns — WITHOUT converting them to actual Tables.
//
//  Why not real Tables on these four tabs: a Table enforces a column TYPE,
//  and Sheets would auto-detect Month as a Date column because every row
//  currently holds a date. Re-typing a machine-written column is the exact
//  mechanism that broke the rollover for two months. This is pure
//  formatting — it cannot change how any value is stored or read.
//
//  Fee_Status_* and Fee_Status_Archive are read-only reports; converting
//  THOSE to real Tables is safe and worth doing if you like the filters.
// ───────────────────────────────────────────────────────────────────────

function applySafeStyling() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var done = [];

  var targets = Object.keys(SHEETS.PAYMENTS).map(function (c) {
    return { name: SHEETS.PAYMENTS[c], monthIdx: PAY_COL.MONTH };
  });
  targets.push({ name: SHEETS.INVOICES, monthIdx: INV_COL.MONTH });
  targets.push({ name: SHEETS.PLAYERS,  monthIdx: -1 });
  targets.push({ name: SHEETS.ADMIN,    monthIdx: -1 });

  targets.forEach(function (t) {
    var sheet = ss.getSheetByName(t.name);
    if (!sheet) return;

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, lastCol)
         .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight("bold");

    // Re-applying banding on a range that already has it throws, so clear first.
    var body = sheet.getRange(1, 1, Math.max(lastRow, 2), lastCol);
    body.getBandings().forEach(function (b) { b.remove(); });
    body.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

    // Keep the Month column as plain text so nothing re-parses it to a date.
    if (t.monthIdx >= 0) {
      sheet.getRange(2, t.monthIdx + 1, Math.max(sheet.getMaxRows() - 1, 1), 1)
           .setNumberFormat("@");
    }

    sheet.autoResizeColumns(1, lastCol);
    done.push(t.name);
  });

  adminLog("Styling applied", "—", "—", done.join(", "));
  SpreadsheetApp.getUi().alert(
    "Styled " + done.length + " tabs:\n\n" + done.join("\n") +
    "\n\nFrozen bold header, banded rows, auto-sized columns. " +
    "Month columns forced to plain text.\n\n" +
    "Fee_Status_* report tabs are safe to convert to real Tables if you want filters there.");
}


// ───────────────────────────────────────────────────────────────────────
//  STATUS DROPDOWN + COLOUR CODING
//
//  Turns the Status column into a two-option dropdown so verifying a
//  payment is one click instead of retyping "Pending Verification" — and
//  colours the cell by value so a tab can be scanned at a glance.
//
//  Applied to the whole column, not just existing rows, so payments that
//  arrive later get the dropdown automatically.
//
//  Nothing reads this column programmatically; it is written by the
//  website and the legacy form, and read only by a human. Flipping a row
//  to "Verified" is therefore purely a bookkeeping act and cannot affect
//  invoices, the rollover, or Firestore.
// ───────────────────────────────────────────────────────────────────────

function applyStatusSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var done = [];
  var offList = {};

  Object.keys(SHEETS.PAYMENTS).forEach(function (centre) {
    var tab   = SHEETS.PAYMENTS[centre];
    var sheet = ss.getSheetByName(tab);
    if (!sheet) return;

    var col     = PAY_COL.STATUS + 1;
    var lastRow = sheet.getLastRow();

    // Surface any existing value that is not in the dropdown, rather than
    // letting it silently acquire a red "invalid" corner.
    if (lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).getValues().forEach(function (r) {
        var v = String(r[0]).trim();
        if (v && STATUS_OPTIONS.indexOf(v) === -1) {
          offList[v] = (offList[v] || 0) + 1;
        }
      });
    }

    var fullCol = sheet.getRange(2, col, Math.max(sheet.getMaxRows() - 1, 1), 1);

    fullCol.setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .setHelpText("Pick one: " + STATUS_OPTIONS.join(" or "))
        .build()
    );

    // Colour the Status CELL only — not the whole row — so the row banding
    // from applySafeStyling stays visible underneath.
    var kept = sheet.getConditionalFormatRules().filter(function (rule) {
      return !rule.getRanges().some(function (rg) {
        return rg.getColumn() === col && rg.getNumColumns() === 1;
      });
    });

    STATUS_OPTIONS.forEach(function (opt) {
      var c = STATUS_COLORS[opt];
      if (!c) return;
      kept.push(
        SpreadsheetApp.newConditionalFormatRule()
          .whenTextEqualTo(opt)
          .setBackground(c.bg)
          .setFontColor(c.fg)
          .setBold(true)
          .setRanges([fullCol])
          .build()
      );
    });

    sheet.setConditionalFormatRules(kept);
    done.push(tab);
  });

  var msg = "Status dropdown + colours applied to:\n" + done.join("\n") +
            "\n\nOptions: " + STATUS_OPTIONS.join("  |  ");

  var odd = Object.keys(offList);
  if (odd.length > 0) {
    msg += "\n\n⚠ These existing values are NOT in the dropdown and will show a red " +
           "flag until changed:\n" +
           odd.map(function (v) { return "   " + offList[v] + ' × "' + v + '"'; }).join("\n");
  }

  adminLog("Status dropdown applied", "—", "—",
    done.join(", ") + (odd.length ? " · off-list values: " + odd.join(", ") : ""));
  SpreadsheetApp.getUi().alert(msg);
}


// ───────────────────────────────────────────────────────────────────────
//  REBUILD A TAB AS A PLAIN SHEET
//
//  Escape hatch for a tab that was converted to a Google Sheets Table and
//  needs to go back. Copies the values into a brand-new plain sheet, so it
//  does not depend on any "convert to range" menu item existing.
//
//  It also NORMALISES the Month column to canonical text on the way
//  through, which fixes the underlying date-typed data rather than just
//  the container. That is a genuine improvement over a UI revert.
//
//  Non-destructive: the original is renamed <name>_OLD_<stamp> and kept.
//  Nothing is deleted — verify the rebuilt tab, then remove the old one
//  by hand when you are satisfied.
// ───────────────────────────────────────────────────────────────────────

function rebuildTabAsPlainSheet(tabName, monthIdx) {
  var ss  = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(tabName);
  if (!src) throw new Error("Tab not found: " + tabName);

  var values = src.getDataRange().getValues();
  if (values.length === 0) throw new Error(tabName + " is empty — nothing to rebuild.");

  var rows = values.length;
  var cols = values[0].length;

  // Normalise the Month column to canonical text (row 0 is the header).
  var converted = 0;
  if (monthIdx >= 0 && monthIdx < cols) {
    for (var r = 1; r < rows; r++) {
      var canon = canonicalMonth(values[r][monthIdx]);
      if (canon && String(values[r][monthIdx]) !== canon) converted++;
      if (canon) values[r][monthIdx] = canon;
    }
  }

  var stamp   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  var tempName = tabName + "_REBUILD_" + stamp;
  var dest = ss.insertSheet(tempName);

  // Force the Month column to text BEFORE writing, so the write cannot be
  // re-parsed into a date on its way in.
  if (monthIdx >= 0 && monthIdx < cols) {
    dest.getRange(1, monthIdx + 1, dest.getMaxRows(), 1).setNumberFormat("@");
  }

  dest.getRange(1, 1, rows, cols).setValues(values);
  dest.setFrozenRows(1);
  dest.getRange(1, 1, 1, cols)
      .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight("bold");
  dest.getRange(1, 1, Math.max(rows, 2), cols)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  dest.autoResizeColumns(1, cols);

  // Verify before touching the original.
  if (dest.getLastRow() !== rows) {
    throw new Error("Rebuild verification failed for " + tabName +
      " — expected " + rows + " rows, got " + dest.getLastRow() + ". Original untouched.");
  }

  src.setName(tabName + "_OLD_" + stamp);
  dest.setName(tabName);

  adminLog("Tab rebuilt as plain sheet", "—", tabName,
    rows - 1 + " data rows copied · " + converted + " month cells normalised to text · " +
    "original kept as " + tabName + "_OLD_" + stamp);

  return { rows: rows - 1, converted: converted, oldName: tabName + "_OLD_" + stamp };
}


function promptRebuildTab() {
  var ui = SpreadsheetApp.getUi();

  // Month column index per tab, so the rebuild knows what to normalise.
  var known = {};
  Object.keys(SHEETS.PAYMENTS).forEach(function (c) {
    known[SHEETS.PAYMENTS[c]] = PAY_COL.MONTH;
  });
  known[SHEETS.INVOICES] = INV_COL.MONTH;
  known[SHEETS.PLAYERS]  = -1;
  known[SHEETS.ADMIN]    = -1;

  var names = Object.keys(known);

  var resp = ui.prompt("Rebuild a tab as a plain sheet",
    "Tab name, exactly one of:\n" + names.join("\n") +
    "\n\nOr type ALL-PAYMENTS to rebuild all four Payments tabs.",
    ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;

  var input = resp.getResponseText().trim();
  var targets;

  if (input.toUpperCase() === "ALL-PAYMENTS") {
    targets = Object.keys(SHEETS.PAYMENTS).map(function (c) { return SHEETS.PAYMENTS[c]; });
  } else if (known[input] !== undefined) {
    targets = [input];
  } else {
    ui.alert('Unknown tab "' + input + '".\n\nMust be one of:\n' + names.join("\n"));
    return;
  }

  var confirm = ui.alert("Confirm",
    "Rebuild as plain sheet(s):\n" + targets.join("\n") +
    "\n\nEach original is RENAMED and kept (nothing deleted). " +
    "Month cells are normalised to text.",
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var lines = [];
  targets.forEach(function (t) {
    try {
      var res = rebuildTabAsPlainSheet(t, known[t]);
      lines.push("✓ " + t + " — " + res.rows + " rows, " + res.converted + " months → text");
    } catch (e) {
      lines.push("✗ " + t + " — " + e.message);
      adminLog("Tab rebuild FAILED", "—", t, e.toString());
    }
  });

  ui.alert("Rebuild result\n\n" + lines.join("\n") +
    "\n\nOriginals kept as *_OLD_<timestamp>. Check the rebuilt tabs, then delete the old ones by hand.");
}


// ───────────────────────────────────────────────────────────────────────
//  ONE-TIME SETUP
// ───────────────────────────────────────────────────────────────────────

function setupSpreadsheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  var paymentHeaders = [
    "Timestamp", "Invoice_No", "Student_ID", "Student_Name",
    "Batch", "Amount", "Month", "Payment_Mode", "Status"
  ];

  Object.keys(SHEETS.PAYMENTS).forEach(function(centre) {
    var tabName = SHEETS.PAYMENTS[centre];
    var sheet   = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      sheet.appendRow(paymentHeaders);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, paymentHeaders.length)
           .setBackground(HEADER_BG)
           .setFontColor(HEADER_FG)
           .setFontWeight("bold");
      Logger.log("Created: " + tabName);
    } else {
      Logger.log("Already exists: " + tabName);
    }
    // Force the Month column to plain text so a future paste or edit can
    // never be silently re-parsed into a date again.
    sheet.getRange(2, PAY_COL.MONTH + 1, sheet.getMaxRows() - 1, 1)
         .setNumberFormat("@");
  });

  var logSheet = ss.getSheetByName(SHEETS.ADMIN);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEETS.ADMIN);
    logSheet.appendRow(["Timestamp", "Action", "Student_Name", "Centre", "Notes"]);
    logSheet.setFrozenRows(1);
    Logger.log("Created: admin_logs");
  }

  var invSheet = ss.getSheetByName(SHEETS.INVOICES);
  if (invSheet) {
    invSheet.setFrozenRows(1);
    invSheet.getRange(2, INV_COL.MONTH + 1, invSheet.getMaxRows() - 1, 1)
            .setNumberFormat("@");
  }

  var plSheet = ss.getSheetByName(SHEETS.PLAYERS);
  if (plSheet) plSheet.setFrozenRows(1);

  Logger.log("Setup complete.");
  SpreadsheetApp.getUi().alert("Setup complete! Month columns are now forced to text.");
}


// ───────────────────────────────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────────────────────────────

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function todayFormatted() {
  var d = new Date();
  return ("0" + d.getDate()).slice(-2) + "-" + MONTHS[d.getMonth()] + "-" + d.getFullYear();
}

function adminLog(action, name, centre, notes) {
  try {
    getSheet(SHEETS.ADMIN).appendRow([new Date(), action, name, centre, notes || ""]);
  } catch(e) {
    Logger.log("adminLog failed: " + e);
  }
}

function getLogo() {
  var blob = DriveApp.getFileById(LOGO_FILE_ID).getBlob();
  return "data:image/png;base64," + Utilities.base64Encode(blob.getBytes());
}

function cleanBatchLabel(raw) {
  if (!raw) return "";
  var s = raw.toLowerCase();
  if (s.indexOf("bundle") !== -1)     return "Bundle";
  if (s.indexOf("games day") !== -1)  return "Games Day";
  if (s.indexOf("5 day") !== -1 || s.indexOf("5 days") !== -1) return "5-Day";
  if (s.indexOf("4 day") !== -1 || s.indexOf("4 days") !== -1) return "4-Day";
  if (s.indexOf("3 day") !== -1 || s.indexOf("3 days") !== -1) return "3-Day";
  if (s.indexOf("2 day") !== -1 || s.indexOf("2 days") !== -1) return "2-Day";
  return raw;
}


// ───────────────────────────────────────────────────────────────────────
//  CENTRE CONFIG — LEGACY, Google Form path only.
//
//  This counter (Centre_Config cols M/N) is SEPARATE from and does NOT
//  drive bbashuttle.com/fees — that page's numbers come from Firestore
//  (functions/src/fees/invoiceCounter.ts), which is authoritative.
//  Confusing the two was the root of a multi-day debugging effort.
// ───────────────────────────────────────────────────────────────────────

function getCentreConfig(centreName) {
  var sheet = getSheet(SHEETS.CONFIG);
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === centreName.toString().trim()) {
      return { rowIndex: i + 1, data: data[i] };
    }
  }
  throw new Error("Centre not found in Centre_Config: " + centreName);
}

function generateInvoiceNo(centreName) {
  var sheet   = getSheet(SHEETS.CONFIG);
  var config  = getCentreConfig(centreName);
  var prefix  = config.data[1];
  var lastNo  = Number(config.data[12]) || 0;
  var newNo   = lastNo + 1;
  sheet.getRange(config.rowIndex, 13).setValue(newNo);
  return prefix + "-" + String(newNo).padStart(3, "0");
}

function generateStudentID(centreName) {
  var sheet   = getSheet(SHEETS.CONFIG);
  var config  = getCentreConfig(centreName);
  var prefix  = config.data[1].replace("BBA-", "");
  var lastNo  = Number(config.data[13]) || 0;
  var newNo   = lastNo + 1;
  sheet.getRange(config.rowIndex, 14).setValue(newNo);
  return prefix + "-" + String(newNo).padStart(3, "0");
}

function findOrCreateStudent(name, mobile, email, centre, batch) {
  var sheet = getSheet(SHEETS.PLAYERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var sameMobile = String(data[i][2]).trim() === String(mobile).trim();
    var sameName   = String(data[i][1]).trim().toLowerCase() === String(name).trim().toLowerCase();
    // Match only if BOTH match — siblings share a mobile number.
    if (sameMobile && sameName) {
      if (batch && data[i][5] !== batch) {
        sheet.getRange(i + 1, 6).setValue(batch);
        adminLog("Batch updated", name, centre, "From: " + data[i][5] + " → To: " + batch);
      }
      return data[i][0];
    }
  }

  var studentID = generateStudentID(centre);
  sheet.appendRow([
    studentID, name, mobile, email,
    centre, batch, todayFormatted(), "Active",
    "Auto-created via fee form"
  ]);
  adminLog("New student auto-created", name, centre, "ID: " + studentID + " | Batch: " + batch);
  return studentID;
}


// ═══════════════════════════════════════════════════════════════════════
//  TRIGGER 1 — FEE FORM SUBMISSION (legacy Google Form path)
// ═══════════════════════════════════════════════════════════════════════

function onFeeFormSubmit(e) {
  var r = e.values;

  var timestamp = r[0];
  var email     = r[1];
  var name      = r[2];
  var mobile    = r[3];
  var centre    = r[4] ? r[4].toString().trim() : "";

  if (!centre) {
    adminLog("ERROR", name || "Unknown", "Unknown", "Centre field empty in fee form");
    return;
  }

  var centreMap = {
    "Dadar"            : { batch: 5,  amount: 6,  payMode: 7,  screenshot: 8,  coach: 9,  screenshotFile: null },
    "Ruia College"     : { batch: 10, amount: 11, payMode: 12, screenshot: 13, coach: 14, screenshotFile: 25   },
    "Bandra Gymkhana"  : { batch: 15, amount: 16, payMode: 17, screenshot: 18, coach: 19, screenshotFile: 26   },
    "RBI Colony"       : { batch: 20, amount: 21, payMode: 22, screenshot: 23, coach: 24, screenshotFile: 27   }
  };

  var cols = centreMap[centre] || centreMap[centre.trim()];
  if (!cols) {
    adminLog("ERROR", name, centre || "Unknown", "Centre not recognised: " + centre);
    return;
  }

  var batch      = r[cols.batch]      || "";
  var amount     = r[cols.amount]     || "";
  var payMode    = r[cols.payMode]    || "UPI";
  var screenshot = r[cols.screenshotFile] ? r[cols.screenshotFile] : (r[cols.screenshot] || "");
  var coach      = r[cols.coach]      || "";
  var batchClean = cleanBatchLabel(batch);

  if (!amount) {
    adminLog("ERROR", name, centre, "Amount empty — check form column map");
    return;
  }

  var month   = getMonthLabel();
  var dateStr = todayFormatted();

  var studentID = findOrCreateStudent(name, mobile, email, centre, batchClean);
  var invoiceNo = generateInvoiceNo(centre);

  appendMonthSafeRow(getSheet(SHEETS.INVOICES), [
    invoiceNo, dateStr, studentID, name,
    centre, month, batchClean, amount,
    payMode, "", coach, screenshot, ""
  ], INV_COL.MONTH);

  var payTab = SHEETS.PAYMENTS[centre] || SHEETS.PAYMENTS[centre.trim()];
  if (payTab) {
    appendMonthSafeRow(getSheet(payTab), [
      timestamp, invoiceNo, studentID, name,
      batchClean, amount, month, payMode,
      "Pending Verification"
    ], PAY_COL.MONTH);
  } else {
    adminLog("WARNING", name, centre, "No Payments tab found for: " + centre);
  }

  try {
    var logo    = getLogo();
    var subject = "Fee Invoice " + invoiceNo + " — " + month + " | BBA Sports Academy";
    var html    = buildInvoiceEmail({
      name: name, amount: amount, invoiceNo: invoiceNo,
      studentID: studentID, dateStr: dateStr, month: month,
      batch: batchClean, payMode: payMode, coach: coach,
      centre: centre, logo: logo
    });
    GmailApp.sendEmail(email, subject, "", { htmlBody: html, from: "hello@bbashuttle.com" });
    adminLog("Invoice sent", name, centre, invoiceNo + " · Rs." + amount + " · " + month);
  } catch (err) {
    adminLog("Invoice email FAILED", name, centre, err.toString());
  }

  var centreCodeMap = {
    "Dadar"           : "DAD",
    "Ruia College"    : "RUI",
    "Bandra Gymkhana" : "BAN",
    "RBI Colony"      : "RBI"
  };

  syncPaymentToFirebase({
    source            : "SHEETS_FORM",
    centreCode        : centreCodeMap[centre] || "",
    centreName        : centre,
    studentName       : name,
    mobile            : String(mobile),
    email             : email,
    batch             : batchClean,
    month             : new Date().toISOString().slice(0, 7),
    amountRupees      : Number(amount),
    method            : payMode === "UPI" ? "UPI" : payMode === "Cash" ? "CASH" : "BANK_TRANSFER",
    paymentMode       : payMode,
    screenshotUrl     : screenshot || null,
    coachName         : coach || null,
    preferredDays     : null,
    externalStudentId : studentID,
    externalInvoiceNo : invoiceNo
  });
}

/**
 * appendRow, but the Month cell is written as explicit text afterwards.
 *
 * appendRow can let Sheets coerce a "Aug 2026" string into a date exactly
 * the way USER_ENTERED does from the API side. Setting the cell format to
 * text and re-writing the value guarantees it stays a string, so the
 * rollover can match it.
 */
function appendMonthSafeRow(sheet, values, monthIdx) {
  sheet.appendRow(values);
  var row = sheet.getLastRow();
  var cell = sheet.getRange(row, monthIdx + 1);
  cell.setNumberFormat("@");
  cell.setValue(String(values[monthIdx]));
}


// ═══════════════════════════════════════════════════════════════════════
//  TRIGGER 2 — REGISTRATION FORM SUBMISSION (legacy Google Form path)
// ═══════════════════════════════════════════════════════════════════════

function onRegistrationFormSubmit(e) {
  var r = e.values;

  var name      = r[1];
  var mobile    = r[2];
  var email     = r[3];
  var dob       = r[4]  || "";
  var emergName = r[5]  || "";
  var emergMob  = r[6]  || "";
  var referral  = r[7]  || "";
  var regBy     = r[8]  || "";
  var centre    = r[9] ? r[9].toString().trim() : "";

  var batchRaw = r[10] || r[11] || r[12] || r[13] || "";
  var batch    = cleanBatchLabel(batchRaw);
  var preferredDays = r[14] || r[15] || "";

  var sheet = getSheet(SHEETS.PLAYERS);
  var data  = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    var sameMobile = String(data[i][2]).trim() === String(mobile).trim();
    var sameName   = String(data[i][1]).trim().toLowerCase() === String(name).trim().toLowerCase();
    if (sameMobile && sameName) {
      adminLog("Reg duplicate skipped", name, centre,
        "Name + Mobile match — already exists as " + data[i][0]);
      if (email) sendWelcomeEmail(email, name, centre, batch, data[i][0]);
      return;
    }
  }

  var studentID = generateStudentID(centre);
  var notes = [
    regBy         ? "Reg by: " + regBy                  : "",
    dob           ? "DOB: " + dob                       : "",
    emergName     ? "Emergency: " + emergName + " " + emergMob : "",
    referral      ? "Ref: " + referral                  : "",
    preferredDays ? "Preferred days: " + preferredDays  : ""
  ].filter(Boolean).join(" | ");

  sheet.appendRow([
    studentID, name, mobile, email,
    centre, batch, todayFormatted(), "Active",
    notes || "Registered via form"
  ]);

  adminLog("New registration", name, centre, "ID: " + studentID + " · Batch: " + batch);

  if (email) sendWelcomeEmail(email, name, centre, batch, studentID);
}


function sendWelcomeEmail(email, name, centre, batch, studentID) {
  try {
    var logo    = getLogo();
    var subject = "Welcome to BBA Sports Academy — " + centre;
    var html    = buildWelcomeEmail({
      name: name, centre: centre, batch: batch, studentID: studentID, logo: logo
    });
    GmailApp.sendEmail(email, subject, "", { htmlBody: html, from: "hello@bbashuttle.com" });
    adminLog("Welcome email sent", name, centre, "ID: " + studentID);
  } catch (err) {
    adminLog("Welcome email FAILED", name, centre, err.toString());
  }
}


// ═══════════════════════════════════════════════════════════════════════
//  MONTHLY FEE CHECK — trigger on the 6th
//  Produces Fee_Status_<Month>_<Year>: every active student, paid or not.
// ═══════════════════════════════════════════════════════════════════════

function runMonthlyFeeCheck() {
  var ss      = SpreadsheetApp.getActiveSpreadsheet();
  var month   = getMonthLabel();
  var tabName = "Fee_Status_" + month.replace(" ", "_");

  var statusSheet = ss.getSheetByName(tabName);
  if (!statusSheet) statusSheet = ss.insertSheet(tabName);
  else statusSheet.clearContents();

  var headers = [
    "Centre", "Student_ID", "Student_Name", "Batch",
    "Expected_Fee", "Paid", "Invoice_No", "Month"
  ];
  statusSheet.appendRow(headers);
  statusSheet.setFrozenRows(1);
  statusSheet.getRange(1, 1, 1, headers.length)
             .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight("bold");

  var players  = getSheet(SHEETS.PLAYERS).getDataRange().getValues().slice(1);
  var invoices = getSheet(SHEETS.INVOICES).getDataRange().getValues().slice(1);
  var config   = getSheet(SHEETS.CONFIG).getDataRange().getValues();

  // canonicalMonth on BOTH sides. The v6 raw === here is why every student
  // who paid through the website still showed as unpaid.
  var target  = canonicalMonth(month);
  var paidMap = {};
  invoices.forEach(function(row) {
    if (canonicalMonth(row[INV_COL.MONTH]) === target) {
      paidMap[row[INV_COL.STUDENT_ID]] = row[INV_COL.INVOICE];
    }
  });

  var batchColMap = { "2-Day": 2, "3-Day": 3, "5-Day": 4, "Games Day": 5, "Bundle": 6 };
  var feeMap = {};
  config.slice(1).forEach(function(row) { feeMap[row[0]] = row; });

  var results = [];
  players.forEach(function(p) {
    if (p[7] !== "Active") return;

    var studentID   = p[0];
    var centre      = p[4];
    var batch       = p[5];
    var centreRow   = feeMap[centre];
    var colIdx      = batchColMap[batch];
    var expectedFee = (centreRow && colIdx) ? centreRow[colIdx] : "";
    var invoiceNo   = paidMap[studentID] || "";

    results.push([
      centre, studentID, p[1], batch,
      expectedFee ? "₹" + expectedFee : "—",
      invoiceNo ? "YES" : "NO",
      invoiceNo || "—",
      month
    ]);
  });

  results.sort(function(a, b) {
    return String(a[0]).localeCompare(String(b[0])) || String(a[2]).localeCompare(String(b[2]));
  });

  if (results.length > 0) {
    statusSheet.getRange(2, 1, results.length, results[0].length).setValues(results);
    results.forEach(function(row, i) {
      statusSheet.getRange(i + 2, 1, 1, results[0].length)
                 .setBackground(row[5] === "YES" ? "#e8f5e9" : "#fff8f5");
    });
  }

  var paidCount = results.filter(function (r) { return r[5] === "YES"; }).length;
  adminLog("Monthly fee check", "All centres", month,
    results.length + " active students · " + paidCount + " paid · " + (results.length - paidCount) + " pending");
}


// ═══════════════════════════════════════════════════════════════════════
//  FEE REMINDERS — daily from the 8th
// ═══════════════════════════════════════════════════════════════════════

function sendFeeReminders() {
  var REMINDERS_PAUSED = true; // ← flip to false when ready to re-enable
  if (REMINDERS_PAUSED) { Logger.log("Reminders paused — skipping."); return; }

  var today = new Date();
  if (today.getDate() < 8) return;

  // Rebuild the snapshot first — a stale one would email someone who has paid.
  runMonthlyFeeCheck();

  var month     = getMonthLabel();
  var tabName   = "Fee_Status_" + month.replace(" ", "_");
  var statSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
  if (!statSheet) { Logger.log("Run runMonthlyFeeCheck first."); return; }

  var data    = statSheet.getDataRange().getValues();
  var headers = data[0];
  var rows    = data.slice(1);

  var centreCol = headers.indexOf("Centre");
  var idCol     = headers.indexOf("Student_ID");
  var nameCol   = headers.indexOf("Student_Name");
  var paidCol   = headers.indexOf("Paid");

  var contactMap = {};
  getSheet(SHEETS.PLAYERS).getDataRange().getValues().slice(1).forEach(function(p) {
    contactMap[p[0]] = { email: p[3], mobile: p[2] };
  });

  rows.forEach(function(row) {
    if (row[paidCol] === "YES") return;

    var contact = contactMap[row[idCol]];
    if (!contact || !contact.email) return;

    try {
      var subject = "Coaching Fee Pending — " + month + " | BBA Sports Academy";
      var body =
        "Hi " + row[nameCol] + ",\n\n" +
        "Your coaching fee for " + month + " is still pending.\n\n" +
        "Please make the payment at your earliest to avoid any interruption to your sessions.\n\n" +
        "Pay here: " + FEE_URL + "\n\n" +
        "For queries contact " + CONTACT_NAME + " at " + CONTACT_MOBILE + ".\n\n" +
        "Regards,\n" + CONTACT_NAME + "\nBBA Sports Academy";

      GmailApp.sendEmail(contact.email, subject, body, { from: "hello@bbashuttle.com" });
      adminLog("Fee reminder sent", row[nameCol], row[centreCol], month);
    } catch (err) {
      adminLog("Reminder FAILED", row[nameCol], row[centreCol], err.toString());
    }
  });
}


// ═══════════════════════════════════════════════════════════════════════
//  TARGETED MONTH CLEAR
//
//  Clears ONLY rows matching a given month from Payments_<centre>, after
//  verifying each is already mirrored in Invoice_Log.
//
//  Only-matching-rows matters because next month's payments can arrive
//  BEFORE the current month rolls over (August slot bookings were taken
//  from 27 July). A whole-tab clear would wipe them.
//
//  Deletes bottom-up so earlier row indices stay valid mid-loop.
//  Returns a per-centre result so callers can report accurately.
// ═══════════════════════════════════════════════════════════════════════

function clearCentreMonthRows(monthLabel, onlyCentre) {
  var target   = canonicalMonth(monthLabel);
  var summary  = [];

  if (!target) {
    adminLog("ROLLOVER ERROR", "—", "—", 'Unparseable month label: "' + monthLabel + '"');
    return summary;
  }

  // Verification is per-row BY INVOICE NUMBER, not by counting rows per
  // centre+month.
  //
  // Counting required Invoice_Log's centre name to equal the SHEETS.PAYMENTS
  // key exactly — but that column is written by two different systems (the
  // legacy Google Form writes its own label; the website writes Firestore's
  // centre name). Any drift, even a trailing space or "Ruia" vs "Ruia
  // College", would make the count come up short and silently BLOCK a
  // perfectly valid rollover. An invoice number is one unique key that both
  // systems already agree on, so this checks the actual thing that matters:
  // is THIS row's payment permanently recorded before we delete it?
  var invoiceSet = {};
  getSheet(SHEETS.INVOICES).getDataRange().getValues().slice(1).forEach(function (row) {
    var no = String(row[INV_COL.INVOICE] || "").trim();
    if (no) invoiceSet[no] = true;
  });

  Object.keys(SHEETS.PAYMENTS).forEach(function (centre) {
    if (onlyCentre && centre !== onlyCentre) return;

    var tabName = SHEETS.PAYMENTS[centre];
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tabName);
    if (!sheet) {
      summary.push({ centre: centre, status: "TAB MISSING", rows: 0 });
      adminLog("ROLLOVER WARNING", centre, target, "Tab not found: " + tabName);
      return;
    }

    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      summary.push({ centre: centre, status: "empty", rows: 0 });
      return;
    }

    var targetRows = [];
    var missing    = [];
    for (var r = 1; r < data.length; r++) {
      if (canonicalMonth(data[r][PAY_COL.MONTH]) !== target) continue;
      targetRows.push(r + 1);

      var inv = String(data[r][PAY_COL.INVOICE] || "").trim();
      if (!inv) missing.push("(blank invoice no — sheet row " + (r + 1) + ")");
      else if (!invoiceSet[inv]) missing.push(inv);
    }

    if (targetRows.length === 0) {
      // v6 returned silently here, which is precisely why a broken rollover
      // was invisible for two months. Always say so.
      summary.push({ centre: centre, status: "nothing to clear", rows: 0 });
      return;
    }

    if (missing.length > 0) {
      summary.push({ centre: centre, status: "BLOCKED", rows: targetRows.length });
      adminLog("ROLLOVER BLOCKED", centre, target,
        missing.length + " of " + targetRows.length + " rows are NOT in Invoice_Log — " +
        "nothing deleted. Missing: " + missing.slice(0, 15).join(", ") +
        (missing.length > 15 ? " …(+" + (missing.length - 15) + " more)" : ""));
      return;
    }

    for (var i = targetRows.length - 1; i >= 0; i--) sheet.deleteRow(targetRows[i]);

    summary.push({ centre: centre, status: "cleared", rows: targetRows.length });
    adminLog("ROLLOVER: Payments cleared", centre, target,
      targetRows.length + " rows — every invoice confirmed present in Invoice_Log before deleting; other months untouched");
  });

  return summary;
}


function promptClearCentreMonth() {
  var ui = SpreadsheetApp.getUi();
  var centreNames = Object.keys(SHEETS.PAYMENTS).join(" / ");

  var centreResp = ui.prompt("Clear one centre's month",
    "Centre name, exactly one of:\n" + centreNames, ui.ButtonSet.OK_CANCEL);
  if (centreResp.getSelectedButton() !== ui.Button.OK) return;
  var centre = centreResp.getResponseText().trim();

  if (!SHEETS.PAYMENTS[centre]) {
    ui.alert('Unknown centre "' + centre + '".\n\nMust be exactly one of:\n' + centreNames);
    return;
  }

  var monthResp = ui.prompt("Clear one centre's month",
    'Month, e.g. "Jul 2026" (also accepts "July 2026" or "2026-07"):',
    ui.ButtonSet.OK_CANCEL);
  if (monthResp.getSelectedButton() !== ui.Button.OK) return;

  var monthLabel = canonicalMonth(monthResp.getResponseText().trim());
  if (!monthLabel) { ui.alert("Cancelled — a month is required."); return; }

  var confirm = ui.alert("Confirm",
    'Clear all "' + monthLabel + '" rows from ' + SHEETS.PAYMENTS[centre] + '?\n\n' +
    "Rows are only removed if Invoice_Log already has them. Other months are untouched.",
    ui.ButtonSet.YES_NO);
  if (confirm !== ui.Button.YES) return;

  var summary = clearCentreMonthRows(monthLabel, centre);
  var line = summary.length
    ? summary.map(function (s) { return s.centre + ": " + s.status + " (" + s.rows + " rows)"; }).join("\n")
    : "No centres matched.";
  ui.alert("Result — " + monthLabel + "\n\n" + line + "\n\nFull detail in admin_logs.");
}


// ═══════════════════════════════════════════════════════════════════════
//  MONTHLY ROLLOVER — 1st of every month, ~2 AM (time trigger)
//
//  CATCHES UP rather than only handling last month: it rolls EVERY month
//  older than the current one that still has rows. A missed run (June is
//  still sitting in the tabs) therefore heals itself on the next trigger
//  instead of lingering forever — which is what "clockwork" requires.
//
//  Nothing permanent is touched: Invoice_Log, Player_Directory,
//  Centre_Config and all Firestore counters carry forward untouched.
//  Safe to re-run — every step no-ops when there is nothing left to do.
// ═══════════════════════════════════════════════════════════════════════

function monthlyRollover() {
  var ss           = SpreadsheetApp.getActiveSpreadsheet();
  var currentRank  = monthRank(getMonthLabel());
  var pendingRanks = {};

  // Collect every distinct month still present across the Payments tabs
  // that is strictly older than the current month.
  Object.keys(SHEETS.PAYMENTS).forEach(function (centre) {
    var sheet = ss.getSheetByName(SHEETS.PAYMENTS[centre]);
    if (!sheet) return;
    var data = sheet.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) {
      var label = canonicalMonth(data[r][PAY_COL.MONTH]);
      var rank  = monthRank(label);
      if (rank > 0 && rank < currentRank) pendingRanks[label] = rank;
    }
  });

  var months = Object.keys(pendingRanks).sort(function (a, b) {
    return pendingRanks[a] - pendingRanks[b];
  });

  if (months.length === 0) {
    adminLog("ROLLOVER: nothing pending", "All centres", getMonthLabel(),
      "No months older than the current one remain in any Payments tab");
    return;
  }

  adminLog("ROLLOVER start", "All centres", getMonthLabel(),
    "Pending months: " + months.join(", "));

  months.forEach(function (monthLabel) {
    clearCentreMonthRows(monthLabel);
    archiveFeeStatus(monthLabel);
  });

  adminLog("ROLLOVER complete", "All centres", getMonthLabel(),
    "Processed: " + months.join(", "));
}


/** Archive Fee_Status_<month> into Fee_Status_Archive, then delete the tab. */
function archiveFeeStatus(monthLabel) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var oldTab = ss.getSheetByName("Fee_Status_" + monthLabel.replace(" ", "_"));
  if (!oldTab) return;

  var archive = ss.getSheetByName("Fee_Status_Archive");
  if (!archive) {
    archive = ss.insertSheet("Fee_Status_Archive");
    archive.appendRow(["Centre", "Student_ID", "Student_Name", "Batch",
                       "Expected_Fee", "Paid", "Invoice_No", "Month"]);
    archive.setFrozenRows(1);
    archive.getRange(1, 1, 1, 8)
           .setBackground(HEADER_BG).setFontColor(HEADER_FG).setFontWeight("bold");
  }

  var statusRows = oldTab.getDataRange().getValues().slice(1);
  var alreadyArchived = archive.getDataRange().getValues().slice(1)
    .some(function (r) { return canonicalMonth(r[7]) === canonicalMonth(monthLabel); });

  if (statusRows.length > 0 && !alreadyArchived) {
    archive.getRange(archive.getLastRow() + 1, 1, statusRows.length, statusRows[0].length)
           .setValues(statusRows);
  }
  ss.deleteSheet(oldTab);
  adminLog("ROLLOVER: Fee_Status archived", "All centres", monthLabel,
    statusRows.length + " rows → Fee_Status_Archive, tab deleted");
}


// ═══════════════════════════════════════════════════════════════════════
//  EMAIL BUILDERS
// ═══════════════════════════════════════════════════════════════════════

function buildInvoiceEmail(d) {
  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
  + '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">'
  + '<tr><td align="center">'
  + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">'

  + '<tr><td style="background:#E84C1E;height:6px;font-size:0;">&nbsp;</td></tr>'
  + '<tr><td style="background:#0A0A0A;padding:24px 32px;">'
  + '<table width="100%" cellpadding="0" cellspacing="0"><tr>'
  + '<td><div style="font-size:24px;font-weight:bold;color:#fff;letter-spacing:2px;">BBA SPORTS</div>'
  + '<div style="font-size:11px;color:#E84C1E;letter-spacing:3px;margin-top:3px;">BADMINTON ACADEMY · ' + d.centre.toUpperCase() + '</div></td>'
  + '<td align="right"><div style="font-size:11px;color:#888;letter-spacing:1px;text-transform:uppercase;">Fee Invoice</div>'
  + '<div style="font-size:20px;font-weight:bold;color:#E84C1E;margin-top:2px;">' + d.invoiceNo + '</div></td>'
  + '</tr></table></td></tr>'

  + '<tr><td style="padding:28px 32px 0;">'
  + '<p style="font-size:15px;color:#333;margin:0 0 8px;">Hi <strong>' + d.name + '</strong>,</p>'
  + '<p style="font-size:14px;color:#555;line-height:1.6;margin:0;">Your coaching fee for <strong>' + d.month + '</strong> has been received. Here is your invoice.</p>'
  + '</td></tr>'

  + '<tr><td style="padding:24px 32px;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:6px;overflow:hidden;">'
  + '<tr style="background:#0A0A0A;">'
  + '<td style="padding:11px 16px;font-size:11px;font-weight:bold;color:#E84C1E;letter-spacing:2px;text-transform:uppercase;">Description</td>'
  + '<td style="padding:11px 16px;font-size:11px;font-weight:bold;color:#E84C1E;letter-spacing:2px;text-transform:uppercase;text-align:right;">Amount</td>'
  + '</tr>'
  + '<tr style="background:#fff8f5;">'
  + '<td style="padding:14px 16px;font-size:14px;color:#222;border-bottom:1px solid #f0e8e0;">'
  + '<strong>Badminton Coaching Fee</strong><br>'
  + '<span style="font-size:12px;color:#777;">' + d.month + ' · ' + d.batch
  + (d.coach ? ' · Coach: ' + d.coach : '') + '</span></td>'
  + '<td style="padding:14px 16px;font-size:14px;color:#222;text-align:right;border-bottom:1px solid #f0e8e0;">₹' + d.amount + '/-</td>'
  + '</tr>'
  + '<tr style="background:#E84C1E;">'
  + '<td style="padding:13px 16px;font-size:14px;font-weight:bold;color:#fff;letter-spacing:1px;">TOTAL PAID</td>'
  + '<td style="padding:13px 16px;font-size:16px;font-weight:bold;color:#fff;text-align:right;">₹' + d.amount + '/-</td>'
  + '</tr></table></td></tr>'

  + '<tr><td style="padding:0 32px 24px;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;border:1px solid #eee;">'
  + '<tr><td style="padding:16px 20px;">'
  + '<div style="font-size:11px;font-weight:bold;color:#E84C1E;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Payment Details</div>'
  + '<table width="100%" cellpadding="0" cellspacing="0">'
  + row("Invoice No",   d.invoiceNo)
  + row("Student ID",   d.studentID)
  + row("Date",         d.dateStr)
  + row("Centre",       d.centre)
  + row("Batch",        d.batch)
  + row("Payment Mode", d.payMode)
  + row("Period",       d.month)
  + '<tr><td style="font-size:12px;color:#888;padding:4px 0;width:40%;">Status</td>'
  + '<td style="font-size:12px;padding:4px 0;"><span style="background:#e8f5e9;color:#2e7d32;font-weight:bold;padding:2px 10px;border-radius:12px;font-size:11px;">✓ PAID</span></td></tr>'
  + '</table></td></tr></table></td></tr>'

  + '<tr><td style="padding:0 32px 24px;">'
  + '<p style="font-size:13px;color:#777;margin:0;line-height:1.6;border-left:3px solid #E84C1E;padding-left:12px;">'
  + 'Please keep this email as your official payment record. For queries, contact your batch coach or reach us at '
  + '<a href="' + WEBSITE_URL + '" style="color:#E84C1E;text-decoration:underline;">' + WEBSITE + '</a>.</p>'
  + '</td></tr>'

  + signature(d.logo)
  + footer()
  + '</table></td></tr></table></body></html>';
}

function buildWelcomeEmail(d) {
  var batchLabels = {
    "2-Day"    : "2 Days / Week  (8 sessions/month)",
    "3-Day"    : "3 Days / Week  (12 sessions/month)",
    "5-Day"    : "5 Days / Week  (20 sessions/month)",
    "Games Day": "Games Day  (Saturdays only)",
    "Bundle"   : "Complete Bundle  (3 Days + Games Day)"
  };

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
  + '<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">'
  + '<tr><td align="center">'
  + '<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">'

  + '<tr><td style="background:#E84C1E;height:6px;font-size:0;">&nbsp;</td></tr>'
  + '<tr><td style="background:#0A0A0A;padding:28px 32px;">'
  + '<div style="font-size:26px;font-weight:bold;color:#fff;letter-spacing:2px;">WELCOME TO BBA SPORTS</div>'
  + '<div style="font-size:11px;color:#E84C1E;letter-spacing:3px;margin-top:4px;">BADMINTON ACADEMY · ' + d.centre.toUpperCase() + '</div>'
  + '</td></tr>'

  + '<tr><td style="padding:28px 32px 0;">'
  + '<p style="font-size:15px;color:#333;margin:0 0 12px;">Hi <strong>' + d.name + '</strong>,</p>'
  + '<p style="font-size:14px;color:#555;line-height:1.7;margin:0 0 20px;">Welcome aboard! We\'re excited to have you on court. Here are your registration details:</p>'
  + '</td></tr>'

  + '<tr><td style="padding:0 32px 20px;">'
  + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;border-radius:6px;border:1px solid #eee;">'
  + '<tr><td style="padding:16px 20px;">'
  + '<div style="font-size:11px;font-weight:bold;color:#E84C1E;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">Your Details</div>'
  + '<table width="100%" cellpadding="0" cellspacing="0">'
  + row("Student ID", d.studentID)
  + row("Centre",     d.centre)
  + row("Batch",      batchLabels[d.batch] || d.batch)
  + '</table></td></tr></table></td></tr>'

  + '<tr><td style="padding:0 32px 24px;">'
  + '<div style="background:#fff8f5;border-radius:6px;border:1px solid #fce0d4;padding:16px 20px;">'
  + '<div style="font-size:11px;font-weight:bold;color:#E84C1E;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;">Things to Remember</div>'
  + '<p style="font-size:13px;color:#444;margin:0 0 7px;">→ Monthly fees due by the <strong>7th of every month</strong></p>'
  + '<p style="font-size:13px;color:#444;margin:0 0 7px;">→ Non-marking court shoes are compulsory</p>'
  + '<p style="font-size:13px;color:#444;margin:0 0 7px;">→ Arrive 10 minutes before your session</p>'
  + '<p style="font-size:13px;color:#444;margin:0;">→ Visit <a href="' + WEBSITE_URL + '" style="color:#E84C1E;text-decoration:underline;font-weight:bold;">' + WEBSITE + '</a> for updates and schedules</p>'
  + '</div></td></tr>'

  + signature(d.logo, "See you on court,")
  + footer()
  + '</table></td></tr></table></body></html>';
}


function row(label, value) {
  return '<tr>'
    + '<td style="font-size:12px;color:#888;padding:4px 0;width:40%;">' + label + '</td>'
    + '<td style="font-size:12px;color:#222;padding:4px 0;">' + value + '</td>'
    + '</tr>';
}

function signature(logo, greeting) {
  greeting = greeting || "Regards,";
  return '<tr><td style="padding:0 32px 28px;border-top:1px solid #f0f0f0;">'
    + '<table cellpadding="0" cellspacing="0" style="padding-top:20px;"><tr><td>'
    + '<p style="font-size:14px;color:#333;margin:0 0 4px;">' + greeting + '</p>'
    + '<p style="font-size:15px;font-weight:bold;color:#0A0A0A;margin:0 0 2px;">' + CONTACT_NAME + '</p>'
    + '<p style="font-size:13px;color:#E84C1E;font-weight:bold;letter-spacing:1px;margin:0 0 12px;">BBA Sports Academy</p>'
    + '<img src="' + logo + '" alt="BBA Sports" width="72" style="display:block;">'
    + '</td></tr></table></td></tr>';
}

function footer() {
  return '<tr><td style="background:#0A0A0A;padding:14px 32px;">'
    + '<p style="font-size:11px;color:#666;margin:0;text-align:center;letter-spacing:1px;">'
    + '<a href="' + WEBSITE_URL + '" style="color:#999;text-decoration:underline;">' + WEBSITE + '</a>'
    + ' &nbsp;·&nbsp; @bbashuttle &nbsp;·&nbsp; Mumbai'
    + '</p></td></tr>';
}


// ═══════════════════════════════════════════════════════════════════════
//  FIREBASE SYNC — best-effort; failures never break Sheets writes.
// ═══════════════════════════════════════════════════════════════════════

function syncPaymentToFirebase(payload) {
  if (!FIREBASE_SYNC_URL || !FIREBASE_API_KEY) {
    Logger.log("Firebase sync skipped — URL or API key not configured");
    return;
  }

  try {
    var response = UrlFetchApp.fetch(FIREBASE_SYNC_URL, {
      method: "post",
      contentType: "application/json",
      headers: { "x-api-key": FIREBASE_API_KEY },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var status = response.getResponseCode();
    var body   = response.getContentText();

    if (status >= 200 && status < 300) {
      adminLog("FIREBASE_SYNC_OK", payload.studentName, payload.centreName,
        payload.externalInvoiceNo + " · status " + status);
    } else {
      adminLog("FIREBASE_SYNC_FAILED", payload.studentName, payload.centreName,
        payload.externalInvoiceNo + " · status " + status + " · " + body.slice(0, 300));
    }
  } catch (err) {
    adminLog("FIREBASE_SYNC_FAILED", payload.studentName || "Unknown", payload.centreName || "Unknown",
      (payload.externalInvoiceNo || "?") + " · exception: " + err.toString());
  }
}

function retryFailedSyncs() {
  if (!FIREBASE_SYNC_URL || !FIREBASE_API_KEY) {
    SpreadsheetApp.getUi().alert("Firebase sync not configured.");
    return;
  }

  var logSheet = getSheet(SHEETS.ADMIN);
  var logData  = logSheet.getDataRange().getValues();
  var invoiceData = getSheet(SHEETS.INVOICES).getDataRange().getValues();

  var invoiceMap = {};
  for (var i = 1; i < invoiceData.length; i++) invoiceMap[invoiceData[i][0]] = invoiceData[i];

  var recoveredSet = {};
  logData.forEach(function(row) {
    if (row[1] === "FIREBASE_SYNC_OK" && row[4]) {
      var match = String(row[4]).match(/BBA-[A-Z]{3}-\d{3}/);
      if (match) recoveredSet[match[0]] = true;
    }
  });

  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  var playerData = getSheet(SHEETS.PLAYERS).getDataRange().getValues();
  var retryCount = 0, successCount = 0, failCount = 0;

  for (var j = 1; j < logData.length; j++) {
    var lrow = logData[j];
    if (lrow[1] !== "FIREBASE_SYNC_FAILED") continue;
    if (new Date(lrow[0]) < cutoff) continue;

    var match2 = String(lrow[4] || "").match(/BBA-[A-Z]{3}-\d{3}/);
    if (!match2) continue;

    var invoiceNo = match2[0];
    if (recoveredSet[invoiceNo]) continue;

    var invoiceRow = invoiceMap[invoiceNo];
    if (!invoiceRow) {
      Logger.log("Retry skip — invoice " + invoiceNo + " not in Invoice_Log");
      continue;
    }

    var studentID = invoiceRow[INV_COL.STUDENT_ID];
    var email = "", mobile = "";
    for (var k = 1; k < playerData.length; k++) {
      if (playerData[k][0] === studentID) { email = playerData[k][3]; mobile = playerData[k][2]; break; }
    }

    retryCount++;
    syncPaymentToFirebase({
      source            : "SHEETS_FORM",
      centreName        : invoiceRow[INV_COL.CENTRE],
      studentName       : invoiceRow[INV_COL.NAME],
      mobile            : String(mobile),
      email             : email,
      batch             : invoiceRow[INV_COL.BATCH],
      amount            : Number(invoiceRow[INV_COL.AMOUNT]),
      paymentMode       : invoiceRow[INV_COL.MODE] || "UPI",
      screenshotUrl     : invoiceRow[11] || null,
      coachName         : invoiceRow[10] || null,
      preferredDays     : null,
      externalStudentId : studentID,
      externalInvoiceNo : invoiceNo
    });

    Utilities.sleep(500);
    var freshLog = logSheet.getRange(logSheet.getLastRow(), 1, 1, 5).getValues()[0];
    if (freshLog[1] === "FIREBASE_SYNC_OK" && String(freshLog[4]).indexOf(invoiceNo) !== -1) successCount++;
    else failCount++;
  }

  SpreadsheetApp.getUi().alert(
    "Retry complete.\nAttempted: " + retryCount +
    "\nSucceeded: " + successCount + "\nStill failing: " + failCount);
}
