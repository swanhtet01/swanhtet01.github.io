// A preview may finish digesting after the owner clears the file, starts a newer
// mapping request, or changes the product workflow. Resolve it only while the
// request that started the async work still owns the screen.
export async function resolveClientImportPreviewIfCurrent<T>(
  previewPromise: Promise<T>,
  isCurrentRequest: () => boolean,
): Promise<T | null> {
  const preview = await previewPromise
  return isCurrentRequest() ? preview : null
}
