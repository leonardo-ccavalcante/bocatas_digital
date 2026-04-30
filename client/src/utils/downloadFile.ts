/**
 * Download file to user's computer
 * @param content - File content (string or Blob)
 * @param fileName - Name of file to download
 * @param mimeType - MIME type of file (default: text/plain)
 */
export function downloadFile(
  content: string | Blob,
  fileName: string,
  mimeType: string = 'text/plain'
): void {
  // Create blob if content is string
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType });

  // Create temporary URL
  const url = URL.createObjectURL(blob);

  // Create temporary link element
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;

  // Append to body, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up URL
  URL.revokeObjectURL(url);
}
