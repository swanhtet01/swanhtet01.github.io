#include "postgres17_execution_broker_protocol.hpp"

#ifndef _WIN32

int main() {
  // This executable is intentionally Windows-only.  The Linux build exists
  // solely so the dependency-free protocol can be compiled in source checks.
  return 125;
}

#else

#ifndef _WIN32_WINNT
#define _WIN32_WINNT 0x0A00
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#define NOMINMAX
#include <windows.h>
#include <aclapi.h>
#include <bcrypt.h>
#include <sddl.h>
#include <tlhelp32.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <climits>
#include <cstdint>
#include <cstring>
#include <cwctype>
#include <limits>
#include <set>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "bcrypt.lib")

namespace sm = supermega::postgres17;

namespace {

constexpr DWORD kOpenFlags =
    FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS;
constexpr std::size_t kMaximumFrame = sm::kMaximumEnvelopeBytes;
constexpr wchar_t kJournalName[] = L".supermega-broker-journal";
constexpr wchar_t kSpawnLockName[] = L".supermega-broker-spawn.lock";

class UniqueHandle final {
 public:
  UniqueHandle() = default;
  explicit UniqueHandle(HANDLE handle) : handle_(handle) {}
  ~UniqueHandle() { Reset(); }
  UniqueHandle(const UniqueHandle&) = delete;
  UniqueHandle& operator=(const UniqueHandle&) = delete;
  UniqueHandle(UniqueHandle&& other) noexcept : handle_(other.Release()) {}
  UniqueHandle& operator=(UniqueHandle&& other) noexcept {
    if (this != &other) Reset(other.Release());
    return *this;
  }
  [[nodiscard]] HANDLE get() const { return handle_; }
  [[nodiscard]] bool valid() const {
    return handle_ != nullptr && handle_ != INVALID_HANDLE_VALUE;
  }
  HANDLE Release() {
    HANDLE value = handle_;
    handle_ = INVALID_HANDLE_VALUE;
    return value;
  }
  void Reset(HANDLE handle = INVALID_HANDLE_VALUE) {
    if (valid()) CloseHandle(handle_);
    handle_ = handle;
  }

 private:
  HANDLE handle_{INVALID_HANDLE_VALUE};
};

class LocalMemory final {
 public:
  LocalMemory() = default;
  explicit LocalMemory(void* value) : value_(value) {}
  ~LocalMemory() {
    if (value_ != nullptr) LocalFree(value_);
  }
  LocalMemory(const LocalMemory&) = delete;
  LocalMemory& operator=(const LocalMemory&) = delete;
  [[nodiscard]] void* get() const { return value_; }

 private:
  void* value_{nullptr};
};

struct Identity final {
  std::string volume;
  std::string file;
};

struct LockedFile final {
  sm::FileSpec spec;
  std::wstring absolute_path;
  UniqueHandle handle;
  Identity identity;
};

struct LockedDirectory final {
  std::wstring relative_path;
  std::wstring absolute_path;
  UniqueHandle handle;
  Identity identity;
};

std::string Hex(const std::uint8_t* data, std::size_t size) {
  constexpr char digits[] = "0123456789abcdef";
  std::string output;
  output.reserve(size * 2);
  for (std::size_t index = 0; index < size; ++index) {
    output.push_back(digits[data[index] >> 4U]);
    output.push_back(digits[data[index] & 0x0fU]);
  }
  return output;
}

std::string Hex64(std::uint64_t value) {
  std::array<std::uint8_t, 8> bytes{};
  for (std::size_t index = 0; index < bytes.size(); ++index) {
    bytes[bytes.size() - index - 1] =
        static_cast<std::uint8_t>((value >> (index * 8U)) & 0xffU);
  }
  return Hex(bytes.data(), bytes.size());
}

bool Sha256Bytes(const std::uint8_t* data, std::size_t size,
                 std::string* digest) {
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  DWORD object_size = 0;
  DWORD result_size = 0;
  std::vector<std::uint8_t> object;
  std::array<std::uint8_t, 32> output{};
  NTSTATUS status = BCryptOpenAlgorithmProvider(
      &algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
  if (status >= 0) {
    status = BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH,
                               reinterpret_cast<PUCHAR>(&object_size),
                               sizeof(object_size), &result_size, 0);
  }
  if (status >= 0) {
    object.resize(object_size);
    status = BCryptCreateHash(algorithm, &hash, object.data(), object_size,
                              nullptr, 0, 0);
  }
  if (status >= 0 && size != 0) {
    if (size > std::numeric_limits<ULONG>::max()) status = -1;
    else status = BCryptHashData(hash, const_cast<PUCHAR>(data),
                                 static_cast<ULONG>(size), 0);
  }
  if (status >= 0) {
    status = BCryptFinishHash(hash, output.data(),
                              static_cast<ULONG>(output.size()), 0);
  }
  if (hash != nullptr) BCryptDestroyHash(hash);
  if (algorithm != nullptr) BCryptCloseAlgorithmProvider(algorithm, 0);
  if (status < 0) return false;
  *digest = Hex(output.data(), output.size());
  return true;
}

bool Sha256Vector(const std::vector<std::uint8_t>& value, std::string* digest) {
  return Sha256Bytes(value.data(), value.size(), digest);
}

bool StableRecoveryDigest(const sm::BrokerConfig& config, std::string* digest) {
  std::vector<sm::Field> fields = {
      {"contract", "supermega.postgres17-windows-broker-recovery.v1"},
      {"daclSddl", config.dacl_sddl}, {"daclSha256", config.dacl_sha256},
      {"ownerSid", config.owner_sid}, {"pythonRelative", config.python_relative},
      {"requestorSid", config.requestor_sid}, {"sessionId", config.session_id},
      {"sourceRoot", config.source_root}, {"stageLeaf", config.stage_leaf},
      {"stageParent", config.stage_parent},
      {"timeoutMs", std::to_string(config.timeout_ms)},
  };
  for (std::size_t index = 0; index < config.files.size(); ++index) {
    const std::string prefix = std::string("file.") +
        (index < 10 ? "00" : index < 100 ? "0" : "") +
        std::to_string(index) + ".";
    fields.push_back({prefix + "bytes", std::to_string(config.files[index].bytes)});
    fields.push_back({prefix + "relativePath", config.files[index].relative_path});
    fields.push_back({prefix + "role", config.files[index].role});
    fields.push_back({prefix + "sha256", config.files[index].sha256});
  }
  for (std::size_t index = 0; index < config.arguments.size(); ++index) {
    const std::string name = std::string("argument.") +
        (index < 10 ? "00" : index < 100 ? "0" : "") +
        std::to_string(index);
    fields.push_back({name, config.arguments[index]});
  }
  const auto bytes = sm::SerializeEnvelope(std::move(fields));
  return !bytes.empty() && Sha256Vector(bytes, digest);
}

bool Sha256Handle(HANDLE handle, std::uint64_t expected_size,
                  std::string* digest) {
  LARGE_INTEGER zero{};
  if (!SetFilePointerEx(handle, zero, nullptr, FILE_BEGIN)) return false;
  BCRYPT_ALG_HANDLE algorithm = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  DWORD object_size = 0;
  DWORD result_size = 0;
  std::vector<std::uint8_t> object;
  std::array<std::uint8_t, 32> output{};
  NTSTATUS status = BCryptOpenAlgorithmProvider(
      &algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0);
  if (status >= 0) {
    status = BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH,
                               reinterpret_cast<PUCHAR>(&object_size),
                               sizeof(object_size), &result_size, 0);
  }
  if (status >= 0) {
    object.resize(object_size);
    status = BCryptCreateHash(algorithm, &hash, object.data(), object_size,
                              nullptr, 0, 0);
  }
  std::array<std::uint8_t, 65536> buffer{};
  std::uint64_t total = 0;
  while (status >= 0) {
    DWORD read = 0;
    if (!ReadFile(handle, buffer.data(), static_cast<DWORD>(buffer.size()),
                  &read, nullptr)) {
      status = -1;
      break;
    }
    if (read == 0) break;
    total += read;
    status = BCryptHashData(hash, buffer.data(), read, 0);
  }
  if (status >= 0 && total == expected_size) {
    status = BCryptFinishHash(hash, output.data(),
                              static_cast<ULONG>(output.size()), 0);
  } else {
    status = -1;
  }
  if (hash != nullptr) BCryptDestroyHash(hash);
  if (algorithm != nullptr) BCryptCloseAlgorithmProvider(algorithm, 0);
  SetFilePointerEx(handle, zero, nullptr, FILE_BEGIN);
  if (status < 0) return false;
  *digest = Hex(output.data(), output.size());
  return true;
}

bool ReadExact(HANDLE handle, void* destination, DWORD bytes) {
  auto* cursor = static_cast<std::uint8_t*>(destination);
  DWORD remaining = bytes;
  while (remaining != 0) {
    DWORD read = 0;
    if (!ReadFile(handle, cursor, remaining, &read, nullptr) || read == 0) {
      return false;
    }
    cursor += read;
    remaining -= read;
  }
  return true;
}

bool ReadFrame(HANDLE handle, std::vector<std::uint8_t>* bytes) {
  std::array<std::uint8_t, 4> header{};
  if (!ReadExact(handle, header.data(), static_cast<DWORD>(header.size()))) {
    return false;
  }
  const std::uint32_t size = static_cast<std::uint32_t>(header[0]) |
      (static_cast<std::uint32_t>(header[1]) << 8U) |
      (static_cast<std::uint32_t>(header[2]) << 16U) |
      (static_cast<std::uint32_t>(header[3]) << 24U);
  if (size == 0 || size > kMaximumFrame) return false;
  bytes->resize(size);
  return ReadExact(handle, bytes->data(), size);
}

bool ReadFrameBounded(HANDLE handle, DWORD timeout_ms,
                      std::vector<std::uint8_t>* bytes) {
  const auto deadline = std::chrono::steady_clock::now() +
      std::chrono::milliseconds(timeout_ms);
  while (std::chrono::steady_clock::now() < deadline) {
    DWORD available = 0;
    if (!PeekNamedPipe(handle, nullptr, 0, nullptr, &available, nullptr)) {
      return false;
    }
    if (available >= 4) {
      std::array<std::uint8_t, 4> header{};
      DWORD peeked = 0;
      if (!PeekNamedPipe(handle, header.data(), static_cast<DWORD>(header.size()),
                         &peeked, nullptr, nullptr) || peeked != header.size()) {
        return false;
      }
      const std::uint32_t size = static_cast<std::uint32_t>(header[0]) |
          (static_cast<std::uint32_t>(header[1]) << 8U) |
          (static_cast<std::uint32_t>(header[2]) << 16U) |
          (static_cast<std::uint32_t>(header[3]) << 24U);
      if (size == 0 || size > kMaximumFrame) return false;
      if (available >= size + header.size()) return ReadFrame(handle, bytes);
    }
    Sleep(10);
  }
  return false;
}

bool WriteAll(HANDLE handle, const void* source, DWORD bytes) {
  const auto* cursor = static_cast<const std::uint8_t*>(source);
  DWORD remaining = bytes;
  while (remaining != 0) {
    DWORD written = 0;
    if (!WriteFile(handle, cursor, remaining, &written, nullptr) || written == 0) {
      return false;
    }
    cursor += written;
    remaining -= written;
  }
  return true;
}

bool WriteFrame(HANDLE handle, const std::vector<std::uint8_t>& bytes) {
  if (bytes.empty() || bytes.size() > kMaximumFrame) return false;
  const std::uint32_t size = static_cast<std::uint32_t>(bytes.size());
  const std::array<std::uint8_t, 4> header = {
      static_cast<std::uint8_t>(size & 0xffU),
      static_cast<std::uint8_t>((size >> 8U) & 0xffU),
      static_cast<std::uint8_t>((size >> 16U) & 0xffU),
      static_cast<std::uint8_t>((size >> 24U) & 0xffU),
  };
  return WriteAll(handle, header.data(), static_cast<DWORD>(header.size())) &&
         WriteAll(handle, bytes.data(), static_cast<DWORD>(bytes.size()));
}

bool Utf8ToWide(std::string_view value, std::wstring* output) {
  if (!sm::IsValidUtf8(value) || value.size() > INT_MAX) return false;
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS,
                                       value.data(), static_cast<int>(value.size()),
                                       nullptr, 0);
  if (size <= 0) return false;
  output->resize(size);
  return MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(),
                             static_cast<int>(value.size()), output->data(),
                             size) == size;
}

bool WideToUtf8(std::wstring_view value, std::string* output) {
  if (value.size() > INT_MAX) return false;
  const int size = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS,
                                       value.data(), static_cast<int>(value.size()),
                                       nullptr, 0, nullptr, nullptr);
  if (size <= 0) return false;
  output->resize(size);
  return WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, value.data(),
                             static_cast<int>(value.size()), output->data(), size,
                             nullptr, nullptr) == size;
}

bool CanonicalAbsolute(std::string_view input, std::wstring* output) {
  std::wstring wide;
  if (!Utf8ToWide(input, &wide) || wide.size() < 3 || wide[1] != L':' ||
      (wide[2] != L'\\' && wide[2] != L'/') ||
      wide.rfind(L"\\\\", 0) == 0 || wide.rfind(L"\\?\\", 0) == 0) {
    return false;
  }
  const DWORD needed = GetFullPathNameW(wide.c_str(), 0, nullptr, nullptr);
  if (needed == 0) return false;
  std::wstring normalized(needed, L'\0');
  const DWORD written = GetFullPathNameW(wide.c_str(), needed,
                                         normalized.data(), nullptr);
  if (written == 0 || written >= needed) return false;
  normalized.resize(written);
  if (CompareStringOrdinal(wide.c_str(), static_cast<int>(wide.size()),
                           normalized.c_str(), static_cast<int>(normalized.size()),
                           TRUE) != CSTR_EQUAL) {
    return false;
  }
  *output = std::move(normalized);
  return true;
}

std::wstring Join(std::wstring_view root, std::string_view relative) {
  std::wstring wide_relative;
  if (!Utf8ToWide(relative, &wide_relative)) return {};
  std::replace(wide_relative.begin(), wide_relative.end(), L'/', L'\\');
  std::wstring value(root);
  if (!value.empty() && value.back() != L'\\') value.push_back(L'\\');
  value.append(wide_relative);
  return value;
}

bool HandleIsPipe(HANDLE handle) {
  return handle != nullptr && handle != INVALID_HANDLE_VALUE &&
         GetFileType(handle) == FILE_TYPE_PIPE;
}

bool ClearInheritance(HANDLE handle) {
  return SetHandleInformation(handle, HANDLE_FLAG_INHERIT, 0) != FALSE;
}

bool SetInheritance(HANDLE handle) {
  return SetHandleInformation(handle, HANDLE_FLAG_INHERIT,
                              HANDLE_FLAG_INHERIT) != FALSE;
}

bool QueryIdentity(HANDLE handle, Identity* identity) {
  FILE_ID_INFO info{};
  if (!GetFileInformationByHandleEx(handle, FileIdInfo, &info, sizeof(info))) {
    return false;
  }
  identity->volume = Hex64(info.VolumeSerialNumber);
  identity->file = Hex(info.FileId.Identifier, sizeof(info.FileId.Identifier));
  return true;
}

bool IsSafeFile(HANDLE handle, std::uint64_t bytes) {
  FILE_ATTRIBUTE_TAG_INFO tag{};
  BY_HANDLE_FILE_INFORMATION basic{};
  LARGE_INTEGER size{};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &tag,
                                    sizeof(tag)) ||
      !GetFileInformationByHandle(handle, &basic) ||
      !GetFileSizeEx(handle, &size) || size.QuadPart < 0 ||
      static_cast<std::uint64_t>(size.QuadPart) != bytes ||
      (tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
      tag.ReparseTag != 0 || basic.nNumberOfLinks != 1) {
    return false;
  }
  std::vector<std::uint8_t> stream_buffer(64 * 1024);
  if (!GetFileInformationByHandleEx(handle, FileStreamInfo,
                                    stream_buffer.data(),
                                    static_cast<DWORD>(stream_buffer.size()))) {
    return false;
  }
  const auto* stream =
      reinterpret_cast<const FILE_STREAM_INFO*>(stream_buffer.data());
  if (stream->NextEntryOffset != 0 || stream->StreamNameLength != 14) {
    return false;
  }
  return std::wstring_view(stream->StreamName,
                           stream->StreamNameLength / sizeof(wchar_t)) ==
         L"::$DATA";
}

bool IsSafeDirectory(HANDLE handle, Identity* identity) {
  FILE_ATTRIBUTE_TAG_INFO tag{};
  if (!GetFileInformationByHandleEx(handle, FileAttributeTagInfo, &tag,
                                    sizeof(tag)) ||
      (tag.FileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0 ||
      (tag.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0 ||
      tag.ReparseTag != 0) {
    return false;
  }
  return QueryIdentity(handle, identity);
}

UniqueHandle OpenDirectory(const std::wstring& path, DWORD extra_access = 0) {
  return UniqueHandle(CreateFileW(
      path.c_str(), FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES | READ_CONTROL |
                        extra_access,
      FILE_SHARE_READ, nullptr, OPEN_EXISTING, kOpenFlags, nullptr));
}

UniqueHandle OpenFileRead(const std::wstring& path, DWORD extra_access = 0) {
  return UniqueHandle(CreateFileW(
      path.c_str(), GENERIC_READ | FILE_READ_ATTRIBUTES | READ_CONTROL |
                        extra_access,
      FILE_SHARE_READ, nullptr, OPEN_EXISTING,
      FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN, nullptr));
}

bool OpenDirectoryIdentityChain(const std::wstring& canonical_path,
                                std::vector<LockedDirectory>* chain) {
  if (canonical_path.size() < 3 || canonical_path[1] != L':' ||
      canonical_path[2] != L'\\') return false;
  std::wstring current = canonical_path.substr(0, 3);
  std::size_t offset = 3;
  while (true) {
    LockedDirectory directory;
    directory.absolute_path = current;
    directory.handle = OpenDirectory(current);
    if (!directory.handle.valid() ||
        !IsSafeDirectory(directory.handle.get(), &directory.identity) ||
        (!chain->empty() && chain->front().identity.volume !=
                                 directory.identity.volume)) return false;
    chain->push_back(std::move(directory));
    if (offset >= canonical_path.size()) break;
    const std::size_t separator = canonical_path.find(L'\\', offset);
    const std::size_t end = separator == std::wstring::npos
        ? canonical_path.size() : separator;
    if (end == offset) return false;
    if (current.size() > 3) current.push_back(L'\\');
    current.append(canonical_path, offset, end - offset);
    offset = separator == std::wstring::npos ? canonical_path.size()
                                              : separator + 1;
  }
  return true;
}

bool DaclIsExactAllowlist(PACL dacl, PSID owner, PSID requestor) {
  if (dacl == nullptr || dacl->AceCount != 2) return false;
  bool owner_seen = false;
  bool requestor_seen = false;
  GENERIC_MAPPING mapping = {FILE_GENERIC_READ, FILE_GENERIC_WRITE,
                             FILE_GENERIC_EXECUTE, FILE_ALL_ACCESS};
  for (DWORD index = 0; index < dacl->AceCount; ++index) {
    void* raw_ace = nullptr;
    if (!GetAce(dacl, index, &raw_ace)) return false;
    const auto* ace = static_cast<const ACCESS_ALLOWED_ACE*>(raw_ace);
    if (ace->Header.AceType != ACCESS_ALLOWED_ACE_TYPE ||
        (ace->Header.AceFlags & (INHERITED_ACE | INHERIT_ONLY_ACE |
                                 OBJECT_INHERIT_ACE |
                                 CONTAINER_INHERIT_ACE)) != 0) return false;
    ACCESS_MASK mask = ace->Mask;
    MapGenericMask(&mask, &mapping);
    PSID sid = const_cast<DWORD*>(&ace->SidStart);
    if (EqualSid(sid, owner)) {
      if (owner_seen || mask != FILE_ALL_ACCESS) return false;
      owner_seen = true;
    } else if (EqualSid(sid, requestor)) {
      const ACCESS_MASK allowed = FILE_GENERIC_READ | FILE_GENERIC_EXECUTE;
      const ACCESS_MASK required = FILE_READ_DATA | FILE_READ_ATTRIBUTES |
                                   FILE_EXECUTE | READ_CONTROL | SYNCHRONIZE;
      if (requestor_seen || (mask & required) != required ||
          (mask & ~allowed) != 0) return false;
      requestor_seen = true;
    } else {
      return false;
    }
  }
  return owner_seen && requestor_seen;
}

bool DaclMatches(HANDLE root, const sm::BrokerConfig& config,
                 std::string* descriptor_digest) {
  PSID owner = nullptr;
  PACL dacl = nullptr;
  PSECURITY_DESCRIPTOR descriptor = nullptr;
  const DWORD error = GetSecurityInfo(
      root, SE_FILE_OBJECT, OWNER_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION,
      &owner, nullptr, &dacl, nullptr, &descriptor);
  LocalMemory descriptor_memory(descriptor);
  if (error != ERROR_SUCCESS || owner == nullptr || dacl == nullptr ||
      descriptor == nullptr || !IsValidSecurityDescriptor(descriptor)) {
    return false;
  }
  SECURITY_DESCRIPTOR_CONTROL control = 0;
  DWORD revision = 0;
  if (!GetSecurityDescriptorControl(descriptor, &control, &revision) ||
      (control & SE_DACL_PROTECTED) == 0) {
    return false;
  }
  LPWSTR owner_text = nullptr;
  if (!ConvertSidToStringSidW(owner, &owner_text)) return false;
  LocalMemory owner_memory(owner_text);
  std::string owner_utf8;
  if (!WideToUtf8(owner_text, &owner_utf8) || owner_utf8 != config.owner_sid) {
    return false;
  }
  const DWORD descriptor_size = GetSecurityDescriptorLength(descriptor);
  if (!Sha256Bytes(static_cast<const std::uint8_t*>(descriptor), descriptor_size,
                   descriptor_digest) ||
      *descriptor_digest != config.dacl_sha256) {
    return false;
  }
  std::wstring requestor_text;
  if (!Utf8ToWide(config.requestor_sid, &requestor_text)) return false;
  PSID requestor = nullptr;
  if (!ConvertStringSidToSidW(requestor_text.c_str(), &requestor)) return false;
  LocalMemory requestor_memory(requestor);
  if (!DaclIsExactAllowlist(dacl, owner, requestor)) return false;
  TRUSTEE_W trustee{};
  BuildTrusteeWithSidW(&trustee, requestor);
  ACCESS_MASK rights = 0;
  if (GetEffectiveRightsFromAclW(dacl, &trustee, &rights) != ERROR_SUCCESS) {
    return false;
  }
  const ACCESS_MASK forbidden = FILE_WRITE_DATA | FILE_APPEND_DATA |
      FILE_WRITE_EA | FILE_WRITE_ATTRIBUTES | DELETE | WRITE_DAC | WRITE_OWNER;
  return (rights & forbidden) == 0 &&
         (rights & FILE_READ_DATA) != 0 &&
         (rights & FILE_EXECUTE) != 0;
}

bool ParseSecurityDescriptor(const sm::BrokerConfig& config,
                             PSECURITY_DESCRIPTOR* descriptor,
                             SECURITY_ATTRIBUTES* attributes) {
  std::wstring sddl;
  if (!Utf8ToWide(config.dacl_sddl, &sddl) ||
      !ConvertStringSecurityDescriptorToSecurityDescriptorW(
          sddl.c_str(), SDDL_REVISION_1, descriptor, nullptr)) {
    return false;
  }
  const DWORD size = GetSecurityDescriptorLength(*descriptor);
  std::string digest;
  if (!Sha256Bytes(static_cast<const std::uint8_t*>(*descriptor), size, &digest) ||
      digest != config.dacl_sha256) {
    LocalFree(*descriptor);
    *descriptor = nullptr;
    return false;
  }
  attributes->nLength = sizeof(*attributes);
  attributes->lpSecurityDescriptor = *descriptor;
  attributes->bInheritHandle = FALSE;
  return true;
}

bool CopyExactFile(HANDLE source, HANDLE destination, std::uint64_t bytes) {
  std::array<std::uint8_t, 65536> buffer{};
  std::uint64_t total = 0;
  LARGE_INTEGER zero{};
  if (!SetFilePointerEx(source, zero, nullptr, FILE_BEGIN)) return false;
  while (true) {
    DWORD read = 0;
    if (!ReadFile(source, buffer.data(), static_cast<DWORD>(buffer.size()),
                  &read, nullptr)) {
      return false;
    }
    if (read == 0) break;
    if (!WriteAll(destination, buffer.data(), read)) return false;
    total += read;
    if (total > bytes) return false;
  }
  return total == bytes && FlushFileBuffers(destination) != FALSE &&
         SetFilePointerEx(source, zero, nullptr, FILE_BEGIN) != FALSE &&
         SetFilePointerEx(destination, zero, nullptr, FILE_BEGIN) != FALSE;
}

std::vector<std::string> ParentDirectories(std::string_view relative) {
  std::vector<std::string> output;
  std::size_t offset = 0;
  while (true) {
    const std::size_t slash = relative.find('/', offset);
    if (slash == std::string_view::npos) break;
    output.emplace_back(relative.substr(0, slash));
    offset = slash + 1;
  }
  return output;
}

std::wstring QuoteArgument(std::wstring_view argument) {
  if (argument.find_first_of(L" \t\"") == std::wstring_view::npos) {
    return std::wstring(argument);
  }
  std::wstring output(1, L'"');
  std::size_t slashes = 0;
  for (wchar_t character : argument) {
    if (character == L'\\') {
      ++slashes;
    } else if (character == L'"') {
      output.append(slashes * 2 + 1, L'\\');
      output.push_back(L'"');
      slashes = 0;
    } else {
      output.append(slashes, L'\\');
      slashes = 0;
      output.push_back(character);
    }
  }
  output.append(slashes * 2, L'\\');
  output.push_back(L'"');
  return output;
}

bool MarkDelete(HANDLE handle) {
  FILE_DISPOSITION_INFO_EX disposition{};
  disposition.Flags = FILE_DISPOSITION_FLAG_DELETE |
                      FILE_DISPOSITION_FLAG_POSIX_SEMANTICS |
                      FILE_DISPOSITION_FLAG_IGNORE_READONLY_ATTRIBUTE;
  return SetFileInformationByHandle(handle, FileDispositionInfoEx, &disposition,
                                    sizeof(disposition)) != FALSE;
}

bool CleanupStage(const std::wstring& stage_root,
                  std::vector<LockedFile>* files,
                  std::vector<LockedDirectory>* directories,
                  UniqueHandle* journal, UniqueHandle* spawn_lock,
                  UniqueHandle* root) {
  bool ok = true;
  for (auto iterator = files->rbegin(); iterator != files->rend(); ++iterator) {
    ok = MarkDelete(iterator->handle.get()) && ok;
    iterator->handle.Reset();
  }
  files->clear();
  for (auto iterator = directories->rbegin(); iterator != directories->rend();
       ++iterator) {
    ok = MarkDelete(iterator->handle.get()) && ok;
    iterator->handle.Reset();
  }
  directories->clear();
  ok = MarkDelete(journal->get()) && ok;
  journal->Reset();
  ok = MarkDelete(spawn_lock->get()) && ok;
  spawn_lock->Reset();
  ok = MarkDelete(root->get()) && ok;
  root->Reset();
  SetLastError(ERROR_SUCCESS);
  const DWORD attributes = GetFileAttributesW(stage_root.c_str());
  const DWORD error = GetLastError();
  return ok && attributes == INVALID_FILE_ATTRIBUTES &&
         (error == ERROR_FILE_NOT_FOUND || error == ERROR_PATH_NOT_FOUND);
}

bool QueryJobEmpty(HANDLE job) {
  JOBOBJECT_BASIC_ACCOUNTING_INFORMATION accounting{};
  return QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
                                   &accounting, sizeof(accounting), nullptr) &&
         accounting.ActiveProcesses == 0;
}

DWORD ParentProcessId() {
  UniqueHandle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0));
  if (!snapshot.valid()) return 0;
  PROCESSENTRY32W entry{};
  entry.dwSize = sizeof(entry);
  const DWORD current = GetCurrentProcessId();
  if (!Process32FirstW(snapshot.get(), &entry)) return 0;
  do {
    if (entry.th32ProcessID == current) return entry.th32ParentProcessID;
  } while (Process32NextW(snapshot.get(), &entry));
  return 0;
}

bool DrainCompletionPort(HANDLE port, DWORD timeout_ms) {
  const auto deadline = std::chrono::steady_clock::now() +
      std::chrono::milliseconds(timeout_ms);
  while (std::chrono::steady_clock::now() < deadline) {
    DWORD message = 0;
    ULONG_PTR key = 0;
    LPOVERLAPPED overlapped = nullptr;
    const auto remaining = std::chrono::duration_cast<std::chrono::milliseconds>(
        deadline - std::chrono::steady_clock::now());
    if (!GetQueuedCompletionStatus(port, &message, &key, &overlapped,
                                   static_cast<DWORD>(std::max<std::int64_t>(
                                       1, remaining.count())))) {
      if (GetLastError() == WAIT_TIMEOUT) return false;
      continue;
    }
    if (message == JOB_OBJECT_MSG_ACTIVE_PROCESS_ZERO) return true;
  }
  return false;
}

std::vector<sm::Field> BaseEvidence(const sm::BrokerConfig& config,
                                    std::string_view phase,
                                    std::string_view config_digest) {
  return {
      {"authoritative", "false"},
      {"configDigest", std::string(config_digest)},
      {"contract", std::string(sm::kEvidenceContract)},
      {"executionLocked", "false"},
      {"phase", std::string(phase)},
      {"protocolVersion", "1"},
      {"sessionId", config.session_id},
      {"windowsValidated", "false"},
  };
}

bool EmitFailure(HANDLE evidence, std::string_view code,
                 std::string_view session = "") {
  std::vector<sm::Field> fields = {
      {"authoritative", "false"},
      {"contract", std::string(sm::kEvidenceContract)},
      {"error", std::string(code)},
      {"executionLocked", "false"},
      {"phase", "failed"},
      {"protocolVersion", "1"},
      {"sessionId", std::string(session)},
      {"windowsValidated", "false"},
  };
  const auto bytes = sm::SerializeEnvelope(std::move(fields));
  return HandleIsPipe(evidence) && WriteFrame(evidence, bytes);
}

bool ParseOnlyArgument(int argc, wchar_t** argv, bool* recovery,
                       std::uint64_t* config_handle) {
  if (argc != 2) return false;
  constexpr std::wstring_view normal = L"--config-handle=";
  constexpr std::wstring_view recover = L"--recover-config-handle=";
  const std::wstring_view argument(argv[1]);
  std::wstring_view value;
  if (argument.rfind(normal, 0) == 0) {
    *recovery = false;
    value = argument.substr(normal.size());
  } else if (argument.rfind(recover, 0) == 0) {
    *recovery = true;
    value = argument.substr(recover.size());
  } else {
    return false;
  }
  if (value.size() != 16) return false;
  std::uint64_t parsed = 0;
  for (wchar_t character : value) {
    parsed <<= 4U;
    if (character >= L'0' && character <= L'9') parsed |= character - L'0';
    else if (character >= L'a' && character <= L'f') parsed |= character - L'a' + 10;
    else return false;
  }
  if (parsed == 0 || parsed == std::numeric_limits<std::uint64_t>::max()) {
    return false;
  }
  *config_handle = parsed;
  return true;
}

int RunBroker(const sm::BrokerConfig& config,
              const std::vector<std::uint8_t>& config_bytes,
              bool recovery) {
  UniqueHandle approval(reinterpret_cast<HANDLE>(
      static_cast<std::uintptr_t>(config.approval_read_handle)));
  UniqueHandle evidence(reinterpret_cast<HANDLE>(
      static_cast<std::uintptr_t>(config.evidence_write_handle)));
  UniqueHandle child_stdin(reinterpret_cast<HANDLE>(
      static_cast<std::uintptr_t>(config.child_stdin_handle)));
  UniqueHandle child_stdout(reinterpret_cast<HANDLE>(
      static_cast<std::uintptr_t>(config.child_stdout_handle)));
  if (!HandleIsPipe(approval.get()) || !HandleIsPipe(evidence.get()) ||
      !HandleIsPipe(child_stdin.get()) || !HandleIsPipe(child_stdout.get()) ||
      !ClearInheritance(approval.get()) || !ClearInheritance(evidence.get()) ||
      !ClearInheritance(child_stdin.get()) || !ClearInheritance(child_stdout.get())) {
    return 20;
  }
  std::string config_digest;
  std::string recovery_digest;
  if (!Sha256Vector(config_bytes, &config_digest) ||
      !StableRecoveryDigest(config, &recovery_digest)) {
    EmitFailure(evidence.get(), "broker_config_digest_failed", config.session_id);
    return 21;
  }
  std::wstring source_root;
  std::wstring stage_parent;
  if (!CanonicalAbsolute(config.source_root, &source_root) ||
      !CanonicalAbsolute(config.stage_parent, &stage_parent)) {
    EmitFailure(evidence.get(), "broker_root_path_invalid", config.session_id);
    return 22;
  }
  std::vector<LockedDirectory> source_root_chain;
  std::vector<LockedDirectory> stage_parent_chain;
  if (!OpenDirectoryIdentityChain(source_root, &source_root_chain) ||
      !OpenDirectoryIdentityChain(stage_parent, &stage_parent_chain) ||
      source_root_chain.front().identity.volume !=
          stage_parent_chain.front().identity.volume) {
    EmitFailure(evidence.get(), "broker_ancestor_chain_invalid", config.session_id);
    return 23;
  }
  const std::wstring stage_root = Join(stage_parent, config.stage_leaf);
  PSECURITY_DESCRIPTOR raw_descriptor = nullptr;
  SECURITY_ATTRIBUTES security{};
  if (!ParseSecurityDescriptor(config, &raw_descriptor, &security)) {
    EmitFailure(evidence.get(), "broker_dacl_invalid", config.session_id);
    return 23;
  }
  LocalMemory descriptor(raw_descriptor);

  if (!recovery && !CreateDirectoryW(stage_root.c_str(), &security)) {
    EmitFailure(evidence.get(), "broker_stage_create_failed", config.session_id);
    return 24;
  }
  UniqueHandle root = OpenDirectory(stage_root, DELETE);
  Identity root_identity;
  std::string observed_dacl;
  if (!root.valid() || !IsSafeDirectory(root.get(), &root_identity) ||
      !DaclMatches(root.get(), config, &observed_dacl)) {
    EmitFailure(evidence.get(), "broker_stage_identity_invalid", config.session_id);
    return 25;
  }
  const std::wstring journal_path = Join(stage_root, ".supermega-broker-journal");
  const std::wstring lock_path = Join(stage_root, ".supermega-broker-spawn.lock");
  UniqueHandle journal;
  UniqueHandle spawn_lock;
  const std::string journal_value = config.session_id + "\n" +
                                    recovery_digest + "\n";
  if (recovery) {
    journal = OpenFileRead(journal_path, DELETE);
    if (!journal.valid() || !IsSafeFile(journal.get(), journal_value.size())) {
      EmitFailure(evidence.get(), "broker_recovery_journal_missing", config.session_id);
      return 26;
    }
    std::vector<std::uint8_t> journal_bytes(journal_value.size());
    if (!ReadExact(journal.get(), journal_bytes.data(),
                   static_cast<DWORD>(journal_bytes.size())) ||
        !std::equal(journal_bytes.begin(), journal_bytes.end(),
                    journal_value.begin())) {
      EmitFailure(evidence.get(), "broker_recovery_journal_invalid", config.session_id);
      return 27;
    }
  } else {
    journal.Reset(CreateFileW(
        journal_path.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE, 0,
        &security, CREATE_NEW,
        FILE_ATTRIBUTE_HIDDEN | FILE_FLAG_WRITE_THROUGH |
            FILE_FLAG_OPEN_REPARSE_POINT,
        nullptr));
    if (!journal.valid() ||
        !WriteAll(journal.get(), journal_value.data(),
                  static_cast<DWORD>(journal_value.size())) ||
        !FlushFileBuffers(journal.get())) {
      EmitFailure(evidence.get(), "broker_journal_create_failed", config.session_id);
      return 28;
    }
  }
  spawn_lock.Reset(CreateFileW(
      lock_path.c_str(), GENERIC_READ | GENERIC_WRITE | DELETE, 0, &security,
      CREATE_NEW, FILE_ATTRIBUTE_HIDDEN | FILE_FLAG_OPEN_REPARSE_POINT |
          FILE_FLAG_DELETE_ON_CLOSE,
      nullptr));
  if (!spawn_lock.valid()) {
    EmitFailure(evidence.get(), "broker_spawn_lock_unavailable", config.session_id);
    return 29;
  }

  UniqueHandle stage_parent_handle = OpenDirectory(stage_parent);
  Identity stage_parent_identity;
  if (!stage_parent_handle.valid() ||
      !IsSafeDirectory(stage_parent_handle.get(), &stage_parent_identity) ||
      stage_parent_identity.volume != root_identity.volume) {
    EmitFailure(evidence.get(), "broker_stage_parent_invalid", config.session_id);
    return 30;
  }
  UniqueHandle source = OpenDirectory(source_root);
  Identity source_identity;
  if (!source.valid() || !IsSafeDirectory(source.get(), &source_identity) ||
      source_identity.volume != root_identity.volume) {
    EmitFailure(evidence.get(), "broker_source_root_invalid", config.session_id);
    return 31;
  }
  std::vector<LockedDirectory> directories;
  std::vector<LockedDirectory> source_directories;
  std::set<std::wstring> created_directories;
  std::set<std::wstring> opened_source_directories;
  std::vector<LockedFile> files;
  for (const sm::FileSpec& spec : config.files) {
    for (const std::string& relative : ParentDirectories(spec.relative_path)) {
      const std::wstring source_directory_path = Join(source_root, relative);
      if (opened_source_directories.insert(source_directory_path).second) {
        LockedDirectory source_directory;
        Utf8ToWide(relative, &source_directory.relative_path);
        source_directory.absolute_path = source_directory_path;
        source_directory.handle = OpenDirectory(source_directory_path);
        if (!source_directory.handle.valid() ||
            !IsSafeDirectory(source_directory.handle.get(),
                             &source_directory.identity)) {
          EmitFailure(evidence.get(), "broker_source_directory_invalid",
                      config.session_id);
          return 32;
        }
        source_directories.push_back(std::move(source_directory));
      }
      const std::wstring destination = Join(stage_root, relative);
      if (created_directories.insert(destination).second) {
        if (!recovery && !CreateDirectoryW(destination.c_str(), &security)) {
          EmitFailure(evidence.get(), "broker_stage_directory_create_failed",
                      config.session_id);
          return 33;
        }
        LockedDirectory directory;
        Utf8ToWide(relative, &directory.relative_path);
        std::replace(directory.relative_path.begin(), directory.relative_path.end(),
                     L'/', L'\\');
        directory.absolute_path = destination;
        directory.handle = OpenDirectory(destination, DELETE);
        if (!directory.handle.valid() ||
            !IsSafeDirectory(directory.handle.get(), &directory.identity) ||
            !DaclMatches(directory.handle.get(), config, &observed_dacl)) {
          EmitFailure(evidence.get(), "broker_stage_directory_invalid",
                      config.session_id);
          return 34;
        }
        directories.push_back(std::move(directory));
      }
    }
    const std::wstring source_path = Join(source_root, spec.relative_path);
    const std::wstring destination_path = Join(stage_root, spec.relative_path);
    UniqueHandle source_file = OpenFileRead(source_path);
    std::string source_digest;
    if (!source_file.valid() || !IsSafeFile(source_file.get(), spec.bytes) ||
        !Sha256Handle(source_file.get(), spec.bytes, &source_digest) ||
        source_digest != spec.sha256) {
      EmitFailure(evidence.get(), "broker_source_file_invalid", config.session_id);
      return 35;
    }
    LockedFile destination;
    destination.spec = spec;
    destination.absolute_path = destination_path;
    if (recovery) {
      destination.handle = OpenFileRead(destination_path, DELETE);
    } else {
      UniqueHandle creator(CreateFileW(
          destination_path.c_str(), GENERIC_READ | GENERIC_WRITE |
              FILE_READ_ATTRIBUTES | READ_CONTROL | DELETE,
          FILE_SHARE_READ, &security, CREATE_NEW,
          FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_SEQUENTIAL_SCAN |
              FILE_FLAG_WRITE_THROUGH,
          nullptr));
      if (!creator.valid() ||
          !CopyExactFile(source_file.get(), creator.get(), spec.bytes)) {
        EmitFailure(evidence.get(), "broker_stage_file_copy_failed",
                    config.session_id);
        return 35;
      }
      creator.Reset();
      destination.handle = OpenFileRead(destination_path, DELETE);
    }
    std::string destination_digest;
    if (!destination.handle.valid() ||
        !IsSafeFile(destination.handle.get(), spec.bytes) ||
        !Sha256Handle(destination.handle.get(), spec.bytes, &destination_digest) ||
        destination_digest != spec.sha256 ||
        !QueryIdentity(destination.handle.get(), &destination.identity) ||
        !DaclMatches(destination.handle.get(), config, &observed_dacl)) {
      EmitFailure(evidence.get(), "broker_stage_file_invalid", config.session_id);
      return 36;
    }
    files.push_back(std::move(destination));
  }

  if (recovery) {
    const bool cleanup_ok = CleanupStage(stage_root, &files, &directories,
                                         &journal, &spawn_lock, &root);
    auto recovered = BaseEvidence(config, "recovered", config_digest);
    recovered.push_back({"cleanupComplete", cleanup_ok ? "true" : "false"});
    const auto bytes = sm::SerializeEnvelope(std::move(recovered));
    if (!cleanup_ok || !WriteFrame(evidence.get(), bytes)) return 37;
    return 0;
  }

  const auto python = std::find_if(
      files.begin(), files.end(), [&config](const LockedFile& file) {
        return file.spec.role == "python" &&
               file.spec.relative_path == config.python_relative;
      });
  if (python == files.end()) {
    EmitFailure(evidence.get(), "broker_python_missing", config.session_id);
    return 38;
  }

  UniqueHandle job(CreateJobObjectW(&security, nullptr));
  UniqueHandle completion(CreateIoCompletionPort(INVALID_HANDLE_VALUE, nullptr,
                                                  0, 1));
  JOBOBJECT_EXTENDED_LIMIT_INFORMATION limits{};
  limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
  JOBOBJECT_ASSOCIATE_COMPLETION_PORT association{};
  association.CompletionKey = job.get();
  association.CompletionPort = completion.get();
  if (!job.valid() || !completion.valid() ||
      !SetInformationJobObject(job.get(), JobObjectExtendedLimitInformation,
                               &limits, sizeof(limits)) ||
      !SetInformationJobObject(job.get(), JobObjectAssociateCompletionPortInformation,
                               &association, sizeof(association))) {
    EmitFailure(evidence.get(), "broker_job_create_failed", config.session_id);
    return 37;
  }

  if (!SetInheritance(child_stdin.get()) || !SetInheritance(child_stdout.get())) {
    EmitFailure(evidence.get(), "broker_child_handle_prepare_failed", config.session_id);
    return 38;
  }
  std::array<HANDLE, 2> child_handles = {child_stdin.get(), child_stdout.get()};
  SIZE_T attributes_size = 0;
  InitializeProcThreadAttributeList(nullptr, 1, 0, &attributes_size);
  std::vector<std::uint8_t> attributes_buffer(attributes_size);
  auto* attributes = reinterpret_cast<LPPROC_THREAD_ATTRIBUTE_LIST>(
      attributes_buffer.data());
  if (!InitializeProcThreadAttributeList(attributes, 1, 0, &attributes_size) ||
      !UpdateProcThreadAttribute(
          attributes, 0, PROC_THREAD_ATTRIBUTE_HANDLE_LIST,
          child_handles.data(), sizeof(child_handles), nullptr, nullptr)) {
    ClearInheritance(child_stdin.get());
    ClearInheritance(child_stdout.get());
    EmitFailure(evidence.get(), "broker_child_handle_list_failed", config.session_id);
    return 39;
  }

  std::wstring command = QuoteArgument(python->absolute_path);
  for (const std::string& argument : config.arguments) {
    std::wstring wide;
    if (!Utf8ToWide(argument, &wide)) {
      DeleteProcThreadAttributeList(attributes);
      EmitFailure(evidence.get(), "broker_child_argument_invalid", config.session_id);
      return 40;
    }
    command.push_back(L' ');
    command.append(QuoteArgument(wide));
  }
  std::vector<wchar_t> mutable_command(command.begin(), command.end());
  mutable_command.push_back(L'\0');
  wchar_t windows_directory[MAX_PATH + 1]{};
  wchar_t temporary_directory[MAX_PATH + 1]{};
  if (GetWindowsDirectoryW(windows_directory, MAX_PATH) == 0 ||
      GetTempPathW(MAX_PATH, temporary_directory) == 0) {
    DeleteProcThreadAttributeList(attributes);
    EmitFailure(evidence.get(), "broker_environment_invalid", config.session_id);
    return 41;
  }
  std::wstring environment = L"PYTHONNOUSERSITE=1\0PYTHONSAFEPATH=1\0SystemRoot=";
  environment.append(windows_directory);
  environment.append(L"\0TEMP=");
  environment.append(temporary_directory);
  environment.append(L"\0TMP=");
  environment.append(temporary_directory);
  environment.append(L"\0\0", 2);

  STARTUPINFOEXW startup{};
  startup.StartupInfo.cb = sizeof(startup);
  startup.StartupInfo.dwFlags = STARTF_USESTDHANDLES;
  startup.StartupInfo.hStdInput = child_stdin.get();
  startup.StartupInfo.hStdOutput = child_stdout.get();
  startup.StartupInfo.hStdError = child_stdout.get();
  startup.lpAttributeList = attributes;
  PROCESS_INFORMATION process{};
  const BOOL created = CreateProcessW(
      python->absolute_path.c_str(), mutable_command.data(), nullptr, nullptr, TRUE,
      CREATE_SUSPENDED | CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT |
          CREATE_UNICODE_ENVIRONMENT,
      environment.data(), stage_root.c_str(), &startup.StartupInfo, &process);
  DeleteProcThreadAttributeList(attributes);
  const bool inheritance_cleared = ClearInheritance(child_stdin.get()) &&
                                   ClearInheritance(child_stdout.get());
  child_stdin.Reset();
  child_stdout.Reset();
  UniqueHandle process_handle(process.hProcess);
  UniqueHandle thread_handle(process.hThread);
  if (!created || !inheritance_cleared ||
      !AssignProcessToJobObject(job.get(), process_handle.get())) {
    if (created) TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_child_suspended_create_failed",
                config.session_id);
    return 42;
  }

  std::vector<wchar_t> child_path(32768);
  DWORD child_path_size = static_cast<DWORD>(child_path.size());
  if (!QueryFullProcessImageNameW(process_handle.get(), 0, child_path.data(),
                                  &child_path_size)) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_child_image_query_failed", config.session_id);
    return 43;
  }
  child_path.resize(child_path_size);
  const std::wstring child_image_path(child_path.data(), child_path.size());
  if (CompareStringOrdinal(child_image_path.c_str(),
                           static_cast<int>(child_image_path.size()),
                           python->absolute_path.c_str(),
                           static_cast<int>(python->absolute_path.size()), TRUE) !=
      CSTR_EQUAL) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_child_image_substituted", config.session_id);
    return 44;
  }
  UniqueHandle child_image = OpenFileRead(child_image_path);
  Identity child_identity;
  if (!child_image.valid() || !QueryIdentity(child_image.get(), &child_identity) ||
      child_identity.volume != python->identity.volume ||
      child_identity.file != python->identity.file) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_child_image_identity_mismatch",
                config.session_id);
    return 45;
  }

  auto prepared_fields = BaseEvidence(config, "prepared", config_digest);
  prepared_fields.push_back({"brokerProcessId",
                             std::to_string(GetCurrentProcessId())});
  const DWORD parent_process_id = ParentProcessId();
  if (parent_process_id == 0) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_parent_process_unknown", config.session_id);
    return 46;
  }
  prepared_fields.push_back({"brokerParentProcessId",
                             std::to_string(parent_process_id)});
  prepared_fields.push_back({"brokerSpawnLockHeld", "true"});
  prepared_fields.push_back({"childAssignedBeforeResume", "true"});
  prepared_fields.push_back({"childImageFileId", child_identity.file});
  prepared_fields.push_back({"childImageVolume", child_identity.volume});
  prepared_fields.push_back({"childResumed", "false"});
  prepared_fields.push_back({"daclSha256", observed_dacl});
  prepared_fields.push_back({"parentInheritabilityCleared", "true"});
  prepared_fields.push_back({"rootFileId", root_identity.file});
  prepared_fields.push_back({"rootVolume", root_identity.volume});
  prepared_fields.push_back({"stageRoot", config.stage_parent + "\\" +
                                              config.stage_leaf});
  prepared_fields.push_back({"fileCount", std::to_string(files.size())});
  for (std::size_t index = 0; index < files.size(); ++index) {
    const std::string prefix = std::string("file.") +
        (index < 10 ? "00" : index < 100 ? "0" : "") +
        std::to_string(index) + ".";
    prepared_fields.push_back({prefix + "bytes",
                               std::to_string(files[index].spec.bytes)});
    prepared_fields.push_back({prefix + "fileId", files[index].identity.file});
    prepared_fields.push_back({prefix + "handle",
                               Hex64(reinterpret_cast<std::uintptr_t>(
                                   files[index].handle.get()))});
    prepared_fields.push_back({prefix + "relativePath",
                               files[index].spec.relative_path});
    prepared_fields.push_back({prefix + "role", files[index].spec.role});
    prepared_fields.push_back({prefix + "sha256", files[index].spec.sha256});
    prepared_fields.push_back({prefix + "volume", files[index].identity.volume});
  }
  const auto prepared_bytes = sm::SerializeEnvelope(std::move(prepared_fields));
  std::string prepared_digest;
  if (prepared_bytes.empty() || !Sha256Vector(prepared_bytes, &prepared_digest) ||
      !WriteFrame(evidence.get(), prepared_bytes)) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_prepared_evidence_failed", config.session_id);
    return 46;
  }
  std::vector<std::uint8_t> approval_bytes;
  if (!ReadFrameBounded(approval.get(), config.timeout_ms, &approval_bytes)) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_approval_missing", config.session_id);
    return 47;
  }
  const auto approval_message = sm::ParseEnvelope(approval_bytes);
  const auto approval_result = approval_message.ok()
      ? sm::ParseApproval(approval_message.message, config.session_id,
                          prepared_digest)
      : sm::ApprovalResult{approval_message.error, false};
  if (!approval_result.ok() || !approval_result.approved) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_approval_rejected", config.session_id);
    return 48;
  }
  if (ResumeThread(thread_handle.get()) == static_cast<DWORD>(-1)) {
    TerminateProcess(process_handle.get(), 0xc0000022U);
    EmitFailure(evidence.get(), "broker_child_resume_failed", config.session_id);
    return 49;
  }
  if (WaitForSingleObject(process_handle.get(), config.timeout_ms) != WAIT_OBJECT_0) {
    TerminateJobObject(job.get(), 0xc0000102U);
    EmitFailure(evidence.get(), "broker_child_timeout", config.session_id);
    return 50;
  }
  if (!DrainCompletionPort(completion.get(), config.timeout_ms) ||
      !QueryJobEmpty(job.get())) {
    TerminateJobObject(job.get(), 0xc0000102U);
    EmitFailure(evidence.get(), "broker_job_not_empty", config.session_id);
    return 51;
  }
  DWORD exit_code = 0;
  if (!GetExitCodeProcess(process_handle.get(), &exit_code)) {
    EmitFailure(evidence.get(), "broker_child_exit_unknown", config.session_id);
    return 52;
  }
  for (LockedFile& file : files) {
    Identity identity;
    std::string digest;
    if (!QueryIdentity(file.handle.get(), &identity) ||
        identity.volume != file.identity.volume || identity.file != file.identity.file ||
        !Sha256Handle(file.handle.get(), file.spec.bytes, &digest) ||
        digest != file.spec.sha256) {
      EmitFailure(evidence.get(), "broker_postrun_identity_changed",
                  config.session_id);
      return 53;
    }
  }
  const bool cleanup_ok = CleanupStage(stage_root, &files, &directories,
                                       &journal, &spawn_lock, &root);
  auto final_fields = BaseEvidence(config, "final", config_digest);
  final_fields.push_back({"allProcessesExited", "true"});
  final_fields.push_back({"childExitCode", std::to_string(exit_code)});
  final_fields.push_back({"cleanupComplete", cleanup_ok ? "true" : "false"});
  final_fields.push_back({"completionMessagesDrained", "true"});
  final_fields.push_back({"postrunIdentityReconciled", "true"});
  const auto final_bytes = sm::SerializeEnvelope(std::move(final_fields));
  if (!cleanup_ok || final_bytes.empty() ||
      !WriteFrame(evidence.get(), final_bytes)) {
    EmitFailure(evidence.get(), "broker_cleanup_failed", config.session_id);
    return 54;
  }
  return exit_code == 0 ? 0 : 55;
}

}  // namespace

int wmain(int argc, wchar_t** argv) {
  bool recovery = false;
  std::uint64_t raw_config_handle = 0;
  if (!ParseOnlyArgument(argc, argv, &recovery, &raw_config_handle)) return 2;
  UniqueHandle config_handle(reinterpret_cast<HANDLE>(
      static_cast<std::uintptr_t>(raw_config_handle)));
  if (!HandleIsPipe(config_handle.get()) || !ClearInheritance(config_handle.get())) {
    return 3;
  }
  std::vector<std::uint8_t> config_bytes;
  if (!ReadFrameBounded(config_handle.get(), 30'000, &config_bytes)) return 4;
  config_handle.Reset();
  const auto message = sm::ParseEnvelope(config_bytes);
  if (!message.ok()) return 5;
  const auto parsed = sm::ParseBrokerConfig(message.message);
  if (!parsed.ok()) return 6;
  return RunBroker(parsed.config, config_bytes, recovery);
}

#endif  // _WIN32
