#include "usb_print_manager.h"

#include <tchar.h>

#include <codecvt>
#include <locale>

namespace unified_esc_pos_printer {

// ── Helpers ──────────────────────────────────────────────────────────────

static std::string WideToUtf8(const wchar_t* wide) {
  if (!wide || !*wide) return {};
  int len = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
  if (len <= 0) return {};
  std::string out(len - 1, '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide, -1, out.data(), len, nullptr, nullptr);
  return out;
}

static std::wstring Utf8ToWide(const std::string& utf8) {
  if (utf8.empty()) return {};
  int len = MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  if (len <= 0) return {};
  std::wstring out(len, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), len);
  return out;
}

// ── UsbPrintManager ──────────────────────────────────────────────────────

UsbPrintManager::UsbPrintManager() {}

UsbPrintManager::~UsbPrintManager() {
  Close();
}

std::vector<PrinterInfo> UsbPrintManager::ListPrinters() {
  std::vector<PrinterInfo> printers;

  // Query the default printer name.
  DWORD default_size = 0;
  GetDefaultPrinterW(nullptr, &default_size);
  std::wstring default_name(default_size, L'\0');
  bool has_default = false;
  if (default_size > 0 && GetDefaultPrinterW(default_name.data(), &default_size)) {
    default_name.resize(default_size - 1);  // strip trailing NUL
    has_default = true;
  }

  // Enumerate installed printers (local + network connections).
  DWORD needed = 0, returned = 0;
  DWORD flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
  EnumPrintersW(flags, nullptr, 2, nullptr, 0, &needed, &returned);
  if (needed == 0) return printers;

  std::vector<BYTE> buffer(needed);
  if (!EnumPrintersW(flags, nullptr, 2, buffer.data(), needed, &needed, &returned)) {
    return printers;
  }

  auto* info = reinterpret_cast<PRINTER_INFO_2W*>(buffer.data());
  for (DWORD i = 0; i < returned; ++i) {
    bool is_default = has_default &&
        _wcsicmp(info[i].pPrinterName, default_name.c_str()) == 0;

    bool is_available =
        (info[i].Status &
         (PRINTER_STATUS_NOT_AVAILABLE | PRINTER_STATUS_ERROR |
          PRINTER_STATUS_OFFLINE | PRINTER_STATUS_PAUSED)) == 0;

    printers.push_back(PrinterInfo{
        WideToUtf8(info[i].pPrinterName),
        WideToUtf8(info[i].pDriverName),
        is_default,
        is_available,
    });
  }

  return printers;
}

bool UsbPrintManager::Open(const std::string& printer_name) {
  Close();  // close any previous handle

  std::wstring wide_name = Utf8ToWide(printer_name);
  if (!OpenPrinterW(const_cast<LPWSTR>(wide_name.c_str()), &printer_handle_, nullptr)) {
    printer_handle_ = INVALID_HANDLE_VALUE;
    return false;
  }
  return true;
}

bool UsbPrintManager::PrintBytes(const std::vector<uint8_t>& data) {
  if (printer_handle_ == INVALID_HANDLE_VALUE || data.empty()) return false;

  DOC_INFO_1W doc_info = {};
  doc_info.pDocName = const_cast<LPWSTR>(L"ESC/POS Print Job");
  doc_info.pOutputFile = nullptr;
  doc_info.pDatatype = const_cast<LPWSTR>(L"RAW");

  DWORD job_id = StartDocPrinterW(printer_handle_, 1, reinterpret_cast<LPBYTE>(&doc_info));
  if (job_id == 0) return false;

  bool ok = false;
  if (StartPagePrinter(printer_handle_)) {
    DWORD written = 0;
    ok = WritePrinter(printer_handle_,
                      const_cast<LPVOID>(static_cast<const void*>(data.data())),
                      static_cast<DWORD>(data.size()),
                      &written) &&
         written == static_cast<DWORD>(data.size());
    EndPagePrinter(printer_handle_);
  }

  EndDocPrinter(printer_handle_);
  return ok;
}

bool UsbPrintManager::Close() {
  if (printer_handle_ != INVALID_HANDLE_VALUE) {
    ClosePrinter(printer_handle_);
    printer_handle_ = INVALID_HANDLE_VALUE;
    return true;
  }
  return false;
}

}  // namespace unified_esc_pos_printer
