#include "postgres17_execution_broker_protocol.hpp"

#include <algorithm>
#include <cassert>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

using supermega::postgres17::ApprovalResult;
using supermega::postgres17::BrokerConfig;
using supermega::postgres17::ConfigResult;
using supermega::postgres17::Field;
using supermega::postgres17::Message;
using supermega::postgres17::ParseApproval;
using supermega::postgres17::ParseBrokerConfig;
using supermega::postgres17::ParseEnvelope;
using supermega::postgres17::ProtocolError;
using supermega::postgres17::SerializeEnvelope;

namespace {

std::vector<Field> ValidConfigFields() {
  return {
      {"contract", "supermega.postgres17-windows-broker-request.v1"},
      {"sessionId", "11111111111111111111111111111111"},
      {"sourceRoot", "C:\\source\\pgsql"},
      {"stageParent", "C:\\supermega-staging"},
      {"stageLeaf", "supermega-pg17-11111111111111111111111111111111"},
      {"ownerSid", "S-1-5-80-12345"},
      {"requestorSid", "S-1-5-21-67890"},
      {"daclSddl", "O:S-1-5-80-12345D:P(A;;FA;;;S-1-5-80-12345)"},
      {"daclSha256", std::string(64, '2')},
      {"pythonRelative", "python/python.exe"},
      {"timeoutMs", "300000"},
      {"approvalReadHandle", "0000000000000011"},
      {"evidenceWriteHandle", "0000000000000012"},
      {"childStdinHandle", "0000000000000013"},
      {"childStdoutHandle", "0000000000000014"},
      {"fileCount", "2"},
      {"file.000.role", "python"},
      {"file.000.relativePath", "python/python.exe"},
      {"file.000.bytes", "14"},
      {"file.000.sha256", std::string(64, '3')},
      {"file.001.role", "postgres"},
      {"file.001.relativePath", "pgsql/bin/postgres.exe"},
      {"file.001.bytes", "16"},
      {"file.001.sha256", std::string(64, '4')},
      {"argumentCount", "2"},
      {"argument.000", "-I"},
      {"argument.001", "runner.py"},
  };
}

Message Parsed(std::vector<Field> fields) {
  const auto bytes = SerializeEnvelope(std::move(fields));
  assert(!bytes.empty());
  const auto parsed = ParseEnvelope(bytes);
  assert(parsed.ok());
  return parsed.message;
}

void Replace(std::vector<Field>* fields, const std::string& name,
             std::string value) {
  const auto found = std::find_if(
      fields->begin(), fields->end(), [&name](const Field& field) {
        return field.name == name;
      });
  assert(found != fields->end());
  found->value = std::move(value);
}

void RejectConfig(std::vector<Field> fields) {
  assert(!ParseBrokerConfig(Parsed(std::move(fields))).ok());
}

}  // namespace

int main() {
  const auto valid_bytes = SerializeEnvelope(ValidConfigFields());
  assert(!valid_bytes.empty());
  const auto envelope = ParseEnvelope(valid_bytes);
  assert(envelope.ok());
  const ConfigResult valid = ParseBrokerConfig(envelope.message);
  assert(valid.ok());
  assert(valid.config.files.size() == 2);
  assert(valid.config.arguments.size() == 2);

  for (std::size_t size = 0; size < valid_bytes.size(); ++size) {
    std::vector<std::uint8_t> truncated(valid_bytes.begin(),
                                        valid_bytes.begin() + size);
    assert(!ParseEnvelope(truncated).ok());
  }
  auto trailing = valid_bytes;
  trailing.push_back(0);
  assert(ParseEnvelope(trailing).error == ProtocolError::kTrailingBytes);
  auto wrong_magic = valid_bytes;
  wrong_magic[0] ^= 1;
  assert(ParseEnvelope(wrong_magic).error == ProtocolError::kMagic);
  auto wrong_version = valid_bytes;
  wrong_version[8] = 2;
  assert(ParseEnvelope(wrong_version).error == ProtocolError::kVersion);

  auto fields = ValidConfigFields();
  fields.push_back({"unknown", "value"});
  RejectConfig(fields);
  fields = ValidConfigFields();
  fields.erase(fields.begin());
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "sessionId", std::string(31, '1'));
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "stageLeaf", "unbound-stage");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "ownerSid", "S-1-5-21-67890");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "pythonRelative", "../python.exe");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "file.001.relativePath", "PYTHON/PYTHON.EXE");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "file.001.relativePath", "pgsql/bin/postgres.exe:evil");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "timeoutMs", "300001");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "approvalReadHandle", "0000000000000012");
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "file.000.sha256", std::string(64, 'G'));
  RejectConfig(fields);
  fields = ValidConfigFields();
  Replace(&fields, "fileCount", "3");
  RejectConfig(fields);

  Message approval = Parsed({
      {"contract", "supermega.postgres17-windows-broker-approval.v1"},
      {"sessionId", "11111111111111111111111111111111"},
      {"preparedDigest", std::string(64, '5')},
      {"decision", "approve"},
  });
  ApprovalResult approved = ParseApproval(
      approval, "11111111111111111111111111111111", std::string(64, '5'));
  assert(approved.ok() && approved.approved);
  approval = Parsed({
      {"contract", "supermega.postgres17-windows-broker-approval.v1"},
      {"sessionId", "11111111111111111111111111111111"},
      {"preparedDigest", std::string(64, '6')},
      {"decision", "approve"},
  });
  assert(!ParseApproval(approval, "11111111111111111111111111111111",
                        std::string(64, '5')).ok());
  approval = Parsed({
      {"contract", "supermega.postgres17-windows-broker-approval.v1"},
      {"sessionId", "11111111111111111111111111111111"},
      {"preparedDigest", std::string(64, '5')},
      {"decision", "deny"},
  });
  approved = ParseApproval(approval, "11111111111111111111111111111111",
                           std::string(64, '5'));
  assert(approved.ok() && !approved.approved);

  std::cout << "postgres17_execution_broker_protocol_tests=pass\n";
  return 0;
}
