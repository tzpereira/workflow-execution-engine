// Trigger a browser download of text as a file. Used by the Export controls in
// the toolbar and the command palette so both write files the same way.
export function downloadText(text: string, fileName: string) {
  const blob = new Blob([text], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
