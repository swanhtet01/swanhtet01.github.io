#ifndef USB_PRINT_MANAGER_H_
#define USB_PRINT_MANAGER_H_

#include <windows.h>
#include <winspool.h>

#include <string>
#include <vector>

namespace unified_esc_pos_printer {

struct PrinterInfo {
  std::string name;
  std::string model;
  bool is_default;
  bool is_available;
};

// Thin wrapper around the Windows Print Spooler API for sending raw ESC/POS
// bytes to an installed printer.
class UsbPrintManager {
 public:
  UsbPrintManager();
  ~UsbPrintManager();

  // Enumerate local and connected printers via EnumPrintersW.
  static std::vector<PrinterInfo> ListPrinters();

  // Open a printer by name (OpenPrinterW).
  bool Open(const std::string& printer_name);

  // Send raw bytes through the spooler (StartDocPrinter → WritePrinter →
  // EndDocPrinter).
  bool PrintBytes(const std::vector<uint8_t>& data);

  // Close the printer handle (ClosePrinter).
  bool Close();

  bool IsOpen() const { return printer_handle_ != INVALID_HANDLE_VALUE; }

 private:
  HANDLE printer_handle_ = INVALID_HANDLE_VALUE;
};

}  // namespace unified_esc_pos_printer

#endif  // USB_PRINT_MANAGER_H_
