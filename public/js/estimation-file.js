/* ==============================================================
   Estimation file runtime.

   Not loaded by the app. The sizing page's Download button inlines this
   script, together with the estimator, into the HTML file it saves, so the
   file opens as a working Project Estimate with no server behind it. The
   estimation itself travels as JSON in #fps-estimation-data; this script
   boots the estimator from it and, on "Save changes to file", writes a new
   copy of the file with the edited data in its place. The app's Load file
   button reads only that JSON back, never the rendered markup.
   ============================================================== */
(function () {
  'use strict';

  // Captured before the estimator renders anything, so a saved copy starts
  // from the same clean markup and only its data block differs.
  var PRISTINE = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

  var Estimator = window.FabricEstimatorV3;
  var view = document.getElementById('detailed-estimation-view');
  var status = document.getElementById('fps-file-status');
  var saveBtn = document.getElementById('fps-file-save');

  function fail(message) {
    if (status) { status.textContent = message; status.classList.add('is-error'); }
    if (saveBtn) saveBtn.disabled = true;
  }

  var file = null;
  try { file = JSON.parse(document.getElementById('fps-estimation-data').textContent); } catch (e) { file = null; }
  if (!file || !file.estimation || typeof file.estimation !== 'object') {
    fail('The estimation data in this file could not be read. If it was edited by hand, check that the JSON block near the end of the file is still valid.');
    return;
  }
  if (!Estimator || !view) { fail('The estimator in this file did not load.'); return; }

  var est = file.estimation;
  var cal = file.calibration || {};
  Estimator.init(view);
  // The organisation's calibration at download time, so the hours here match
  // what the app showed. The app applies its own current calibration again
  // when the file is loaded back.
  Estimator.setOrgRates(cal.rates || {});
  Estimator.setOrgProjectTypes(cal.projectTypes || {});
  Estimator.setState(est.detailedEstimation);
  if (est.clientName) Estimator.setClientName(est.clientName);
  view.classList.add('active');
  Estimator.recalc();

  function download(html, name) {
    var url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  saveBtn.addEventListener('click', function () {
    Estimator.closeScopeEditing();
    est.detailedEstimation = Estimator.getState();
    file.savedAt = new Date().toISOString();
    var doc = new DOMParser().parseFromString(PRISTINE, 'text/html');
    // "<" is escaped so no value can close the script element early.
    doc.getElementById('fps-estimation-data').textContent = '\n' + JSON.stringify(file, null, 2).replace(/</g, '\\u003c') + '\n';
    download('<!DOCTYPE html>\n' + doc.documentElement.outerHTML, file.fileName || 'estimation.html');
    if (status) {
      status.classList.remove('is-error');
      status.textContent = 'Saved a new copy of this file at ' + new Date().toLocaleTimeString() + '. Load that copy in the app with Load file.';
    }
  });
})();
