(async function () {
  'use strict';
  const status = document.getElementById('access-status');
  const action = document.getElementById('access-action');
  const signOut = document.getElementById('access-signout');
  try {
    const response = await fetch('/api/user');
    if (response.status === 401) return;
    if (response.status === 403) {
      status.textContent = 'Your signed-in account has not been granted an Admin or Explorer role.';
      action.hidden = true;
      signOut.hidden = false;
      return;
    }
    if (!response.ok) throw new Error('Unable to verify your access. Please reload to try again.');
    status.textContent = 'Your account has access to the workspace.';
    action.href = '/';
    action.textContent = 'Open workspace';
    signOut.hidden = false;
  } catch (err) {
    status.textContent = err.message;
  }
})();
