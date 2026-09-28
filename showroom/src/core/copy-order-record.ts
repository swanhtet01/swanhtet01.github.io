export async function copyOrderRecordText(
  text: string,
  clipboard: { writeText: (value: string) => Promise<void> } | undefined,
): Promise<string> {
  try {
    if (!clipboard) throw new Error('clipboard_unavailable')
    await clipboard.writeText(text)
    return 'Order record copied.'
  } catch {
    return 'Could not copy. Try again or use Print order record to save a copy.'
  }
}
