// Hand a file to the browser, then let go of it.
//
// An object URL that is minted and never revoked pins its whole buffer for the life of the
// page. On the Shop screen a till sits on all day, at the workspace ceiling, that buffer is
// megabytes -- on the device least able to spare them. One place that gets the revocation
// right, rather than a copy per download that each has to remember.
//
// This is the helper WorkspaceControlsPage.tsx introduced in #535 for exactly this reason,
// lifted into its own module so the Shop screen can hand off to it without importing the
// settings page. WorkspaceControlsPage still carries its own copy: #537 is open against that
// file and against the suite that pins the copy's exact text, and colliding with an open lane
// to save one function is not a trade worth making. Pointing it here is a one-line follow-up
// once #537 lands, and the two bodies are byte-identical until then.
export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.download = filename
  anchor.href = url
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
