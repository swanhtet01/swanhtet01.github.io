#include "connected_security_store.h"

#include <aclapi.h>
#include <dpapi.h>
#include <knownfolders.h>
#include <sddl.h>
#include <shlobj.h>

#include <algorithm>
#include <fstream>
#include <limits>
#include <memory>
#include <system_error>
#include <utility>

namespace supermega::connected_security {
namespace {

constexpr size_t kMaximumTlsMaterialBytes = 1024 * 1024;
constexpr size_t kMaximumSealedBytes = 2 * 1024 * 1024;

struct LocalFreeDeleter {
  void operator()(void* value) const {
    if (value != nullptr) LocalFree(value);
  }
};

using LocalPointer = std::unique_ptr<void, LocalFreeDeleter>;

bool IsToken(const std::string& value) {
  if (value.empty() || value.size() > 128) return false;
  for (const unsigned char character : value) {
    const bool allowed =
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9') || character == '.' ||
        character == '_' || character == ':' || character == '-';
    if (!allowed) return false;
  }
  const unsigned char first = static_cast<unsigned char>(value.front());
  return (first >= 'a' && first <= 'z') ||
         (first >= 'A' && first <= 'Z') ||
         (first >= '0' && first <= '9');
}

bool IsOrdinaryDirectory(const std::filesystem::path& path) {
  const DWORD attributes = GetFileAttributesW(path.c_str());
  return attributes != INVALID_FILE_ATTRIBUTES &&
         (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0 &&
         (attributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0;
}

bool IsOrdinaryFile(const std::filesystem::path& path) {
  const DWORD attributes = GetFileAttributesW(path.c_str());
  return attributes != INVALID_FILE_ATTRIBUTES &&
         (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0 &&
         (attributes & FILE_ATTRIBUTE_REPARSE_POINT) == 0;
}

std::optional<std::wstring> CurrentUserSidString() {
  HANDLE raw_token = nullptr;
  if (!OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &raw_token)) {
    return std::nullopt;
  }
  const std::unique_ptr<void, decltype(&CloseHandle)> token(raw_token,
                                                            CloseHandle);
  DWORD required = 0;
  GetTokenInformation(raw_token, TokenUser, nullptr, 0, &required);
  if (required == 0) return std::nullopt;
  std::vector<uint8_t> storage(required);
  if (!GetTokenInformation(raw_token, TokenUser, storage.data(), required,
                           &required)) {
    return std::nullopt;
  }
  const auto* user = reinterpret_cast<const TOKEN_USER*>(storage.data());
  LPWSTR raw_sid = nullptr;
  if (!ConvertSidToStringSidW(user->User.Sid, &raw_sid)) {
    return std::nullopt;
  }
  LocalPointer sid(raw_sid);
  return std::wstring(raw_sid);
}

bool LockPathToCurrentUserAndSystem(const std::filesystem::path& path) {
  const auto sid = CurrentUserSidString();
  if (!sid.has_value()) return false;
  const std::wstring sddl =
      L"D:P(A;;FA;;;SY)(A;;FA;;;" + sid.value() + L")";
  PSECURITY_DESCRIPTOR raw_descriptor = nullptr;
  if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(
          sddl.c_str(), SDDL_REVISION_1, &raw_descriptor, nullptr)) {
    return false;
  }
  LocalPointer descriptor(raw_descriptor);
  BOOL present = FALSE;
  BOOL defaulted = FALSE;
  PACL dacl = nullptr;
  if (!GetSecurityDescriptorDacl(raw_descriptor, &present, &dacl,
                                 &defaulted) ||
      !present || dacl == nullptr) {
    return false;
  }
  const DWORD result = SetNamedSecurityInfoW(
      const_cast<LPWSTR>(path.c_str()), SE_FILE_OBJECT,
      DACL_SECURITY_INFORMATION | PROTECTED_DACL_SECURITY_INFORMATION, nullptr,
      nullptr, dacl, nullptr);
  return result == ERROR_SUCCESS;
}

bool EnsureLockedDirectory(const std::filesystem::path& path) {
  std::error_code error;
  if (!std::filesystem::exists(path, error)) {
    if (!std::filesystem::create_directory(path, error) || error) {
      return false;
    }
  }
  return IsOrdinaryDirectory(path) && LockPathToCurrentUserAndSystem(path);
}

std::optional<std::filesystem::path> EnsureLockedStoreRoot(
    const std::filesystem::path& local_app_data) {
  if (!IsOrdinaryDirectory(local_app_data)) return std::nullopt;
  auto current = local_app_data;
  for (const wchar_t* component :
       {L"SuperMega", L"Shop", L"connected-security-v1"}) {
    current /= component;
    if (!EnsureLockedDirectory(current)) return std::nullopt;
  }
  return current;
}

std::optional<std::vector<uint8_t>> ReadBounded(
    const std::filesystem::path& path) {
  if (!IsOrdinaryFile(path)) return std::nullopt;
  std::error_code error;
  const uintmax_t size = std::filesystem::file_size(path, error);
  if (error || size == 0 || size > kMaximumSealedBytes ||
      size > static_cast<uintmax_t>(std::numeric_limits<size_t>::max())) {
    return std::nullopt;
  }
  std::ifstream stream(path, std::ios::binary);
  if (!stream) return std::nullopt;
  std::vector<uint8_t> bytes(static_cast<size_t>(size));
  stream.read(reinterpret_cast<char*>(bytes.data()),
              static_cast<std::streamsize>(bytes.size()));
  if (!stream || stream.peek() != std::char_traits<char>::eof()) {
    SecureZeroMemory(bytes.data(), bytes.size());
    return std::nullopt;
  }
  return bytes;
}

bool WriteNewLocked(const std::filesystem::path& path,
                    const std::vector<uint8_t>& bytes) {
  if (bytes.empty() || bytes.size() > kMaximumSealedBytes ||
      std::filesystem::exists(path)) {
    return false;
  }
  HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr,
                            CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (file == INVALID_HANDLE_VALUE) return false;
  bool ok = false;
  DWORD written = 0;
  if (bytes.size() <= std::numeric_limits<DWORD>::max() &&
      WriteFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &written,
                nullptr) &&
      written == bytes.size() && FlushFileBuffers(file)) {
    ok = true;
  }
  CloseHandle(file);
  if (!ok || !LockPathToCurrentUserAndSystem(path)) {
    DeleteFileW(path.c_str());
    return false;
  }
  return true;
}

}  // namespace

SecureBytes::SecureBytes(std::vector<uint8_t> bytes)
    : bytes_(std::move(bytes)) {}

SecureBytes::SecureBytes(SecureBytes&& other) noexcept
    : bytes_(std::move(other.bytes_)) {
  other.bytes_.clear();
}

SecureBytes& SecureBytes::operator=(SecureBytes&& other) noexcept {
  if (this != &other) {
    Reset();
    bytes_ = std::move(other.bytes_);
    other.bytes_.clear();
  }
  return *this;
}

SecureBytes::~SecureBytes() { Reset(); }

void SecureBytes::Reset() {
  if (!bytes_.empty()) SecureZeroMemory(bytes_.data(), bytes_.size());
  bytes_.clear();
  bytes_.shrink_to_fit();
}

DpapiCurrentUserStore::DpapiCurrentUserStore(std::filesystem::path root)
    : root_(std::move(root)) {}

std::optional<DpapiCurrentUserStore> DpapiCurrentUserStore::Open() {
  PWSTR raw_path = nullptr;
  if (SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_DEFAULT, nullptr,
                           &raw_path) != S_OK) {
    return std::nullopt;
  }
  const std::unique_ptr<wchar_t, decltype(&CoTaskMemFree)> local_app_data(
      raw_path, CoTaskMemFree);
  const auto root = EnsureLockedStoreRoot(std::filesystem::path(raw_path));
  if (!root.has_value()) return std::nullopt;
  return DpapiCurrentUserStore(root.value());
}

std::optional<std::filesystem::path> DpapiCurrentUserStore::MaterialPath(
    const std::string& alias, const std::string& material_id) const {
  if (!IsToken(alias) || !IsToken(material_id) || !IsOrdinaryDirectory(root_)) {
    return std::nullopt;
  }
  const std::filesystem::path path =
      root_ / std::filesystem::path(alias + "--" + material_id + ".dpapi");
  if (path.parent_path() != root_) return std::nullopt;
  return path;
}

std::vector<uint8_t> DpapiCurrentUserStore::Entropy(
    const std::string& alias, const std::string& material_id) const {
  std::string source("supermega.connected-security.dpapi.v1", 37);
  source.push_back('\0');
  source.append(alias);
  source.push_back('\0');
  source.append(material_id);
  return std::vector<uint8_t>(source.begin(), source.end());
}

bool DpapiCurrentUserStore::SealTlsMaterial(
    const std::string& alias, const std::string& material_id,
    const std::vector<uint8_t>& plaintext) const {
  const auto path = MaterialPath(alias, material_id);
  if (!path.has_value() || plaintext.empty() ||
      plaintext.size() > kMaximumTlsMaterialBytes ||
      plaintext.size() > std::numeric_limits<DWORD>::max()) {
    return false;
  }
  auto entropy = Entropy(alias, material_id);
  DATA_BLOB input{static_cast<DWORD>(plaintext.size()),
                  const_cast<BYTE*>(plaintext.data())};
  DATA_BLOB optional_entropy{static_cast<DWORD>(entropy.size()),
                             entropy.data()};
  DATA_BLOB output{};
  const bool protected_ok = CryptProtectData(
      &input, L"SuperMega connected TLS material", &optional_entropy, nullptr,
      nullptr, CRYPTPROTECT_UI_FORBIDDEN, &output);
  SecureZeroMemory(entropy.data(), entropy.size());
  if (!protected_ok || output.pbData == nullptr || output.cbData == 0) {
    if (output.pbData != nullptr) LocalFree(output.pbData);
    return false;
  }
  std::vector<uint8_t> sealed(output.pbData, output.pbData + output.cbData);
  SecureZeroMemory(output.pbData, output.cbData);
  LocalFree(output.pbData);
  const bool written = WriteNewLocked(path.value(), sealed);
  SecureZeroMemory(sealed.data(), sealed.size());
  return written;
}

std::optional<SecureBytes> DpapiCurrentUserStore::OpenTlsMaterial(
    const std::string& alias, const std::string& material_id) const {
  const auto path = MaterialPath(alias, material_id);
  if (!path.has_value()) return std::nullopt;
  auto sealed = ReadBounded(path.value());
  if (!sealed.has_value() || sealed->size() > std::numeric_limits<DWORD>::max()) {
    return std::nullopt;
  }
  auto entropy = Entropy(alias, material_id);
  DATA_BLOB input{static_cast<DWORD>(sealed->size()), sealed->data()};
  DATA_BLOB optional_entropy{static_cast<DWORD>(entropy.size()),
                             entropy.data()};
  DATA_BLOB output{};
  const bool unprotected = CryptUnprotectData(
      &input, nullptr, &optional_entropy, nullptr, nullptr,
      CRYPTPROTECT_UI_FORBIDDEN, &output);
  SecureZeroMemory(entropy.data(), entropy.size());
  SecureZeroMemory(sealed->data(), sealed->size());
  if (!unprotected || output.pbData == nullptr || output.cbData == 0 ||
      output.cbData > kMaximumTlsMaterialBytes) {
    if (output.pbData != nullptr) {
      SecureZeroMemory(output.pbData, output.cbData);
      LocalFree(output.pbData);
    }
    return std::nullopt;
  }
  std::vector<uint8_t> plaintext(output.pbData, output.pbData + output.cbData);
  SecureZeroMemory(output.pbData, output.cbData);
  LocalFree(output.pbData);
  return SecureBytes(std::move(plaintext));
}

bool DpapiCurrentUserStore::DeleteTlsMaterial(
    const std::string& alias, const std::string& material_id) const {
  const auto path = MaterialPath(alias, material_id);
  if (!path.has_value()) return false;
  if (!std::filesystem::exists(path.value())) return true;
  return IsOrdinaryFile(path.value()) && DeleteFileW(path->c_str());
}

bool SupportsPersistentNonExportableEd25519() { return false; }

}  // namespace supermega::connected_security
