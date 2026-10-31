#include "postgres17_execution_broker_protocol.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <limits>
#include <set>

namespace supermega::postgres17 {
namespace {

std::uint16_t ReadU16(const std::vector<std::uint8_t>& bytes,
                      std::size_t offset) {
  return static_cast<std::uint16_t>(bytes[offset]) |
         (static_cast<std::uint16_t>(bytes[offset + 1]) << 8U);
}

std::uint32_t ReadU32(const std::vector<std::uint8_t>& bytes,
                      std::size_t offset) {
  return static_cast<std::uint32_t>(bytes[offset]) |
         (static_cast<std::uint32_t>(bytes[offset + 1]) << 8U) |
         (static_cast<std::uint32_t>(bytes[offset + 2]) << 16U) |
         (static_cast<std::uint32_t>(bytes[offset + 3]) << 24U);
}

void AppendU16(std::vector<std::uint8_t>* output, std::uint16_t value) {
  output->push_back(static_cast<std::uint8_t>(value & 0xffU));
  output->push_back(static_cast<std::uint8_t>((value >> 8U) & 0xffU));
}

void AppendU32(std::vector<std::uint8_t>* output, std::uint32_t value) {
  for (unsigned shift : {0U, 8U, 16U, 24U}) {
    output->push_back(static_cast<std::uint8_t>((value >> shift) & 0xffU));
  }
}

bool IsFieldName(std::string_view value) {
  if (value.empty() || value.size() > 128) return false;
  for (const unsigned char character : value) {
    const bool valid =
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9') || character == '.' ||
        character == '_' || character == '-';
    if (!valid) return false;
  }
  return true;
}

template <typename Integer>
bool ParseDecimal(std::string_view value, Integer* output) {
  if (value.empty() || value.size() > 20 ||
      (value.size() > 1 && value.front() == '0')) {
    return false;
  }
  Integer parsed{};
  const auto result = std::from_chars(value.data(), value.data() + value.size(),
                                      parsed, 10);
  if (result.ec != std::errc() || result.ptr != value.data() + value.size()) {
    return false;
  }
  *output = parsed;
  return true;
}

bool ParseHandle(std::string_view value, std::uint64_t* output) {
  if (!IsLowerHex(value, 16)) return false;
  std::uint64_t parsed{};
  const auto result = std::from_chars(value.data(), value.data() + value.size(),
                                      parsed, 16);
  if (result.ec != std::errc() || result.ptr != value.data() + value.size() ||
      parsed == 0 || parsed == std::numeric_limits<std::uint64_t>::max()) {
    return false;
  }
  *output = parsed;
  return true;
}

std::string Indexed(std::string_view prefix, std::size_t index,
                    std::string_view suffix) {
  const char hundreds = static_cast<char>('0' + ((index / 100) % 10));
  const char tens = static_cast<char>('0' + ((index / 10) % 10));
  const char ones = static_cast<char>('0' + (index % 10));
  std::string value(prefix);
  value.push_back(hundreds);
  value.push_back(tens);
  value.push_back(ones);
  value.append(suffix);
  return value;
}

bool ExactFields(const Message& message, const std::set<std::string>& expected) {
  if (message.fields.size() != expected.size()) return false;
  for (const Field& field : message.fields) {
    if (expected.find(field.name) == expected.end()) return false;
  }
  return true;
}

}  // namespace

const std::string* Message::Find(std::string_view name) const {
  const auto found = std::lower_bound(
      fields.begin(), fields.end(), name,
      [](const Field& field, std::string_view candidate) {
        return field.name < candidate;
      });
  if (found == fields.end() || found->name != name) return nullptr;
  return &found->value;
}

bool IsLowerHex(std::string_view value, std::size_t size) {
  if (value.size() != size) return false;
  return std::all_of(value.begin(), value.end(), [](unsigned char character) {
    return (character >= '0' && character <= '9') ||
           (character >= 'a' && character <= 'f');
  });
}

bool IsCanonicalRelativePath(std::string_view value) {
  if (value.empty() || value.size() > 1024 || value.front() == '/' ||
      value.back() == '/' || value.find('\\') != std::string_view::npos ||
      value.find(':') != std::string_view::npos) {
    return false;
  }
  std::size_t start = 0;
  while (start <= value.size()) {
    const std::size_t end = value.find('/', start);
    const std::string_view part = value.substr(
        start, end == std::string_view::npos ? value.size() - start
                                             : end - start);
    if (part.empty() || part == "." || part == ".." ||
        part.back() == ' ' || part.back() == '.') {
      return false;
    }
    if (end == std::string_view::npos) break;
    start = end + 1;
  }
  return IsValidUtf8(value);
}

bool IsValidUtf8(std::string_view value) {
  std::size_t index = 0;
  while (index < value.size()) {
    const auto first = static_cast<unsigned char>(value[index]);
    if (first == 0) return false;
    if (first < 0x80) {
      ++index;
      continue;
    }
    std::size_t continuation = 0;
    std::uint32_t codepoint = 0;
    if ((first & 0xe0U) == 0xc0U) {
      continuation = 1;
      codepoint = first & 0x1fU;
      if (codepoint < 2) return false;
    } else if ((first & 0xf0U) == 0xe0U) {
      continuation = 2;
      codepoint = first & 0x0fU;
    } else if ((first & 0xf8U) == 0xf0U) {
      continuation = 3;
      codepoint = first & 0x07U;
    } else {
      return false;
    }
    if (index + continuation >= value.size()) return false;
    for (std::size_t next = 1; next <= continuation; ++next) {
      const auto byte = static_cast<unsigned char>(value[index + next]);
      if ((byte & 0xc0U) != 0x80U) return false;
      codepoint = (codepoint << 6U) | (byte & 0x3fU);
    }
    if ((continuation == 2 && codepoint < 0x800U) ||
        (continuation == 3 && codepoint < 0x10000U) ||
        codepoint > 0x10ffffU ||
        (codepoint >= 0xd800U && codepoint <= 0xdfffU)) {
      return false;
    }
    index += continuation + 1;
  }
  return true;
}

ParseResult ParseEnvelope(const std::vector<std::uint8_t>& bytes) {
  ParseResult result;
  if (bytes.size() > kMaximumEnvelopeBytes) {
    result.error = ProtocolError::kTooLarge;
    return result;
  }
  if (bytes.size() < kEnvelopeMagic.size() + 4) {
    result.error = ProtocolError::kTruncated;
    return result;
  }
  if (!std::equal(kEnvelopeMagic.begin(), kEnvelopeMagic.end(), bytes.begin())) {
    result.error = ProtocolError::kMagic;
    return result;
  }
  std::size_t offset = kEnvelopeMagic.size();
  if (ReadU16(bytes, offset) != kProtocolVersion) {
    result.error = ProtocolError::kVersion;
    return result;
  }
  offset += 2;
  const std::size_t count = ReadU16(bytes, offset);
  offset += 2;
  if (count == 0 || count > kMaximumFields) {
    result.error = ProtocolError::kFieldCount;
    return result;
  }
  std::string prior;
  for (std::size_t index = 0; index < count; ++index) {
    if (offset + 2 > bytes.size()) {
      result.error = ProtocolError::kTruncated;
      return result;
    }
    const std::size_t name_size = ReadU16(bytes, offset);
    offset += 2;
    if (name_size == 0 || offset + name_size + 4 > bytes.size()) {
      result.error = ProtocolError::kTruncated;
      return result;
    }
    std::string name(reinterpret_cast<const char*>(bytes.data() + offset),
                     name_size);
    offset += name_size;
    if (!IsFieldName(name)) {
      result.error = ProtocolError::kFieldName;
      return result;
    }
    const std::size_t value_size = ReadU32(bytes, offset);
    offset += 4;
    if (value_size > kMaximumFieldBytes || offset + value_size > bytes.size()) {
      result.error = value_size > kMaximumFieldBytes
                         ? ProtocolError::kTooLarge
                         : ProtocolError::kTruncated;
      return result;
    }
    std::string value(reinterpret_cast<const char*>(bytes.data() + offset),
                      value_size);
    offset += value_size;
    if (!IsValidUtf8(value)) {
      result.error = ProtocolError::kFieldValue;
      return result;
    }
    if (!prior.empty() && name <= prior) {
      result.error = name == prior ? ProtocolError::kDuplicateField
                                   : ProtocolError::kFieldOrder;
      return result;
    }
    prior = name;
    result.message.fields.push_back({std::move(name), std::move(value)});
  }
  if (offset != bytes.size()) {
    result.error = ProtocolError::kTrailingBytes;
    result.message.fields.clear();
    return result;
  }
  return result;
}

std::vector<std::uint8_t> SerializeEnvelope(std::vector<Field> fields) {
  std::sort(fields.begin(), fields.end(),
            [](const Field& left, const Field& right) {
              return left.name < right.name;
            });
  if (fields.empty() || fields.size() > kMaximumFields) return {};
  std::vector<std::uint8_t> output(kEnvelopeMagic.begin(), kEnvelopeMagic.end());
  AppendU16(&output, kProtocolVersion);
  AppendU16(&output, static_cast<std::uint16_t>(fields.size()));
  std::string prior;
  for (const Field& field : fields) {
    if (!IsFieldName(field.name) || field.name == prior ||
        !IsValidUtf8(field.value) || field.value.size() > kMaximumFieldBytes ||
        field.name.size() > std::numeric_limits<std::uint16_t>::max()) {
      return {};
    }
    prior = field.name;
    AppendU16(&output, static_cast<std::uint16_t>(field.name.size()));
    output.insert(output.end(), field.name.begin(), field.name.end());
    AppendU32(&output, static_cast<std::uint32_t>(field.value.size()));
    output.insert(output.end(), field.value.begin(), field.value.end());
  }
  if (output.size() > kMaximumEnvelopeBytes) return {};
  return output;
}

ConfigResult ParseBrokerConfig(const Message& message) {
  ConfigResult result;
  const std::string* contract = message.Find("contract");
  const std::string* file_count_value = message.Find("fileCount");
  const std::string* argument_count_value = message.Find("argumentCount");
  std::uint32_t file_count = 0;
  std::uint32_t argument_count = 0;
  if (contract == nullptr || *contract != kRequestContract ||
      file_count_value == nullptr || argument_count_value == nullptr ||
      !ParseDecimal(*file_count_value, &file_count) || file_count == 0 ||
      file_count > 256 ||
      !ParseDecimal(*argument_count_value, &argument_count) ||
      argument_count > 32) {
    result.error = ProtocolError::kInvalidValue;
    return result;
  }
  std::set<std::string> expected = {
      "approvalReadHandle", "argumentCount", "childStdinHandle",
      "childStdoutHandle", "contract", "daclSddl", "daclSha256",
      "evidenceWriteHandle", "fileCount", "ownerSid", "pythonRelative",
      "requestorSid", "sessionId", "sourceRoot", "stageLeaf",
      "stageParent", "timeoutMs",
  };
  for (std::size_t index = 0; index < file_count; ++index) {
    expected.insert(Indexed("file.", index, ".bytes"));
    expected.insert(Indexed("file.", index, ".relativePath"));
    expected.insert(Indexed("file.", index, ".role"));
    expected.insert(Indexed("file.", index, ".sha256"));
  }
  for (std::size_t index = 0; index < argument_count; ++index) {
    expected.insert(Indexed("argument.", index, ""));
  }
  if (!ExactFields(message, expected)) {
    result.error = ProtocolError::kUnknownField;
    return result;
  }
  auto required = [&message](std::string_view name) -> const std::string& {
    return *message.Find(name);
  };
  BrokerConfig config;
  config.session_id = required("sessionId");
  config.source_root = required("sourceRoot");
  config.stage_parent = required("stageParent");
  config.stage_leaf = required("stageLeaf");
  config.owner_sid = required("ownerSid");
  config.requestor_sid = required("requestorSid");
  config.dacl_sddl = required("daclSddl");
  config.dacl_sha256 = required("daclSha256");
  config.python_relative = required("pythonRelative");
  if (!IsLowerHex(config.session_id, 32) ||
      config.stage_leaf != "supermega-pg17-" + config.session_id ||
      config.source_root.empty() || config.stage_parent.empty() ||
      config.owner_sid.empty() || config.requestor_sid.empty() ||
      config.owner_sid == config.requestor_sid || config.dacl_sddl.empty() ||
      !IsLowerHex(config.dacl_sha256, 64) ||
      !IsCanonicalRelativePath(config.python_relative) ||
      !ParseDecimal(required("timeoutMs"), &config.timeout_ms) ||
      config.timeout_ms < 1000 || config.timeout_ms > 300000 ||
      !ParseHandle(required("approvalReadHandle"),
                   &config.approval_read_handle) ||
      !ParseHandle(required("evidenceWriteHandle"),
                   &config.evidence_write_handle) ||
      !ParseHandle(required("childStdinHandle"), &config.child_stdin_handle) ||
      !ParseHandle(required("childStdoutHandle"),
                   &config.child_stdout_handle)) {
    result.error = ProtocolError::kInvalidValue;
    return result;
  }
  const std::array<std::uint64_t, 4> handles = {
      config.approval_read_handle, config.evidence_write_handle,
      config.child_stdin_handle, config.child_stdout_handle};
  if (std::set<std::uint64_t>(handles.begin(), handles.end()).size() !=
      handles.size()) {
    result.error = ProtocolError::kInvalidValue;
    return result;
  }
  std::set<std::string> folded_paths;
  for (std::size_t index = 0; index < file_count; ++index) {
    FileSpec file{
        required(Indexed("file.", index, ".role")),
        required(Indexed("file.", index, ".relativePath")),
        0,
        required(Indexed("file.", index, ".sha256")),
    };
    std::string folded = file.relative_path;
    std::transform(folded.begin(), folded.end(), folded.begin(),
                   [](unsigned char value) {
                     return static_cast<char>(value >= 'A' && value <= 'Z'
                                                  ? value + ('a' - 'A')
                                                  : value);
                   });
    if (file.role.empty() || file.role.size() > 64 ||
        !IsCanonicalRelativePath(file.relative_path) ||
        !folded_paths.insert(folded).second ||
        !ParseDecimal(required(Indexed("file.", index, ".bytes")),
                      &file.bytes) ||
        !IsLowerHex(file.sha256, 64)) {
      result.error = ProtocolError::kInvalidValue;
      return result;
    }
    config.files.push_back(std::move(file));
  }
  const auto python = std::find_if(
      config.files.begin(), config.files.end(), [&config](const FileSpec& file) {
        return file.role == "python" &&
               file.relative_path == config.python_relative;
      });
  if (python == config.files.end()) {
    result.error = ProtocolError::kInvalidValue;
    return result;
  }
  for (std::size_t index = 0; index < argument_count; ++index) {
    const std::string& argument = required(Indexed("argument.", index, ""));
    if (argument.size() > 4096 || argument.find('\0') != std::string::npos) {
      result.error = ProtocolError::kInvalidValue;
      return result;
    }
    config.arguments.push_back(argument);
  }
  result.config = std::move(config);
  return result;
}

ApprovalResult ParseApproval(const Message& message,
                             std::string_view expected_session,
                             std::string_view expected_prepared_digest) {
  ApprovalResult result;
  const std::set<std::string> expected = {
      "contract", "decision", "preparedDigest", "sessionId"};
  if (!ExactFields(message, expected)) {
    result.error = ProtocolError::kUnknownField;
    return result;
  }
  const std::string* contract = message.Find("contract");
  const std::string* decision = message.Find("decision");
  const std::string* digest = message.Find("preparedDigest");
  const std::string* session = message.Find("sessionId");
  if (contract == nullptr || *contract != kApprovalContract ||
      decision == nullptr || (*decision != "approve" && *decision != "deny") ||
      digest == nullptr || *digest != expected_prepared_digest ||
      !IsLowerHex(*digest, 64) || session == nullptr ||
      *session != expected_session || !IsLowerHex(*session, 32)) {
    result.error = ProtocolError::kInvalidValue;
    return result;
  }
  result.approved = *decision == "approve";
  return result;
}

const char* ProtocolErrorCode(ProtocolError error) {
  switch (error) {
    case ProtocolError::kNone: return "ok";
    case ProtocolError::kTooLarge: return "broker_protocol_too_large";
    case ProtocolError::kTruncated: return "broker_protocol_truncated";
    case ProtocolError::kMagic: return "broker_protocol_magic_invalid";
    case ProtocolError::kVersion: return "broker_protocol_version_invalid";
    case ProtocolError::kFieldCount: return "broker_protocol_field_count_invalid";
    case ProtocolError::kFieldName: return "broker_protocol_field_name_invalid";
    case ProtocolError::kFieldValue: return "broker_protocol_field_value_invalid";
    case ProtocolError::kFieldOrder: return "broker_protocol_field_order_invalid";
    case ProtocolError::kDuplicateField: return "broker_protocol_field_duplicate";
    case ProtocolError::kTrailingBytes: return "broker_protocol_trailing_bytes";
    case ProtocolError::kMissingField: return "broker_protocol_field_missing";
    case ProtocolError::kUnknownField: return "broker_protocol_field_unknown";
    case ProtocolError::kInvalidValue: return "broker_protocol_value_invalid";
  }
  return "broker_protocol_unknown_error";
}

}  // namespace supermega::postgres17
