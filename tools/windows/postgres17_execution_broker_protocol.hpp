#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace supermega::postgres17 {

inline constexpr std::string_view kEnvelopeMagic = "SMELOCK1";
inline constexpr std::uint16_t kProtocolVersion = 1;
inline constexpr std::size_t kMaximumEnvelopeBytes = 65536;
inline constexpr std::size_t kMaximumFieldBytes = 32768;
inline constexpr std::size_t kMaximumFields = 1024;
inline constexpr std::string_view kRequestContract =
    "supermega.postgres17-windows-broker-request.v1";
inline constexpr std::string_view kApprovalContract =
    "supermega.postgres17-windows-broker-approval.v1";
inline constexpr std::string_view kEvidenceContract =
    "supermega.postgres17-windows-broker-evidence.v1";

enum class ProtocolError {
  kNone,
  kTooLarge,
  kTruncated,
  kMagic,
  kVersion,
  kFieldCount,
  kFieldName,
  kFieldValue,
  kFieldOrder,
  kDuplicateField,
  kTrailingBytes,
  kMissingField,
  kUnknownField,
  kInvalidValue,
};

struct Field final {
  std::string name;
  std::string value;
};

struct Message final {
  std::vector<Field> fields;

  [[nodiscard]] const std::string* Find(std::string_view name) const;
};

struct ParseResult final {
  ProtocolError error{ProtocolError::kNone};
  Message message;
  [[nodiscard]] bool ok() const { return error == ProtocolError::kNone; }
};

struct FileSpec final {
  std::string role;
  std::string relative_path;
  std::uint64_t bytes{};
  std::string sha256;
};

struct BrokerConfig final {
  std::string session_id;
  std::string source_root;
  std::string stage_parent;
  std::string stage_leaf;
  std::string owner_sid;
  std::string requestor_sid;
  std::string dacl_sddl;
  std::string dacl_sha256;
  std::string python_relative;
  std::uint32_t timeout_ms{};
  std::uint64_t approval_read_handle{};
  std::uint64_t evidence_write_handle{};
  std::uint64_t child_stdin_handle{};
  std::uint64_t child_stdout_handle{};
  std::vector<FileSpec> files;
  std::vector<std::string> arguments;
};

struct ConfigResult final {
  ProtocolError error{ProtocolError::kNone};
  BrokerConfig config;
  [[nodiscard]] bool ok() const { return error == ProtocolError::kNone; }
};

struct ApprovalResult final {
  ProtocolError error{ProtocolError::kNone};
  bool approved{false};
  [[nodiscard]] bool ok() const { return error == ProtocolError::kNone; }
};

[[nodiscard]] ParseResult ParseEnvelope(const std::vector<std::uint8_t>& bytes);
[[nodiscard]] std::vector<std::uint8_t> SerializeEnvelope(
    std::vector<Field> fields);
[[nodiscard]] ConfigResult ParseBrokerConfig(const Message& message);
[[nodiscard]] ApprovalResult ParseApproval(
    const Message& message,
    std::string_view expected_session,
    std::string_view expected_prepared_digest);
[[nodiscard]] bool IsLowerHex(std::string_view value, std::size_t size);
[[nodiscard]] bool IsCanonicalRelativePath(std::string_view value);
[[nodiscard]] bool IsValidUtf8(std::string_view value);
[[nodiscard]] const char* ProtocolErrorCode(ProtocolError error);

}  // namespace supermega::postgres17
