#ifndef RUNNER_CONNECTED_SECURITY_STORE_H_
#define RUNNER_CONNECTED_SECURITY_STORE_H_

#include <windows.h>

#include <cstdint>
#include <filesystem>
#include <optional>
#include <string>
#include <vector>

namespace supermega::connected_security {

// These records mirror the Dart enrollment recovery boundary. They are only
// storage contracts: this source does not claim that Windows CNG can satisfy
// the required persistent, non-exportable Ed25519 signing contract.
struct PendingIdentityRecord {
  std::string alias;
  std::string request_digest;
  std::string preparation_handle;
  std::string pending_expires_at;
};

struct CommittedIdentityRecord {
  std::string alias;
  std::string request_digest;
  std::string bundle_digest;
  std::string signing_key_id;
  std::string signing_public_key_base64;
  std::string signing_public_key_fingerprint_sha256;
  std::string tls_certificate_fingerprint_sha256;
  std::string sealed_tls_material_id;
};

enum class PreparationState { kMissing, kPending, kCommitted, kExpired };

struct PreparationStatus {
  PreparationState state = PreparationState::kMissing;
  std::optional<PendingIdentityRecord> pending;
  std::optional<CommittedIdentityRecord> committed;
};

class IdentityMetadataStore {
 public:
  virtual ~IdentityMetadataStore() = default;
  virtual bool SavePendingExclusive(const PendingIdentityRecord& record) = 0;
  virtual PreparationStatus Reconcile(const std::string& alias,
                                      const std::string& request_digest) = 0;
  virtual bool CommitExact(const PendingIdentityRecord& pending,
                           const CommittedIdentityRecord& committed) = 0;
  virtual bool AbortPendingExact(const std::string& alias,
                                 const std::string& preparation_handle,
                                 const std::string& request_digest) = 0;
  virtual bool DeleteCommittedExact(const std::string& alias,
                                    const std::string& request_digest) = 0;
};

class PersistentEd25519KeyStore {
 public:
  virtual ~PersistentEd25519KeyStore() = default;
  virtual bool PrepareNonExportable(const std::string& alias,
                                    std::string* key_id,
                                    std::vector<uint8_t>* public_key) = 0;
  virtual bool Sign(const std::string& key_id,
                    const std::vector<uint8_t>& payload,
                    std::vector<uint8_t>* signature) = 0;
  virtual bool DeleteExact(const std::string& key_id) = 0;
};

// Mutable sensitive bytes. Destruction and reset overwrite the retained copy.
class SecureBytes {
 public:
  SecureBytes() = default;
  explicit SecureBytes(std::vector<uint8_t> bytes);
  SecureBytes(const SecureBytes&) = delete;
  SecureBytes& operator=(const SecureBytes&) = delete;
  SecureBytes(SecureBytes&& other) noexcept;
  SecureBytes& operator=(SecureBytes&& other) noexcept;
  ~SecureBytes();

  const std::vector<uint8_t>& bytes() const { return bytes_; }
  bool empty() const { return bytes_.empty(); }
  void Reset();

 private:
  std::vector<uint8_t> bytes_;
};

// A narrowly scoped DPAPI CurrentUser store for future issuer-provided TLS
// material. It refuses reparse points, locks the root DACL to the current user
// and SYSTEM, and never supplies signing-key behavior.
class DpapiCurrentUserStore {
 public:
  static std::optional<DpapiCurrentUserStore> Open();

  DpapiCurrentUserStore(const DpapiCurrentUserStore&) = delete;
  DpapiCurrentUserStore& operator=(const DpapiCurrentUserStore&) = delete;
  DpapiCurrentUserStore(DpapiCurrentUserStore&&) noexcept = default;
  DpapiCurrentUserStore& operator=(DpapiCurrentUserStore&&) noexcept = default;

  bool SealTlsMaterial(const std::string& alias,
                       const std::string& material_id,
                       const std::vector<uint8_t>& plaintext) const;
  std::optional<SecureBytes> OpenTlsMaterial(
      const std::string& alias, const std::string& material_id) const;
  bool DeleteTlsMaterial(const std::string& alias,
                         const std::string& material_id) const;

  const std::filesystem::path& root() const { return root_; }

 private:
  explicit DpapiCurrentUserStore(std::filesystem::path root);

  std::optional<std::filesystem::path> MaterialPath(
      const std::string& alias, const std::string& material_id) const;
  std::vector<uint8_t> Entropy(const std::string& alias,
                               const std::string& material_id) const;

  std::filesystem::path root_;
};

// Fail-closed capability probe. It remains false until exact pinned-SDK
// compilation and installed-Windows signing tests prove a persistent,
// non-exportable Ed25519 key path.
bool SupportsPersistentNonExportableEd25519();

}  // namespace supermega::connected_security

#endif  // RUNNER_CONNECTED_SECURITY_STORE_H_
